// ============================================
// routes/performance.js — /api/performance
// Performance (k6) authoring: a script library, scenarios (script + load
// profile + thresholds), local runs of up to 20 virtual users, and push to
// Continuum once a scenario is stable.
// ============================================
const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { parseJson, stringifyJson } = require('../lib/helpers')
const { authMiddleware } = require('../middleware/auth')
const { checkContinuumEnabled } = require('../middleware/license')
const k6Tool = require('../services/k6/k6Tool')
const { convert } = require('../services/k6/k6Converter')
const { harToTraffic } = require('../services/k6/harImport')
const { MAX_LOCAL_VUS, validateLoad } = require('../services/k6/k6Load')
const perf = require('../services/k6/perfService')
const runner = require('../services/k6/perfRunner')
const { pushPerfScenario } = require('../services/continuumService')

const MAX_SCRIPT_BYTES = 512 * 1024
const SCRIPT_TYPES = ['http', 'browser']
const { httpError } = perf

function handle (fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'That name is already used; pick another' })
      if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Not found' })
      if (err.status) return res.status(err.status).json({ success: false, message: err.message, detail: err.detail })
      console.error('[performance]', err)
      res.status(500).json({ success: false, message: err.message || 'Request failed' })
    }
  }
}

function cleanName (v, what = 'Name') {
  const name = String(v ?? '').trim()
  if (!name) throw httpError(400, `${what} is required`)
  if (name.length > 120) throw httpError(400, `${what} must be 120 characters or fewer`)
  return name
}

function cleanScript (v) {
  if (typeof v !== 'string' || !v.trim()) throw httpError(400, 'The script is empty')
  if (Buffer.byteLength(v) > MAX_SCRIPT_BYTES) throw httpError(413, 'Script is larger than 512 KB')
  return v
}

function cleanType (v) {
  const t = v || 'http'
  if (!SCRIPT_TYPES.includes(t)) throw httpError(400, 'Script type must be http or browser')
  return t
}

const TEMPLATES = {
  http: {
    envVars: [{ key: 'BASE_URL', value: 'https://example.com', sensitive: false }],
    script: `// HTTP load test. Replace the requests with your journey.
import http from 'k6/http'
import { check, group, sleep } from 'k6'

// Aurora's scenario sets the load at run time; these defaults suit a smoke run.
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: { http_req_failed: ['rate<0.01'] }
}

const BASE_URL = __ENV.BASE_URL || 'https://example.com'
const THINK_TIME = Number(__ENV.THINK_TIME || 1)

export default function () {
  group('Home', () => {
    const res = http.get(\`\${BASE_URL}/\`, { tags: { name: 'GET /' } })
    check(res, { 'home is 200': r => r.status === 200 })
  })
  sleep(THINK_TIME)
}
`
  },
  browser: {
    envVars: [{ key: 'BASE_URL', value: 'https://example.com', sensitive: false }],
    script: `// Browser load test: each virtual user drives a real (headless) Chromium.
// Browser users are heavy; a handful is usually enough alongside HTTP load.
import { browser } from 'k6/browser'
import { check } from 'k6'

export const options = {
  scenarios: {
    ui: { executor: 'shared-iterations', vus: 1, iterations: 1, options: { browser: { type: 'chromium' } } }
  }
}

const BASE_URL = __ENV.BASE_URL || 'https://example.com'

export default async function () {
  const page = await browser.newPage()
  try {
    await page.goto(BASE_URL)
    const title = await page.title()
    check(title, { 'page has a title': t => t.length > 0 })
  } finally {
    await page.close()
  }
}
`
  }
}

router.use(authMiddleware)

// ── settings ──────────────────────────────────────────────────────────────

router.get('/settings', handle(async (req, res) => {
  res.json({ success: true, settings: await perf.getSettings(), maxLocalVus: MAX_LOCAL_VUS, k6: k6Tool.status() })
}))

router.put('/settings', handle(async (req, res) => {
  res.json({ success: true, settings: await perf.saveSettings(req.body || {}) })
}))

// ── scripts ───────────────────────────────────────────────────────────────

router.get('/scripts', handle(async (req, res) => {
  const scripts = await prisma.perfScript.findMany({ orderBy: { updatedAt: 'desc' }, include: { _count: { select: { scenarios: true } } } })
  res.json({ success: true, scripts: scripts.map(s => perf.scriptOut(s, { withScript: false })) })
}))

router.get('/scripts/:id', handle(async (req, res) => {
  const s = await prisma.perfScript.findUnique({ where: { id: req.params.id }, include: { scenarios: { select: { id: true, name: true } } } })
  if (!s) throw httpError(404, 'Script not found')
  res.json({ success: true, script: { ...perf.scriptOut(s), scenarios: s.scenarios } })
}))

// POST /scripts — { name, description?, scriptType?, script?, envVars?, template?, source? }
// With no script, starts from the template for the script type.
router.post('/scripts', handle(async (req, res) => {
  const b = req.body || {}
  const scriptType = cleanType(b.scriptType)
  const tpl = TEMPLATES[scriptType]
  const usingTemplate = typeof b.script !== 'string' || !b.script.trim()
  const s = await prisma.perfScript.create({
    data: {
      name: cleanName(b.name),
      description: String(b.description || ''),
      scriptType,
      script: usingTemplate ? tpl.script : cleanScript(b.script),
      envVarsJson: await perf.encodeEnvVars(usingTemplate && !b.envVars ? tpl.envVars : b.envVars),
      source: usingTemplate ? 'template' : (['recording', 'har', 'manual'].includes(b.source) ? b.source : 'manual')
    }
  })
  res.status(201).json({ success: true, script: perf.scriptOut(s) })
}))

// POST /scripts/from-har — { har, name, thinkTimeSec?, includeHosts? }
router.post('/scripts/from-har', handle(async (req, res) => {
  const b = req.body || {}
  const name = cleanName(b.name)
  let parsed
  try {
    parsed = harToTraffic(b.har)
  } catch (err) {
    throw httpError(err.status || 422, err.status ? err.message : 'The file could not be read as a HAR (JSON) file')
  }
  if (!parsed.traffic.length) throw httpError(422, 'The HAR file has no page loads or API calls to build a test from')
  const result = convert(parsed.traffic, {
    startUrl: parsed.startUrl,
    name,
    thinkTimeSec: b.thinkTimeSec ?? 1,
    includeHosts: Array.isArray(b.includeHosts) && b.includeHosts.length ? b.includeHosts : null
  })
  if (!result.summary.kept) throw httpError(422, 'Every request in the HAR was filtered out (static files, analytics, other sites). Nothing to test.', result.summary.skipped)
  const s = await prisma.perfScript.create({
    data: {
      name,
      description: `Built from a HAR file: ${result.summary.kept} of ${result.summary.captured} requests kept`,
      scriptType: 'http',
      script: result.script,
      envVarsJson: await perf.encodeEnvVars(result.envVars),
      source: 'har'
    }
  })
  res.status(201).json({ success: true, script: perf.scriptOut(s), summary: result.summary, requests: result.requests })
}))

router.put('/scripts/:id', handle(async (req, res) => {
  const b = req.body || {}
  const current = await prisma.perfScript.findUnique({ where: { id: req.params.id } })
  if (!current) throw httpError(404, 'Script not found')
  const data = {}
  if (b.name !== undefined) data.name = cleanName(b.name)
  if (b.description !== undefined) data.description = String(b.description || '')
  if (b.scriptType !== undefined) data.scriptType = cleanType(b.scriptType)
  if (b.script !== undefined) data.script = cleanScript(b.script)
  if (b.envVars !== undefined) data.envVarsJson = await perf.encodeEnvVars(b.envVars, current.envVarsJson)
  const s = await prisma.perfScript.update({ where: { id: current.id }, data })
  res.json({ success: true, script: perf.scriptOut(s) })
}))

router.delete('/scripts/:id', handle(async (req, res) => {
  const used = await prisma.perfScenario.findMany({ where: { scriptId: req.params.id }, select: { name: true } })
  if (used.length) throw httpError(409, `Used by ${used.length === 1 ? 'scenario' : 'scenarios'} ${used.map(u => `"${u.name}"`).join(', ')}. Delete or repoint those first.`)
  await prisma.perfScript.delete({ where: { id: req.params.id } })
  res.json({ success: true })
}))

// POST /scripts/:id/smoke — one VU, one iteration, with the saved variables
router.post('/scripts/:id/smoke', handle(async (req, res) => {
  const s = await prisma.perfScript.findUnique({ where: { id: req.params.id } })
  if (!s) throw httpError(404, 'Script not found')
  const result = await k6Tool.smoke(s.script, await perf.runtimeEnvVars(s.envVarsJson), s.scriptType)
  if (result.notInstalled) throw httpError(409, 'Install k6 first (Settings → Performance).')
  const stored = { ...result, console: String(result.console || '').slice(-16000) }
  await prisma.perfScript.update({ where: { id: s.id }, data: { lastSmokeJson: stringifyJson(stored), lastSmokeAt: new Date() } })
  res.json({ success: true, smoke: stored })
}))

// ── scenarios ─────────────────────────────────────────────────────────────

async function scenarioData (b, { partial = false } = {}) {
  const settings = await perf.getSettings()
  const data = {}
  if (!partial || b.name !== undefined) data.name = cleanName(b.name, 'Scenario name')
  if (!partial || b.description !== undefined) data.description = String(b.description || '')
  if (!partial || b.scriptId !== undefined) {
    if (!b.scriptId) throw httpError(400, 'Choose a script')
    const exists = await prisma.perfScript.findUnique({ where: { id: b.scriptId }, select: { id: true } })
    if (!exists) throw httpError(400, 'That script no longer exists')
    data.scriptId = b.scriptId
  }
  if (!partial || b.load !== undefined) {
    const { load, errors } = validateLoad(b.load || settings.defaultLoad, { cap: settings.maxVus, maxDurationSec: settings.maxDurationMin * 60 })
    if (errors.length) throw httpError(400, errors[0], errors)
    data.loadJson = stringifyJson(load)
  }
  if (!partial || b.thresholds !== undefined) {
    const errors = []
    const t = perf.normaliseThresholds(b.thresholds || settings.defaultThresholds, errors)
    if (errors.length) throw httpError(400, errors[0], errors)
    data.thresholdsJson = stringifyJson(t)
  }
  if (!partial || b.thinkTimeSec !== undefined) {
    const v = b.thinkTimeSec
    if (v === null || v === '' || v === undefined) data.thinkTimeSec = partial ? null : settings.defaultThinkTimeSec
    else {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0 || n > 60) throw httpError(400, 'Think time must be between 0 and 60 seconds')
      data.thinkTimeSec = n
    }
  }
  return data
}

router.get('/scenarios', handle(async (req, res) => {
  const list = await prisma.perfScenario.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { script: { select: { id: true, name: true, scriptType: true } }, runs: { orderBy: { queuedAt: 'desc' }, take: 1 } }
  })
  res.json({ success: true, scenarios: list.map(perf.scenarioOut) })
}))

router.get('/scenarios/:id', handle(async (req, res) => {
  const sc = await prisma.perfScenario.findUnique({
    where: { id: req.params.id },
    include: { script: { select: { id: true, name: true, scriptType: true } }, runs: { orderBy: { queuedAt: 'desc' }, take: 100 } }
  })
  if (!sc) throw httpError(404, 'Scenario not found')
  res.json({
    success: true,
    scenario: perf.scenarioOut(sc),
    runs: sc.runs.map(r => perf.runOut(r, { brief: true })),
    baseline: sc.baselineRunId ? perf.runOut(sc.runs.find(r => r.id === sc.baselineRunId) || await prisma.perfRun.findUnique({ where: { id: sc.baselineRunId } }), { brief: true }) : null
  })
}))

router.post('/scenarios', handle(async (req, res) => {
  const sc = await prisma.perfScenario.create({ data: await scenarioData(req.body || {}), include: { script: true } })
  res.status(201).json({ success: true, scenario: perf.scenarioOut(sc) })
}))

router.put('/scenarios/:id', handle(async (req, res) => {
  const sc = await prisma.perfScenario.update({ where: { id: req.params.id }, data: await scenarioData(req.body || {}, { partial: true }), include: { script: true } })
  res.json({ success: true, scenario: perf.scenarioOut(sc) })
}))

router.delete('/scenarios/:id', handle(async (req, res) => {
  const busy = await prisma.perfRun.count({ where: { scenarioId: req.params.id, status: { in: ['queued', 'running'] } } })
  if (busy) throw httpError(409, 'This scenario has a run queued or in progress; cancel it first')
  await prisma.perfScenario.delete({ where: { id: req.params.id } })
  res.json({ success: true })
}))

router.post('/scenarios/:id/run', handle(async (req, res) => {
  const run = await runner.queueRun(req.params.id)
  res.status(202).json({ success: true, run: perf.runOut(run, { brief: true }) })
}))

// PUT /scenarios/:id/baseline — { runId } or { runId: null } to clear
router.put('/scenarios/:id/baseline', handle(async (req, res) => {
  const runId = req.body?.runId || null
  if (runId) {
    const run = await prisma.perfRun.findUnique({ where: { id: runId } })
    if (!run || run.scenarioId !== req.params.id) throw httpError(400, 'That run does not belong to this scenario')
    if (!['passed', 'failed'].includes(run.status)) throw httpError(400, 'Only a completed run can be the baseline')
  }
  await prisma.perfScenario.update({ where: { id: req.params.id }, data: { baselineRunId: runId } })
  res.json({ success: true, baselineRunId: runId })
}))

// POST /scenarios/:id/push — script, variables (secret values withheld), load and thresholds to Continuum
router.post('/scenarios/:id/push', checkContinuumEnabled, handle(async (req, res) => {
  const sc = await prisma.perfScenario.findUnique({ where: { id: req.params.id }, include: { script: true } })
  if (!sc) throw httpError(404, 'Scenario not found')
  const load = parseJson(sc.loadJson, {})
  const thresholds = parseJson(sc.thresholdsJson, {})
  const vars = perf.publicEnvVars(sc.script.envVarsJson)
  if (sc.thinkTimeSec !== null && !vars.some(v => v.key === 'THINK_TIME')) vars.push({ key: 'THINK_TIME', value: String(sc.thinkTimeSec), sensitive: false })
  const result = await pushPerfScenario({
    name: sc.name,
    description: sc.description || `Authored in Aurora from script "${sc.script.name}"`,
    script: sc.script.script,
    scriptType: sc.script.scriptType,
    envVars: vars,
    workload: {
      name: `${sc.name} load`,
      ...load,
      thresholds: Object.fromEntries(Object.entries(thresholds).filter(([, v]) => v !== null && v !== undefined))
    }
  })
  await prisma.perfScenario.update({ where: { id: sc.id }, data: { pushedAt: new Date() } })
  await prisma.perfScript.update({ where: { id: sc.scriptId }, data: { pushedAt: new Date(), continuumScenarioId: String(result.scenarioId || '') || null } })
  res.json({ success: true, ...result, secretsWithheld: vars.filter(v => v.sensitive).map(v => v.key) })
}))

// ── runs ──────────────────────────────────────────────────────────────────

router.get('/runs', handle(async (req, res) => {
  const where = {}
  if (req.query.scenarioId) where.scenarioId = String(req.query.scenarioId)
  if (req.query.status) where.status = { in: String(req.query.status).split(',') }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const runs = await prisma.perfRun.findMany({ where, orderBy: { queuedAt: 'desc' }, take: limit, include: { scenario: { select: { name: true } } } })
  res.json({ success: true, runs: runs.map(r => perf.runOut(r, { brief: true })), activeRunId: runner.activeRunId() })
}))

router.get('/runs/:id', handle(async (req, res) => {
  const r = await prisma.perfRun.findUnique({ where: { id: req.params.id }, include: { scenario: { select: { name: true, baselineRunId: true } } } })
  if (!r) throw httpError(404, 'Run not found')
  res.json({ success: true, run: { ...perf.runOut(r), isBaseline: r.scenario?.baselineRunId === r.id } })
}))

router.post('/runs/:id/cancel', handle(async (req, res) => {
  res.json({ success: true, ...(await runner.cancelRun(req.params.id)) })
}))

router.delete('/runs/:id', handle(async (req, res) => {
  const r = await prisma.perfRun.findUnique({ where: { id: req.params.id }, include: { scenario: true } })
  if (!r) throw httpError(404, 'Run not found')
  if (['queued', 'running'].includes(r.status)) throw httpError(409, 'Cancel the run before deleting it')
  if (r.scenario.baselineRunId === r.id) await prisma.perfScenario.update({ where: { id: r.scenarioId }, data: { baselineRunId: null } })
  await prisma.perfRun.delete({ where: { id: r.id } })
  res.json({ success: true })
}))

// ── monitoring overview ───────────────────────────────────────────────────

router.get('/overview', handle(async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30))
  const since = new Date(Date.now() - days * 86400000)
  const [scripts, scenarios, runs, active] = await Promise.all([
    prisma.perfScript.count(),
    prisma.perfScenario.findMany({ select: { id: true, name: true, baselineRunId: true, pushedAt: true } }),
    prisma.perfRun.findMany({
      where: { queuedAt: { gte: since } },
      orderBy: { queuedAt: 'asc' },
      select: { id: true, scenarioId: true, status: true, metricsJson: true, comparisonJson: true, loadSnapshotJson: true, queuedAt: true, startedAt: true, finishedAt: true, errorMessage: true }
    }),
    prisma.perfRun.findMany({ where: { status: { in: ['queued', 'running'] } }, select: { id: true } })
  ])
  const names = new Map(scenarios.map(s => [s.id, s.name]))
  const completed = runs.filter(r => r.status === 'passed' || r.status === 'failed')
  const points = completed.map(r => {
    const m = parseJson(r.metricsJson, {})
    const c = r.comparisonJson ? parseJson(r.comparisonJson, null) : null
    return { id: r.id, scenarioId: r.scenarioId, scenarioName: names.get(r.scenarioId), status: r.status, at: r.finishedAt || r.queuedAt, p95: m.p95Duration ?? null, avg: m.avgDuration ?? null, failRate: m.failRate ?? null, reqRate: m.reqRate ?? null, peakVus: m.peakVus ?? null, regressed: !!c?.regressed }
  })
  const latest = new Map()
  for (const p of points) latest.set(p.scenarioId, p)
  res.json({
    success: true,
    days,
    totals: {
      scripts,
      scenarios: scenarios.length,
      runs: runs.length,
      completed: completed.length,
      passed: completed.filter(r => r.status === 'passed').length,
      failed: completed.filter(r => r.status === 'failed').length,
      errors: runs.filter(r => r.status === 'error').length,
      regressions: points.filter(p => p.regressed).length,
      active: active.length,
      pushed: scenarios.filter(s => s.pushedAt).length
    },
    points,
    latest: [...latest.values()].sort((a, b) => String(a.scenarioName).localeCompare(String(b.scenarioName))),
    recent: runs.slice(-15).reverse().map(r => ({ id: r.id, scenarioId: r.scenarioId, scenarioName: names.get(r.scenarioId), status: r.status, at: r.finishedAt || r.startedAt || r.queuedAt, metrics: parseJson(r.metricsJson, {}), regressed: !!(r.comparisonJson && parseJson(r.comparisonJson, {}).regressed), errorMessage: r.errorMessage }))
  })
}))

module.exports = router
module.exports.TEMPLATES = TEMPLATES
