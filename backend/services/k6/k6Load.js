'use strict'
// ============================================
// services/k6/k6Load.js
// Load profiles for local performance runs. Pure (no I/O) so it can be
// unit-tested: validation (with the local virtual-user cap), the k6 wrapper
// that applies a profile to a script, summary parsing, time-series bucketing,
// baseline comparison and progress-line parsing.
//
// The load profile shape matches Continuum's PerfWorkload, so a scenario
// pushed from here keeps its load and thresholds.
//
// k6 sharp edges, do not "simplify":
//   - exit code 99 means thresholds were crossed on a COMPLETED run, not a failure
//   - --summary-export threshold values: current k6 uses a bare bool where true
//     means BREACHED; legacy used { ok: bool }. parseSummary handles both.
// ============================================

const MAX_LOCAL_VUS = 20 // hard ceiling for runs on the tester's machine
const MAX_LOCAL_DURATION_SEC = 60 * 60
const EXECUTORS = ['ramping-vus', 'constant-vus', 'constant-arrival-rate']
const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/
const LOAD_OPTION_KEYS = ['stages', 'vus', 'duration', 'iterations', 'scenarios']

function durationSec (d) {
  const m = DURATION.exec(String(d || '').trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return { ms: n / 1000, s: n, m: n * 60, h: n * 3600 }[m[2]]
}

function int (v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : NaN
}

/**
 * Check and normalise a load profile. `cap` is the local VU limit (≤ 20).
 * Returns { load, errors }. `load` is only meaningful when errors is empty.
 */
function validateLoad (input = {}, { cap = MAX_LOCAL_VUS, maxDurationSec = MAX_LOCAL_DURATION_SEC } = {}) {
  const limit = Math.min(MAX_LOCAL_VUS, Math.max(1, int(cap) || MAX_LOCAL_VUS))
  const errors = []
  const executor = input.executor || 'ramping-vus'
  if (!EXECUTORS.includes(executor)) return { load: null, errors: [`Unknown load type "${executor}"`] }
  const load = { executor }
  const vuField = (name, v, { min = 1 } = {}) => {
    const n = int(v)
    if (!Number.isFinite(n) || n < min) errors.push(`${name} must be a whole number of at least ${min}`)
    else if (n > limit) errors.push(`${name} is ${n}; local runs are limited to ${limit} virtual users`)
    return n
  }
  const durField = (name, v) => {
    const s = durationSec(v)
    if (s === null || s <= 0) errors.push(`${name} must be a duration like 30s, 5m or 1h`)
    return String(v || '').trim()
  }

  if (executor === 'ramping-vus') {
    load.startVUs = vuField('Starting users', input.startVUs ?? 0, { min: 0 })
    const stages = Array.isArray(input.stages) ? input.stages : []
    if (!stages.length) errors.push('Add at least one stage')
    load.stages = stages.map((s, i) => ({
      duration: durField(`Stage ${i + 1} duration`, s.duration),
      target: vuField(`Stage ${i + 1} target`, s.target, { min: 0 })
    }))
  } else if (executor === 'constant-vus') {
    load.vus = vuField('Users', input.vus)
    load.duration = durField('Duration', input.duration)
  } else {
    const rate = int(input.rate)
    if (!Number.isFinite(rate) || rate < 1) errors.push('Rate must be at least 1 iteration per time unit')
    load.rate = rate
    load.timeUnit = String(input.timeUnit || '1s').trim()
    if (durationSec(load.timeUnit) === null) errors.push('Time unit must be a duration like 1s or 1m')
    load.duration = durField('Duration', input.duration)
    load.preAllocatedVUs = vuField('Pre-allocated users', input.preAllocatedVUs)
    if (input.maxVUs !== undefined && input.maxVUs !== null && input.maxVUs !== '') {
      load.maxVUs = vuField('Maximum users', input.maxVUs)
      if (load.maxVUs < load.preAllocatedVUs) errors.push('Maximum users must be at least the pre-allocated users')
    }
  }

  if (!errors.length) {
    const total = totalDurationSec(load)
    if (total > maxDurationSec) errors.push(`The profile runs for ${Math.round(total / 60)} minutes; local runs are limited to ${Math.round(maxDurationSec / 60)} minutes`)
    if (peakVus(load) < 1) errors.push('The profile never starts a virtual user')
  }
  return { load, errors }
}

function peakVus (load) {
  if (!load) return 0
  if (load.executor === 'ramping-vus') return Math.max(load.startVUs || 0, ...load.stages.map(s => s.target))
  if (load.executor === 'constant-vus') return load.vus
  return Math.max(load.preAllocatedVUs || 0, load.maxVUs || 0)
}

function totalDurationSec (load) {
  if (!load) return 0
  if (load.executor === 'ramping-vus') return load.stages.reduce((sum, s) => sum + (durationSec(s.duration) || 0), 0)
  return durationSec(load.duration) || 0
}

/** Points for a VU-over-time preview: [{ tSec, vus }]. */
function profilePoints (load) {
  if (!load) return []
  if (load.executor === 'ramping-vus') {
    const pts = [{ tSec: 0, vus: load.startVUs || 0 }]
    let t = 0
    for (const s of load.stages) { t += durationSec(s.duration) || 0; pts.push({ tSec: t, vus: s.target }) }
    return pts
  }
  const d = totalDurationSec(load)
  const v = load.executor === 'constant-vus' ? load.vus : (load.maxVUs || load.preAllocatedVUs)
  return [{ tSec: 0, vus: v }, { tSec: d, vus: v }]
}

/** k6 `scenarios` + `thresholds` for a profile. */
function loadOptions (load, thresholds = {}, scriptType = 'http') {
  const sc = { executor: load.executor }
  if (load.executor === 'ramping-vus') {
    sc.startVUs = load.startVUs || 0
    sc.stages = load.stages.map(s => ({ duration: s.duration, target: s.target }))
  } else if (load.executor === 'constant-vus') {
    sc.vus = load.vus
    sc.duration = load.duration
  } else {
    Object.assign(sc, { rate: load.rate, timeUnit: load.timeUnit || '1s', duration: load.duration, preAllocatedVUs: load.preAllocatedVUs })
    if (load.maxVUs) sc.maxVUs = load.maxVUs
  }
  if (scriptType === 'browser') sc.options = { browser: { type: 'chromium' } }

  const th = {}
  const t = thresholds || {}
  const dur = []
  if (t.p95Ms) dur.push(`p(95)<${t.p95Ms}`)
  if (t.avgMs) dur.push(`avg<${t.avgMs}`)
  if (dur.length) th.http_req_duration = dur
  if (t.maxFailRatePct !== undefined && t.maxFailRatePct !== null && t.maxFailRatePct !== '') th.http_req_failed = [`rate<${Number(t.maxFailRatePct) / 100}`]
  return { scenarios: { load: sc }, thresholds: th }
}

/**
 * ES module that runs ./scenario.js under a profile: re-exports the script,
 * drops its own load options and adds the scenario's thresholds to the script's.
 */
function buildWrapper (load, thresholds, scriptType = 'http') {
  const { scenarios, thresholds: extra } = loadOptions(load, thresholds, scriptType)
  return `import * as __scenario from './scenario.js'
export * from './scenario.js'
export { default } from './scenario.js'

const __base = Object.assign({}, __scenario.options || {})
for (const k of ${JSON.stringify(LOAD_OPTION_KEYS)}) delete __base[k]
const __extra = ${JSON.stringify(extra)}
const __thresholds = Object.assign({}, __base.thresholds || {})
for (const [metric, rules] of Object.entries(__extra)) {
  __thresholds[metric] = [].concat(__thresholds[metric] || [], rules)
}
export const options = Object.assign(__base, {
  scenarios: ${JSON.stringify(scenarios)},
  thresholds: __thresholds
})
`
}

/** Headline metrics and threshold results from k6 --summary-export. */
function parseSummary (summary, scriptType = 'http') {
  const m = summary?.metrics || {}
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const metrics = {
    httpReqs: num(m.http_reqs?.count),
    reqRate: num(m.http_reqs?.rate),
    avgDuration: num(m.http_req_duration?.avg),
    medDuration: num(m.http_req_duration?.med),
    p90Duration: num(m.http_req_duration?.['p(90)']),
    p95Duration: num(m.http_req_duration?.['p(95)']),
    maxDuration: num(m.http_req_duration?.max),
    failRate: num(m.http_req_failed?.value),
    iterations: num(m.iterations?.count),
    peakVus: num(m.vus_max?.value ?? m.vus_max?.max),
    checksPassed: num(m.checks?.passes),
    checksFailed: num(m.checks?.fails)
  }
  if (scriptType === 'browser') {
    metrics.webVitals = {
      lcp: num(m.browser_web_vital_lcp?.avg),
      fcp: num(m.browser_web_vital_fcp?.avg),
      cls: num(m.browser_web_vital_cls?.avg),
      ttfb: num(m.browser_web_vital_ttfb?.avg)
    }
  }
  const thresholds = []
  for (const [metric, data] of Object.entries(m)) {
    for (const [expr, val] of Object.entries(data?.thresholds || {})) {
      thresholds.push({ metric, expr, passed: typeof val === 'object' && val !== null ? val.ok === true : val === false })
    }
  }
  return { metrics, thresholds }
}

// ── time series ───────────────────────────────────────────────────────────
// Fixed 5 s buckets from k6's --out json stream, coarsened so a long run still
// yields at most MAX_BUCKETS points. Feed lines one at a time.
const BUCKET_MS = 5000
const MAX_BUCKETS = 240
const TS_METRICS = new Set(['vus', 'http_req_duration', 'http_req_failed', 'iterations'])

// bucketMs defaults to 5 s; bucketMsFor() picks one from the planned run length.
function bucketMsFor (load) {
  const total = totalDurationSec(load) || 60
  return Math.max(1000, Math.ceil(total / 150) * 1000)
}

function createTimeseries ({ bucketMs = BUCKET_MS } = {}) {
  const buckets = new Map()
  let t0 = null
  return {
    add (line) {
      if (!line || line.charCodeAt(0) !== 123) return // '{'
      let obj
      try { obj = JSON.parse(line) } catch { return }
      if (obj.type !== 'Point' || !TS_METRICS.has(obj.metric)) return
      const t = Date.parse(obj.data?.time)
      const v = obj.data?.value
      if (Number.isNaN(t) || typeof v !== 'number') return
      if (t0 === null) t0 = t
      const idx = Math.floor((t - t0) / bucketMs)
      let a = buckets.get(idx)
      if (!a) { a = { vusSeen: false, vus: 0, durSum: 0, durN: 0, durMax: 0, failSum: 0, failN: 0, iters: 0 }; buckets.set(idx, a) }
      if (obj.metric === 'vus') { a.vusSeen = true; a.vus = Math.max(a.vus, v) } else if (obj.metric === 'http_req_duration') { a.durSum += v; a.durN++; a.durMax = Math.max(a.durMax, v) } else if (obj.metric === 'http_req_failed') { a.failSum += v; a.failN++ } else if (obj.metric === 'iterations') a.iters += v
    },
    result () {
      if (!buckets.size) return []
      const factor = Math.max(1, Math.ceil((Math.max(...buckets.keys()) + 1) / MAX_BUCKETS))
      const merged = new Map()
      for (const [idx, a] of buckets) {
        const k = Math.floor(idx / factor)
        const m = merged.get(k)
        if (!m) { merged.set(k, { ...a }); continue }
        m.vusSeen = m.vusSeen || a.vusSeen
        m.vus = Math.max(m.vus, a.vus)
        m.durMax = Math.max(m.durMax, a.durMax)
        for (const f of ['durSum', 'durN', 'failSum', 'failN', 'iters']) m[f] += a[f]
      }
      const span = bucketMs * factor / 1000
      return [...merged.entries()].sort((x, y) => x[0] - y[0]).map(([k, a]) => ({
        tSec: Math.round(k * span),
        vus: a.vusSeen ? a.vus : null,
        reqRate: a.durN ? +(a.durN / span).toFixed(2) : 0,
        avgDuration: a.durN ? +(a.durSum / a.durN).toFixed(2) : null,
        maxDuration: a.durN ? +a.durMax.toFixed(2) : null,
        failRate: a.failN ? +(a.failSum / a.failN).toFixed(4) : null,
        iterations: a.iters
      }))
    }
  }
}

// ── baseline comparison ───────────────────────────────────────────────────
// A run regresses when a timing metric is more than tolerancePct worse than
// the baseline, or the failure rate rises by more than failRatePts points.
function compareMetrics (current, baseline, { tolerancePct = 10, failRatePts = 1 } = {}) {
  if (!current || !baseline) return null
  const deltas = []
  for (const key of ['p95Duration', 'avgDuration', 'medDuration']) {
    const c = current[key]; const b = baseline[key]
    if (typeof c !== 'number' || typeof b !== 'number' || b <= 0) continue
    const pct = ((c - b) / b) * 100
    deltas.push({ metric: key, baseline: b, current: c, changePct: +pct.toFixed(1), regressed: pct > tolerancePct })
  }
  if (typeof current.failRate === 'number' && typeof baseline.failRate === 'number') {
    const pts = (current.failRate - baseline.failRate) * 100
    deltas.push({ metric: 'failRate', baseline: baseline.failRate, current: current.failRate, changePts: +pts.toFixed(2), regressed: pts > failRatePts })
  }
  if (typeof current.reqRate === 'number' && typeof baseline.reqRate === 'number' && baseline.reqRate > 0) {
    deltas.push({ metric: 'reqRate', baseline: baseline.reqRate, current: current.reqRate, changePct: +(((current.reqRate - baseline.reqRate) / baseline.reqRate) * 100).toFixed(1), regressed: false })
  }
  return { regressed: deltas.some(d => d.regressed), deltas, tolerancePct, failRatePts }
}

// "running (01.0s), 2/3 VUs, 7 complete and 0 interrupted iterations"
const PROGRESS = /running \(([^)]+)\), (\d+)\/(\d+) VUs, (\d+) complete and (\d+) interrupted/
const PERCENT = /\[\s*(\d+)%\s*\]/
function parseProgress (line, prev = {}) {
  const m = PROGRESS.exec(line)
  if (m) return { ...prev, elapsed: m[1], vus: +m[2], maxVus: +m[3], iterations: +m[4], interrupted: +m[5] }
  const p = PERCENT.exec(line)
  if (p && / VUs /.test(line)) return { ...prev, pct: +p[1] }
  return null
}

module.exports = {
  MAX_LOCAL_VUS,
  MAX_LOCAL_DURATION_SEC,
  EXECUTORS,
  durationSec,
  validateLoad,
  peakVus,
  totalDurationSec,
  profilePoints,
  loadOptions,
  buildWrapper,
  parseSummary,
  createTimeseries,
  bucketMsFor,
  compareMetrics,
  parseProgress
}
