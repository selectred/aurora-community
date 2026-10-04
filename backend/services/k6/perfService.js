'use strict'
// ============================================
// services/k6/perfService.js
// Performance settings, script variables (secrets encrypted at rest) and the
// API shapes for scripts, scenarios and runs.
// ============================================
const prisma = require('../../lib/prisma')
const { parseJson, stringifyJson } = require('../../lib/helpers')
const { encrypt, decrypt, generateKey } = require('../../lib/encryption')
const { MAX_LOCAL_VUS, validateLoad, peakVus, totalDurationSec, profilePoints } = require('./k6Load')

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

const DEFAULT_SETTINGS = Object.freeze({
  maxVus: MAX_LOCAL_VUS,
  maxDurationMin: 60,
  defaultThinkTimeSec: 1,
  defaultThresholds: { p95Ms: 1000, avgMs: null, maxFailRatePct: 1 },
  defaultLoad: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 5 },
      { duration: '2m', target: 5 },
      { duration: '15s', target: 0 }
    ]
  },
  regressionTolerancePct: 10,
  regressionFailRatePts: 1,
  keepRunsPerScenario: 50
})

function httpError (status, message, detail) {
  const e = new Error(message)
  e.status = status
  if (detail) e.detail = detail
  return e
}

// ── settings ──────────────────────────────────────────────────────────────

async function appSettings () {
  let s = await prisma.appSettings.findFirst()
  if (!s) s = await prisma.appSettings.create({ data: {} })
  return s
}

async function getSettings () {
  const s = await appSettings()
  const saved = parseJson(s.perfSettingsJson, {})
  const merged = { ...DEFAULT_SETTINGS, ...saved }
  merged.defaultThresholds = { ...DEFAULT_SETTINGS.defaultThresholds, ...(saved.defaultThresholds || {}) }
  merged.maxVus = Math.min(MAX_LOCAL_VUS, Math.max(1, Number(merged.maxVus) || MAX_LOCAL_VUS))
  return merged
}

function numOrNull (v, { min = 0, max = Infinity } = {}) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return n
}

async function saveSettings (input = {}) {
  const current = await getSettings()
  const errors = []
  const next = { ...current }
  const intIn = (key, label, min, max) => {
    if (input[key] === undefined) return
    const n = Math.round(Number(input[key]))
    if (!Number.isFinite(n) || n < min || n > max) errors.push(`${label} must be between ${min} and ${max}`)
    else next[key] = n
  }
  intIn('maxVus', 'Maximum virtual users', 1, MAX_LOCAL_VUS)
  intIn('maxDurationMin', 'Maximum run length', 1, 60)
  intIn('regressionTolerancePct', 'Regression tolerance', 0, 500)
  intIn('regressionFailRatePts', 'Error-rate tolerance', 0, 100)
  intIn('keepRunsPerScenario', 'Runs kept per scenario', 5, 500)
  if (input.defaultThinkTimeSec !== undefined) {
    const n = numOrNull(input.defaultThinkTimeSec, { min: 0, max: 60 })
    if (n === undefined) errors.push('Think time must be between 0 and 60 seconds')
    else next.defaultThinkTimeSec = n ?? 0
  }
  if (input.defaultThresholds !== undefined) {
    const t = normaliseThresholds(input.defaultThresholds, errors)
    next.defaultThresholds = t
  }
  if (input.defaultLoad !== undefined) {
    const { load, errors: le } = validateLoad(input.defaultLoad, { cap: next.maxVus, maxDurationSec: next.maxDurationMin * 60 })
    if (le.length) errors.push(...le.map(e => `Default load: ${e}`))
    else next.defaultLoad = load
  }
  if (errors.length) throw httpError(400, errors[0], errors)
  const s = await appSettings()
  await prisma.appSettings.update({ where: { id: s.id }, data: { perfSettingsJson: stringifyJson(next) } })
  return next
}

function normaliseThresholds (t = {}, errors = []) {
  const out = {}
  const p95 = numOrNull(t.p95Ms, { min: 1, max: 600000 })
  const avg = numOrNull(t.avgMs, { min: 1, max: 600000 })
  const fail = numOrNull(t.maxFailRatePct, { min: 0, max: 100 })
  if (p95 === undefined) errors.push('95th percentile threshold must be a positive number of milliseconds')
  if (avg === undefined) errors.push('Average threshold must be a positive number of milliseconds')
  if (fail === undefined) errors.push('Error-rate threshold must be between 0 and 100%')
  out.p95Ms = p95 ?? null
  out.avgMs = avg ?? null
  out.maxFailRatePct = fail ?? null
  return out
}

// ── script variables ──────────────────────────────────────────────────────

async function encryptionKey () {
  const s = await appSettings()
  if (s.encryptionKey) return s.encryptionKey
  const key = generateKey()
  await prisma.appSettings.update({ where: { id: s.id }, data: { encryptionKey: key } })
  return key
}

/**
 * Store variables. A sensitive variable sent with an empty value keeps the
 * secret already saved under the same key (the UI never sees saved secrets).
 */
async function encodeEnvVars (vars, previousJson = '[]') {
  const list = Array.isArray(vars) ? vars : []
  const prev = new Map(parseJson(previousJson, []).map(v => [v.key, v]))
  const key = await encryptionKey()
  const seen = new Set()
  const out = []
  for (const v of list) {
    const k = String(v?.key || '').trim()
    if (!k) continue
    if (!ENV_KEY.test(k)) throw httpError(400, `"${k}" is not a valid variable name (letters, digits and _; not starting with a digit)`)
    if (seen.has(k)) throw httpError(400, `Variable ${k} is listed twice`)
    seen.add(k)
    const sensitive = !!v.sensitive
    const value = String(v.value ?? '')
    if (!sensitive) { out.push({ key: k, value, sensitive: false }); continue }
    if (value) out.push({ key: k, value: encrypt(value, key), sensitive: true, hasValue: true })
    else if (prev.get(k)?.sensitive && prev.get(k).hasValue) out.push(prev.get(k))
    else out.push({ key: k, value: '', sensitive: true, hasValue: false })
  }
  return stringifyJson(out)
}

/** What the UI sees: secret values replaced by a hasValue flag. */
function publicEnvVars (json) {
  return parseJson(json, []).map(v => v.sensitive
    ? { key: v.key, value: '', sensitive: true, hasValue: !!v.hasValue }
    : { key: v.key, value: v.value, sensitive: false })
}

/** What k6 gets: [{ key, value }] with secrets decrypted. */
async function runtimeEnvVars (json) {
  const vars = parseJson(json, [])
  const key = vars.some(v => v.sensitive && v.hasValue) ? await encryptionKey() : null
  return vars.map(v => {
    if (!v.sensitive) return { key: v.key, value: v.value }
    if (!v.hasValue) return { key: v.key, value: '' }
    try { return { key: v.key, value: decrypt(v.value, key) } } catch { return { key: v.key, value: '' } }
  })
}

// ── API shapes ────────────────────────────────────────────────────────────

function scriptOut (s, { withScript = true } = {}) {
  if (!s) return null
  const out = {
    id: s.id,
    name: s.name,
    description: s.description,
    scriptType: s.scriptType,
    source: s.source,
    envVars: publicEnvVars(s.envVarsJson),
    lastSmoke: s.lastSmokeJson ? parseJson(s.lastSmokeJson, null) : null,
    lastSmokeAt: s.lastSmokeAt,
    pushedAt: s.pushedAt,
    continuumScenarioId: s.continuumScenarioId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    scenarioCount: s._count?.scenarios ?? undefined
  }
  if (withScript) out.script = s.script
  return out
}

function scenarioOut (sc) {
  if (!sc) return null
  const load = parseJson(sc.loadJson, {})
  return {
    id: sc.id,
    name: sc.name,
    description: sc.description,
    scriptId: sc.scriptId,
    script: sc.script ? { id: sc.script.id, name: sc.script.name, scriptType: sc.script.scriptType } : undefined,
    load,
    thresholds: parseJson(sc.thresholdsJson, {}),
    thinkTimeSec: sc.thinkTimeSec,
    baselineRunId: sc.baselineRunId,
    pushedAt: sc.pushedAt,
    peakVus: peakVus(load.executor ? load : null),
    durationSec: load.executor ? totalDurationSec(load) : 0,
    profile: load.executor ? profilePoints(load) : [],
    lastRun: sc.runs?.[0] ? runOut(sc.runs[0], { brief: true }) : undefined,
    createdAt: sc.createdAt,
    updatedAt: sc.updatedAt
  }
}

function runOut (r, { brief = false } = {}) {
  if (!r) return null
  const out = {
    id: r.id,
    scenarioId: r.scenarioId,
    scenarioName: r.scenario?.name,
    status: r.status,
    scriptType: r.scriptType,
    load: parseJson(r.loadSnapshotJson, {}),
    thresholds: parseJson(r.thresholdsSnapshotJson, {}),
    metrics: parseJson(r.metricsJson, {}),
    thresholdResults: parseJson(r.thresholdResultsJson, []),
    comparison: r.comparisonJson ? parseJson(r.comparisonJson, null) : null,
    live: r.liveJson ? parseJson(r.liveJson, null) : null,
    exitCode: r.exitCode,
    errorMessage: r.errorMessage,
    queuedAt: r.queuedAt,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt
  }
  if (!brief) {
    out.timeseries = parseJson(r.timeseriesJson, [])
    out.consoleLog = r.consoleLog
    out.script = r.scriptSnapshot
  }
  return out
}

module.exports = {
  DEFAULT_SETTINGS,
  ENV_KEY,
  httpError,
  getSettings,
  saveSettings,
  normaliseThresholds,
  encodeEnvVars,
  publicEnvVars,
  runtimeEnvVars,
  scriptOut,
  scenarioOut,
  runOut
}
