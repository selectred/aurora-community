'use strict'
const axios = require('axios')
const crypto = require('crypto')
const prisma = require('../lib/prisma')

/**
 * Push terminal test results to Aurora Continuum via the standard imports endpoint.
 * Uses the flat-array Aurora reporter format that Continuum's Playwright parser handles natively.
 * No-ops silently if Continuum is disabled or not configured.
 *
 * @param {object} opts
 * Results carry the traceability Continuum reports on: initiative → feature →
 * test pack → result. Continuum matches the feature and initiative by name
 * against what syncPipeline() registered.
 *
 * @param {string} opts.specName   - Spec / test name (used as suite label)
 * @param {string} opts.url        - Target URL under test
 * @param {Array}  opts.results    - Array of { title, ok, error, testType? } from the runner
 * @param {string} [opts.environment] - 'staging' | 'production' | etc.
 * @param {string} [opts.featureName] - Feature the pack belongs to (falls back to specName)
 * @param {string} [opts.initiative]  - Initiative the feature belongs to
 * @param {string} [opts.testType]    - Default type for results without one: 'functional' | 'api'
 */
async function pushResults({ specName, url, results, environment = 'staging', initiative = null, teamName = null, packName = null, featureName = null, testType = null }) {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
  })

  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
    return null
  }

  const baseUrl = settings.continuumUrl.replace(/\/$/, '')
  const executionId = crypto.randomUUID()

  // Flat array format — matches the Aurora-internal reporter path in Continuum's playwrightParser
  const content = results.map(r => ({
    title: r.title,
    status: r.ok ? 'passed' : 'failed',
    duration_ms: 0,
    suite: specName,
    test_type: r.testType || testType || undefined,
    error: r.ok ? undefined : (r.error || undefined)
  }))

  const response = await axios.post(
    `${baseUrl}/api/imports/results`,
    {
      format: 'playwright',
      content,
      metadata: {
        tool: 'aurora',
        environment,
        product: url || null,
        feature: featureName || specName || null,
        ...(initiative ? { initiative } : {}),
        ...(teamName ? { team: teamName } : {}),
        executionId,
        packName: packName || specName || null
      }
    },
    {
      headers: { 'X-API-Key': settings.continuumApiKey },
      timeout: 10000
    }
  )

  return { pushed: response.data?.count ?? content.length }
}

/**
 * Push Aurora's full initiative → feature structure to Continuum to register pipelines.
 * Call this from Settings to ensure Continuum knows about all initiatives before any test runs.
 */
async function syncPipeline() {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
  })

  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
    return { skipped: true }
  }

  const initiatives = await prisma.strategicInitiative.findMany({
    where: { isActive: true },
    include: { features: { select: { name: true } } },
    orderBy: { name: 'asc' }
  })

  const baseUrl = settings.continuumUrl.replace(/\/$/, '')
  const payload = initiatives.map(i => ({
    name: i.name,
    features: i.features.map(f => f.name)
  }))

  const response = await axios.post(
    `${baseUrl}/api/integration/aurora/sync`,
    { initiatives: payload },
    {
      headers: { 'X-API-Key': settings.continuumApiKey },
      timeout: 10000
    }
  )

  return { synced: true, created: response.data?.created ?? 0, total: payload.length }
}

// Resolve a spec's code from storage (file-backed specs keep it on disk)
function readSpecCode (spec, packsRootDir) {
  if (spec.generatedCode) return spec.generatedCode
  if (spec.codeStorage === 'file' && spec.codeFilePath) {
    try {
      const fs = require('fs')
      const path = require('path')
      const absPath = path.isAbsolute(spec.codeFilePath)
        ? spec.codeFilePath
        : path.join(packsRootDir || '', spec.codeFilePath)
      return fs.readFileSync(absPath, 'utf8')
    } catch { /* file missing */ }
  }
  return ''
}

/**
 * How often a monitor runs, in minutes, from the spec's schedule. Aurora stores
 * it as a cron expression; only the simple "every N minutes" and "hourly" forms
 * are used. Continuum rounds to its nearest allowed interval.
 */
function monitorInterval (schedule) {
  const s = String(schedule || '').trim()
  let m = s.match(/^\*\/(\d+) \* \* \* \*$/)
  if (m) return Number(m[1])
  if (s === '* * * * *') return 1
  if (/^\d+ \* \* \* \*$/.test(s)) return 60
  return 30
}

// What sync-spec sends as `monitor`: the interval for a test marked as a
// monitor, null otherwise (which pauses a monitor that Aurora set up)
function specMonitor (spec) {
  // Continuum owns how many failed checks raise an alert, and the webhooks
  return spec.isSynthetic && spec.enabled !== false ? { intervalMinutes: monitorInterval(spec.schedule) } : null
}

/**
 * Push one spec to Continuum when it is marked or unmarked as a monitor, so
 * Continuum starts or stops running it. Never throws: returns
 * { synced: true } | { synced: false, reason }.
 */
async function syncMonitor (specId) {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true, packsRootDir: true }
  })
  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
    return { synced: false, reason: 'Continuum is not connected, so the monitor will start when you connect it and push the pack.' }
  }
  const spec = await prisma.agentTestSpec.findUnique({
    where: { specId },
    include: { testPacks: { include: { testPack: { include: { feature: { include: { initiative: true } } } } }, take: 1 } }
  })
  if (!spec) return { synced: false, reason: 'Spec not found' }
  const code = readSpecCode(spec, settings.packsRootDir)
  if (!code) return { synced: false, reason: 'The test has no generated code yet' }

  // Same project key and repository as a push of its pack, so pack variables resolve
  const pack = spec.testPacks[0]?.testPack
  const projectKey = pack ? (pack.name || pack.id).toLowerCase().replace(/[^a-z0-9-]/g, '-') : undefined
  const repository = pack ? (pack.feature?.initiative?.name || pack.name) : undefined
  let plainVars = {}
  if (pack) {
    const rows = await prisma.packVariable.findMany({ where: { testPackId: pack.id, sensitive: false } })
    plainVars = Object.fromEntries(rows.map(v => [v.name, v.value]))
  }
  const { substituteVariables } = require('../controllers/agentTestsController')

  try {
    await axios.post(
      `${settings.continuumUrl.replace(/\/$/, '')}/api/integration/aurora/sync-spec`,
      {
        specId: spec.specId,
        name: spec.name,
        spec: substituteVariables(code, plainVars),
        targetUrl: spec.url || '',
        pillars: ['reliability'],
        projectKey,
        repository,
        monitor: specMonitor(spec)
      },
      { headers: { 'X-API-Key': settings.continuumApiKey }, timeout: 15000 }
    )
    return { synced: true }
  } catch (e) {
    return { synced: false, reason: `Continuum: ${e.response?.data?.message || e.message}` }
  }
}

/**
 * Push all ready specs in a pack to Continuum's spec library for remote execution.
 * Calls POST /api/integration/aurora/sync-spec for each spec with generated code.
 *
 * @param {string} packId
 * @returns {{ pushed: number, skipped: number, errors: Array }}
 */
async function syncPackToContinuum(packId) {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true, packsRootDir: true }
  })

  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
    throw new Error('Continuum is not configured — go to Settings → Continuum to set it up')
  }

  const pack = await prisma.testPack.findUnique({
    where: { id: packId },
    include: {
      tests: { include: { spec: true } },
      feature: { include: { initiative: true } }
    }
  })

  if (!pack) throw new Error('Pack not found')

  const baseUrl = settings.continuumUrl.replace(/\/$/, '')
  const projectKey = (pack.name || packId).toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const repository = pack.feature?.initiative?.name || pack.name || 'aurora'
  const packsRootDir = settings.packsRootDir || ''

  // Split pack variables into sensitive (pushed encrypted to Continuum) and plain (substituted inline)
  const { substituteVariables } = require('../controllers/agentTestsController')
  const { encrypt: auroraEncrypt, decrypt: auroraDecrypt } = require('../lib/encryption')

  const allVarRows = await prisma.packVariable.findMany({ where: { testPackId: packId } })
  const encKey = (await prisma.appSettings.findFirst({ select: { encryptionKey: true } }))?.encryptionKey

  const plainVars     = {} // substituted inline — not sensitive
  const sensitiveVars = [] // pushed to Continuum encrypted endpoint

  for (const v of allVarRows) {
    let value = v.value
    if (v.sensitive && encKey) {
      try { value = auroraDecrypt(value, encKey) } catch { /* skip if decrypt fails */ }
    }
    if (v.sensitive) {
      sensitiveVars.push({ name: v.name, value })
    } else {
      plainVars[v.name] = value
    }
  }

  const results = { pushed: 0, skipped: 0, errors: [] }

  for (const packTest of pack.tests) {
    const spec = packTest.spec
    if (!spec) { results.skipped++; continue }

    let code = readSpecCode(spec, packsRootDir)
    if (!code) { results.skipped++; continue }

    // Substitute only non-sensitive variables inline; sensitive ones stay as {{PLACEHOLDER}}
    code = substituteVariables(code, plainVars)

    try {
      await axios.post(
        `${baseUrl}/api/integration/aurora/sync-spec`,
        {
          specId: spec.specId,
          name: spec.name,
          spec: code,
          targetUrl: spec.url || '',
          pillars: ['reliability'],
          projectKey,
          repository,
          monitor: specMonitor(spec)
        },
        {
          headers: { 'X-API-Key': settings.continuumApiKey },
          timeout: 15000
        }
      )
      results.pushed++
    } catch (e) {
      results.errors.push({ specId: spec.specId, name: spec.name, error: e.response?.data?.message || e.message })
    }
  }

  // Push sensitive variables to Continuum's encrypted store (over TLS; Continuum re-encrypts at rest)
  if (sensitiveVars.length > 0) {
    try {
      await axios.post(
        `${baseUrl}/api/integration/aurora/sync-variables`,
        { packKey: projectKey, variables: sensitiveVars },
        { headers: { 'X-API-Key': settings.continuumApiKey }, timeout: 10000 }
      )
      results.secretsPushed = sensitiveVars.length
    } catch (e) {
      results.secretsError = e.response?.data?.message || e.message
    }
  }

  return results
}

/**
 * Push a k6 load test to Continuum's performance module as a scenario for the
 * team that owns the integration key. Re-pushing the same name updates it.
 * Throws with a readable message; the caller shows it.
 */
// `workload` (optional) is a load profile in Continuum's PerfWorkload shape plus
// thresholds; Continuum saves it as the scenario's default load.
async function pushPerfScenario({ name, description = '', script, envVars = [], scriptType = 'http', workload = null }) {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
  })
  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
    const e = new Error('Continuum is not connected. Set it up in Settings → Continuum.')
    e.status = 400
    throw e
  }
  const baseUrl = settings.continuumUrl.replace(/\/$/, '')
  try {
    const { data, status } = await axios.post(
      `${baseUrl}/api/integration/aurora/perf-scenario`,
      // Secret values never leave this machine; Continuum gets the keys only.
      { name, description, script, scriptType, envVars: envVars.map(e => ({ key: e.key, value: e.sensitive ? '' : (e.value || '') })), ...(workload ? { workload } : {}) },
      { headers: { 'X-API-Key': settings.continuumApiKey }, timeout: 30000 }
    )
    return { created: status === 201, scenarioId: data.scenarioId, workloadId: data.workloadId || null, url: `${baseUrl.replace(/\/api$/, '')}${data.path}` }
  } catch (err) {
    const d = err.response?.data
    const e = new Error(d?.message || `Could not reach Continuum at ${baseUrl}`)
    e.status = err.response?.status === 401 ? 400 : (err.response?.status || 502)
    e.detail = d?.detail
    throw e
  }
}

module.exports = { pushResults, syncPipeline, syncPackToContinuum, syncMonitor, monitorInterval, pushPerfScenario }
