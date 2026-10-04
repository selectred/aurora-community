'use strict'
// ============================================
// services/k6/perfRunner.js
// Runs performance scenarios on this machine with the on-demand k6 binary.
// One run at a time (a laptop running two load tests measures itself), queued
// in the database so the UI can show what's waiting. Script, variables and
// load are snapshotted when the run is queued.
// ============================================
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const readline = require('readline')
const { spawn } = require('child_process')
const prisma = require('../../lib/prisma')
const { parseJson, stringifyJson } = require('../../lib/helpers')
const k6Tool = require('./k6Tool')
const { validateLoad, buildWrapper, parseSummary, createTimeseries, bucketMsFor, compareMetrics, parseProgress } = require('./k6Load')
const { getSettings, runtimeEnvVars, httpError } = require('./perfService')

const CONSOLE_CAP = 128 * 1024
const LIVE_SAVE_MS = 2000
const SYSTEM_TAGS = 'status,method,name,group,check,scenario,expected_response'

let active = null // { runId, proc, cancelRequested }
let draining = false

/** Queue a run of a scenario. Validates the profile against the current limits. */
async function queueRun (scenarioId) {
  if (!k6Tool.status().installed) throw httpError(409, 'Install k6 first (Settings → Performance).')
  const sc = await prisma.perfScenario.findUnique({ where: { id: scenarioId }, include: { script: true } })
  if (!sc) throw httpError(404, 'Scenario not found')
  const settings = await getSettings()
  const { load, errors } = validateLoad(parseJson(sc.loadJson, {}), { cap: settings.maxVus, maxDurationSec: settings.maxDurationMin * 60 })
  if (errors.length) throw httpError(400, errors[0], errors)
  const pending = await prisma.perfRun.count({ where: { status: { in: ['queued', 'running'] } } })
  if (pending >= 10) throw httpError(429, 'Ten runs are already waiting; let some finish first')

  const run = await prisma.perfRun.create({
    data: {
      scenarioId: sc.id,
      status: 'queued',
      scriptSnapshot: sc.script.script,
      scriptType: sc.script.scriptType,
      loadSnapshotJson: stringifyJson(load),
      thresholdsSnapshotJson: sc.thresholdsJson || '{}'
    },
    include: { scenario: true }
  })
  setImmediate(drain)
  return run
}

async function drain () {
  if (draining) return
  draining = true
  try {
    for (;;) {
      const next = await prisma.perfRun.findFirst({ where: { status: 'queued' }, orderBy: { queuedAt: 'asc' } })
      if (!next) break
      await execute(next.id).catch(err => console.error('[perf] run failed unexpectedly:', err))
    }
  } finally {
    draining = false
  }
}

async function finish (runId, data) {
  return prisma.perfRun.update({ where: { id: runId }, data: { finishedAt: new Date(), liveJson: null, ...data } })
}

async function execute (runId) {
  const run = await prisma.perfRun.findUnique({ where: { id: runId }, include: { scenario: { include: { script: true } } } })
  if (!run || run.status !== 'queued') return
  const settings = await getSettings()
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aurora-perf-'))
  active = { runId, proc: null, cancelRequested: false }
  try {
    await prisma.perfRun.update({ where: { id: runId }, data: { status: 'running', startedAt: new Date(), liveJson: stringifyJson({ elapsed: '0s', vus: 0, iterations: 0, pct: 0 }) } })

    const load = parseJson(run.loadSnapshotJson, {})
    const thresholds = parseJson(run.thresholdsSnapshotJson, {})
    await fsp.writeFile(path.join(workDir, 'scenario.js'), run.scriptSnapshot)
    await fsp.writeFile(path.join(workDir, 'run.js'), buildWrapper(load, thresholds, run.scriptType))

    const vars = await runtimeEnvVars(run.scenario.script.envVarsJson)
    const think = run.scenario.thinkTimeSec
    if (think !== null && think !== undefined) vars.push({ key: 'THINK_TIME', value: String(think) })
    const summaryPath = path.join(workDir, 'summary.json')
    const rawPath = path.join(workDir, 'raw.json.gz')
    const args = [
      'run', '--summary-export', summaryPath, '--out', `json=${rawPath}`, '--system-tags', SYSTEM_TAGS,
      ...vars.filter(v => v.key).flatMap(v => ['--env', `${v.key}=${v.value ?? ''}`]),
      path.join(workDir, 'run.js')
    ]
    const env = { ...process.env, ...(run.scriptType === 'browser' ? k6Tool.browserEnv() : {}) }

    const result = await new Promise(resolve => {
      const proc = spawn(k6Tool.binaryPath(), args, { env, cwd: workDir })
      active.proc = proc
      let log = ''
      let live = {}
      let lastSave = 0
      let partial = ''
      let liveWrite = Promise.resolve()
      const onData = d => {
        const s = d.toString()
        log += s
        if (log.length > CONSOLE_CAP * 2) log = log.slice(-CONSOLE_CAP)
        const lines = (partial + s).split(/\r?\n/)
        partial = lines.pop()
        let changed = false
        for (const line of lines) {
          const p = parseProgress(line, live)
          if (p) { live = p; changed = true }
        }
        const now = Date.now()
        if (changed && now - lastSave > LIVE_SAVE_MS) {
          lastSave = now
          const snapshot = stringifyJson(live)
          liveWrite = liveWrite.then(() => prisma.perfRun.update({ where: { id: runId }, data: { liveJson: snapshot } })).catch(() => {})
        }
      }
      proc.stdout.on('data', onData)
      proc.stderr.on('data', onData)
      proc.on('error', e => resolve({ code: null, log: `${log}\n${e.message}`, spawnError: e.message }))
      // Let any progress write land before the result is saved over it.
      proc.on('close', (code, signal) => liveWrite.then(() => resolve({ code, signal, log })))
    })

    const consoleLog = result.log.slice(-CONSOLE_CAP)
    if (result.spawnError) return await finish(runId, { status: 'error', errorMessage: `Could not start k6: ${result.spawnError}`, consoleLog })
    // k6 handles SIGTERM itself and can exit 0, so the flag decides, not the code.
    if (active.cancelRequested) return await finish(runId, { status: 'cancelled', errorMessage: 'Run cancelled', consoleLog, exitCode: result.code })

    let summary = null
    try { summary = JSON.parse(await fsp.readFile(summaryPath, 'utf8')) } catch { /* k6 failed before writing it */ }
    if (!(result.code === 0 || result.code === 99) || !summary) {
      return await finish(runId, { status: 'error', errorMessage: summary ? `k6 exited ${result.code}` : `k6 exited ${result.code} without results; see the console output`, consoleLog, exitCode: result.code })
    }

    const { metrics, thresholds: thresholdResults } = parseSummary(summary, run.scriptType)
    const timeseries = await readTimeseries(rawPath, bucketMsFor(load)).catch(() => [])
    const failedChecks = (metrics.checksFailed || 0) > 0
    const passed = result.code === 0 && thresholdResults.every(t => t.passed)

    let comparison = null
    const baseline = run.scenario.baselineRunId && await prisma.perfRun.findUnique({ where: { id: run.scenario.baselineRunId } })
    if (baseline && sameLoad(baseline.loadSnapshotJson, run.loadSnapshotJson)) {
      comparison = compareMetrics(metrics, parseJson(baseline.metricsJson, {}), { tolerancePct: settings.regressionTolerancePct, failRatePts: settings.regressionFailRatePts })
      if (comparison) comparison.baselineRunId = baseline.id
    }

    await finish(runId, {
      status: passed ? 'passed' : 'failed',
      exitCode: result.code,
      consoleLog,
      metricsJson: stringifyJson({ ...metrics, failedChecks }),
      thresholdResultsJson: stringifyJson(thresholdResults),
      timeseriesJson: stringifyJson(timeseries),
      comparisonJson: comparison ? stringifyJson(comparison) : null
    })
    await prune(run.scenarioId, settings.keepRunsPerScenario, run.scenario.baselineRunId)
  } catch (err) {
    await finish(runId, { status: 'error', errorMessage: err.message }).catch(() => {})
  } finally {
    active = null
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

function sameLoad (a, b) {
  return JSON.stringify(parseJson(a, {})) === JSON.stringify(parseJson(b, {}))
}

async function readTimeseries (rawPath, bucketMs) {
  if (!fs.existsSync(rawPath)) return []
  const ts = createTimeseries(bucketMs ? { bucketMs } : {})
  const rl = readline.createInterface({ input: fs.createReadStream(rawPath).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) ts.add(line)
  return ts.result()
}

// Keep the newest N finished runs per scenario, and always the baseline.
async function prune (scenarioId, keep, baselineRunId) {
  const old = await prisma.perfRun.findMany({
    where: { scenarioId, status: { notIn: ['queued', 'running'] } },
    orderBy: { queuedAt: 'desc' },
    skip: keep,
    select: { id: true }
  })
  const ids = old.map(r => r.id).filter(id => id !== baselineRunId)
  if (ids.length) await prisma.perfRun.deleteMany({ where: { id: { in: ids } } })
}

async function cancelRun (runId) {
  const run = await prisma.perfRun.findUnique({ where: { id: runId } })
  if (!run) throw httpError(404, 'Run not found')
  if (run.status === 'queued') {
    await finish(runId, { status: 'cancelled', errorMessage: 'Cancelled before it started' })
    return { cancelled: true }
  }
  if (run.status === 'running' && active?.runId === runId) {
    active.cancelRequested = true
    active.proc?.kill('SIGTERM')
    // k6 normally stops within its graceful-stop window; make sure it does.
    const proc = active.proc
    setTimeout(() => { try { proc?.kill('SIGKILL') } catch { /* already gone */ } }, 35000).unref()
    return { cancelling: true }
  }
  throw httpError(409, `This run has already ${run.status === 'running' ? 'stopped' : 'finished'}`)
}

/** On start-up: runs left "running" by a restart can't be resumed. */
async function recover () {
  const n = await prisma.perfRun.updateMany({
    where: { status: 'running' },
    data: { status: 'error', errorMessage: 'Aurora stopped while this run was in progress', finishedAt: new Date(), liveJson: null }
  })
  if (n.count) console.log(`[perf] marked ${n.count} interrupted run(s) as errors`)
  setImmediate(drain)
}

function activeRunId () {
  return active?.runId || null
}

module.exports = { queueRun, cancelRun, recover, activeRunId, readTimeseries }
