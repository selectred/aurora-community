'use strict'
// ============================================
// services/k6/k6Converter.js
// Turns HTTP traffic captured during a recording into a k6 load-test script.
// Pure (no I/O) so it can be unit-tested.
//
// What it does:
//   1. keeps page loads and API calls to the recorded site; drops static files,
//      analytics/trackers, CORS preflights and failed requests
//   2. gives each kept host a URL variable (BASE_URL, API_URL, ...), overridable per run
//   3. correlation: a value (token, id) that appears in an earlier JSON response and
//      is sent again later is read from that response at run time, not replayed
//   4. secrets (passwords, tokens typed into forms, static Authorization headers)
//      become __ENV variables, never literals in the script
//   5. groups requests by the page they were made from, with think time between pages
// ============================================

const ANALYTICS = /(google-analytics|googletagmanager|doubleclick|googlesyndication|segment\.(io|com)|hotjar|sentry\.io|newrelic|nr-data|datadoghq|clarity\.ms|facebook\.(com|net)|linkedin\.com|bat\.bing|intercom|fullstory|mixpanel|amplitude|optimizely|cookielaw|onetrust)/i
const STATIC_PATH = /\.(css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf|mp4|webm|mp3)(\?|$)/i
const SENSITIVE_KEY = /password|passwd|secret|token|api[_-]?key|pin|cvv|ssn|credential/i
const MIN_CORRELATED_STRING = 8
const MIN_CORRELATED_DIGITS = 4

// ── helpers ────────────────────────────────────────────────────────────────

function safeUrl (u) {
  try { return new URL(u) } catch { return null }
}

// Approximate "same site": the last two labels of the host (example.co.uk is
// over-matched, which only means more requests are kept, never fewer).
function siteOf (host) {
  const parts = String(host).split('.')
  return parts.length <= 2 ? host : parts.slice(-2).join('.')
}

function envName (s) {
  return String(s).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'VALUE'
}

function jsIdent (s) {
  const base = String(s).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^A-Za-z_]+/, '')
  return base ? base[0].toLowerCase() + base.slice(1) : 'value'
}

// Flatten a JSON document into [gjsonPath, value] pairs for correlation candidates.
function flattenJson (obj, prefix = '', out = [], depth = 0) {
  if (depth > 6 || out.length > 500) return out
  if (Array.isArray(obj)) {
    obj.slice(0, 20).forEach((v, i) => flattenJson(v, prefix ? `${prefix}.${i}` : String(i), out, depth + 1))
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (!/^[A-Za-z0-9_$-]+$/.test(k)) continue // keys gjson can't address simply
      flattenJson(v, prefix ? `${prefix}.${k}` : k, out, depth + 1)
    }
  } else if (typeof obj === 'string' && obj.length >= MIN_CORRELATED_STRING && obj.length <= 4096) {
    out.push([prefix, obj])
  } else if (typeof obj === 'number' && Number.isInteger(obj) && String(obj).length >= MIN_CORRELATED_DIGITS) {
    out.push([prefix, String(obj)])
  }
  return out
}

function parseBody (entry) {
  const ct = (entry.requestHeaders?.['content-type'] || '').toLowerCase()
  if (!entry.postData) return { kind: 'none' }
  if (ct.includes('json')) {
    try { return { kind: 'json', value: JSON.parse(entry.postData) } } catch { /* fall through */ }
  }
  if (ct.includes('x-www-form-urlencoded')) {
    return { kind: 'form', value: Object.fromEntries(new URLSearchParams(entry.postData)) }
  }
  return { kind: 'raw', value: entry.postData }
}

// ── classification ────────────────────────────────────────────────────────

/**
 * Decide which requests to keep. Returns entries annotated with { kept, reason }.
 * `exclude` is a list of seq numbers the user unticked; `includeHosts` (origins)
 * overrides the same-site default when given.
 */
function classify (traffic, { startUrl = '', exclude = [], includeHosts = null } = {}) {
  const excluded = new Set(exclude)
  const start = safeUrl(startUrl) || safeUrl(traffic.find(t => t.resourceType === 'document')?.url || '')
  const site = start ? siteOf(start.hostname) : null
  const allowed = includeHosts ? new Set(includeHosts) : null

  return traffic.map(t => {
    const u = safeUrl(t.url)
    let reason = null
    if (!u || !/^https?:$/.test(u.protocol)) reason = 'not http'
    else if (t.method === 'OPTIONS') reason = 'CORS preflight'
    else if (t.failure) reason = `failed (${t.failure})`
    else if (ANALYTICS.test(u.hostname)) reason = 'analytics / tracker'
    else if (STATIC_PATH.test(u.pathname) && t.resourceType !== 'document') reason = 'static file'
    else if (allowed ? !allowed.has(u.origin) : (site && siteOf(u.hostname) !== site)) reason = 'third-party host'
    else if (excluded.has(t.seq)) reason = 'excluded by you'
    return { ...t, kept: !reason, reason }
  })
}

// ── script generation ─────────────────────────────────────────────────────

/**
 * @param {Array} traffic  captured entries (see recordingService captureRequest)
 * @param {object} opts    { startUrl, name, thinkTimeSec, exclude, includeHosts }
 * @returns {{ script, envVars, requests, summary }}
 */
function convert (traffic, opts = {}) {
  const { name = 'Recorded journey', thinkTimeSec = 1 } = opts
  const classified = classify(traffic || [], opts)
  const kept = classified.filter(t => t.kept).sort((a, b) => a.seq - b.seq)

  // 1. A URL variable per origin, the start URL's origin first.
  const start = safeUrl(opts.startUrl || '')
  const origins = [...new Set(kept.map(t => new URL(t.url).origin))]
  if (start && origins.includes(start.origin)) origins.sort((a, b) => (a === start.origin ? -1 : b === start.origin ? 1 : 0))
  const originVar = new Map()
  const envVars = []
  origins.forEach((o, i) => {
    const host = new URL(o).hostname
    let v = i === 0 ? 'BASE_URL' : `${envName(/^api\./.test(host) ? 'api' : host.split('.')[0])}_URL`
    if ([...originVar.values()].includes(v)) v = `${v}_${i + 1}`
    originVar.set(o, v)
    envVars.push({ key: v, value: o, sensitive: false })
  })

  // 2. Correlation candidates: every value in each JSON response, first occurrence wins.
  //    Temporary names (__s1, __s2, ...) are replaced with readable ones in emit().
  const sources = []
  const seen = new Set()
  kept.forEach((t, idx) => {
    if (t.responseJson === null || t.responseJson === undefined) return
    for (const [path, value] of flattenJson(t.responseJson)) {
      if (seen.has(value)) continue
      seen.add(value)
      sources.push({ tmp: `__s${sources.length + 1}`, respIndex: idx, path, value, reqTag: `${t.method} ${new URL(t.url).pathname}`, usedBy: 0 })
    }
  })

  // 3. Build requests, substituting earlier response values and hiding secrets.
  const secretKeys = new Set()
  const addSecret = key => {
    const k = envName(key)
    if (!secretKeys.has(k)) { secretKeys.add(k); envVars.push({ key: k, value: '', sensitive: true }) }
    return k
  }
  const before = idx => sources.filter(s => s.respIndex < idx)
  const substitute = (text, idx) => {
    let out = String(text)
    const hits = []
    for (const src of before(idx).sort((a, b) => b.value.length - a.value.length)) {
      if (!out.includes(src.value)) continue
      out = out.split(src.value).join(`\u0000${src.tmp}\u0000`)
      hits.push(src)
    }
    return { out, hits }
  }
  const toTemplate = str => '`' + escapeTemplate(str).replace(/\u0000([A-Za-z0-9_]+)\u0000/g, '${$1}') + '`'

  const requests = kept.map((t, idx) => {
    const u = new URL(t.url)
    const hits = []

    const url = substitute(u.pathname + u.search, idx)
    hits.push(...url.hits)
    const tagPath = url.out.split('?')[0].replace(/\u0000([A-Za-z0-9_]+)\u0000/g, '{$1}')
    const urlExpr = '`${' + originVar.get(u.origin) + '}' + toTemplate(url.out).slice(1)

    const headers = {}
    for (const [k, v] of Object.entries(t.requestHeaders || {})) {
      const h = substitute(v, idx)
      hits.push(...h.hits)
      if (k.toLowerCase() === 'authorization') headers.Authorization = h.hits.length ? h.out : `\u0001${addSecret('AUTH_HEADER')}\u0001`
      else headers[k] = SENSITIVE_KEY.test(k) && !h.hits.length ? `\u0001${addSecret(k)}\u0001` : h.out
    }

    const body = parseBody(t)
    let bodyExpr = null
    if (body.kind === 'json' || body.kind === 'form') {
      const walk = (val, key) => {
        if (Array.isArray(val)) return val.map(v => walk(v, key))
        if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, walk(v, k)]))
        if (typeof val === 'string' || typeof val === 'number') {
          const src = before(idx).find(s => s.value === String(val))
          // Printable markers: JSON.stringify would escape control characters.
          if (src) { hits.push(src); return `@@VAR:${src.tmp}@@` }
          if (key && SENSITIVE_KEY.test(key)) return `@@ENV:${addSecret(key)}@@`
        }
        return val
      }
      const literal = JSON.stringify(walk(body.value, null), null, 2)
        .replace(/"@@VAR:([A-Za-z0-9_]+)@@"/g, '$1')
        .replace(/"@@ENV:([A-Za-z0-9_]+)@@"/g, '__ENV.$1')
      bodyExpr = body.kind === 'json' ? `JSON.stringify(${literal})` : literal
    } else if (body.kind === 'raw') {
      const b = substitute(body.value, idx)
      hits.push(...b.hits)
      bodyExpr = toTemplate(b.out)
    }

    for (const h of hits) h.usedBy++
    return { t, idx, urlExpr, tag: `${t.method} ${tagPath}`, headers, bodyExpr, page: t.page }
  })

  // 4. Readable names for the values that were actually reused.
  const used = sources.filter(s => s.usedBy > 0)
  const taken = new Set(envVars.map(e => e.key).concat(['res', 'http', 'check', 'group', 'sleep', 'options', 'THINK_TIME']))
  const rename = new Map()
  for (const src of used) {
    const baseName = jsIdent(src.path.split('.').filter(p => !/^\d+$/.test(p)).pop() || 'value')
    let n = baseName
    for (let i = 2; taken.has(n); i++) n = `${baseName}${i}`
    taken.add(n)
    rename.set(src.tmp, n)
    src.var = n
  }
  const applyNames = str => (str == null ? str : String(str).replace(/__s\d+/g, m => rename.get(m) || m))
  for (const r of requests) {
    r.urlExpr = applyNames(r.urlExpr)
    r.tag = applyNames(r.tag)
    r.bodyExpr = applyNames(r.bodyExpr)
    for (const k of Object.keys(r.headers)) r.headers[k] = applyNames(r.headers[k])
  }

  return emit({ name, thinkTimeSec, requests, envVars, classified, kept, correlations: used })
}

function escapeTemplate (s) {
  return String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function emit (ctx) {
  const { name, thinkTimeSec, requests, envVars, classified, kept, correlations } = ctx
  const extractionsAt = new Map() // request idx -> sources to extract after it
  for (const src of correlations) {
    if (!extractionsAt.has(src.respIndex)) extractionsAt.set(src.respIndex, [])
    extractionsAt.get(src.respIndex).push(src)
  }

  const L = []
  L.push(`// ${name}`)
  L.push(`// Generated by Aurora from a recorded browser session on ${new Date().toISOString().slice(0, 10)}.`)
  L.push(`// ${kept.length} requests kept of ${classified.length} captured. Review before running at scale:`)
  L.push('//   - values read from earlier responses are marked "correlated" below')
  L.push('//   - secrets come from environment variables (see the variable list in Aurora)')
  L.push("import http from 'k6/http'")
  L.push("import { check, group, sleep } from 'k6'")
  L.push('')
  L.push('// Load is set by a Continuum workload model at run time; these defaults suit a smoke run.')
  L.push('export const options = {')
  L.push('  vus: 1,')
  L.push('  iterations: 1,')
  L.push("  thresholds: { http_req_failed: ['rate<0.01'] }")
  L.push('}')
  L.push('')
  for (const e of envVars.filter(e => !e.sensitive)) {
    L.push(`const ${e.key} = __ENV.${e.key} || ${JSON.stringify(e.value)}`)
  }
  L.push(`const THINK_TIME = Number(__ENV.THINK_TIME || ${Number(thinkTimeSec) || 0})`)
  L.push('')
  L.push('export default function () {')
  if (correlations.length) L.push(`  let ${correlations.map(c => c.var).join(', ')}`)
  L.push('  let res')

  // Group consecutive requests by the page they were made from.
  let currentPage = null
  let open = false
  // Page paths label the groups; recorded ids are shown as {id} so they don't leak into names.
  const pageLabel = p => {
    const u = safeUrl(p)
    if (!u) return 'Journey'
    if (u.pathname === '/') return 'Home'
    return u.pathname.replace(/\/(\d{4,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{20,})(?=\/|$)/gi, '/{id}')
  }
  requests.forEach((r, i) => {
    if (r.page !== currentPage) {
      if (open) { L.push('  })'); L.push('  sleep(THINK_TIME)') }
      currentPage = r.page
      L.push('')
      L.push(`  group(${JSON.stringify(pageLabel(r.page))}, () => {`)
      open = true
    }
    const hdrs = Object.entries(r.headers)
      .map(([k, v]) => `${JSON.stringify(k)}: ${headerExpr(v)}`)
    const params = hdrs.length
      ? `{ headers: { ${hdrs.join(', ')} }, tags: { name: ${JSON.stringify(r.tag)} } }`
      : `{ tags: { name: ${JSON.stringify(r.tag)} } }`
    const method = r.t.method.toUpperCase()
    const fn = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del', HEAD: 'head' }[method]
    if (fn === 'get' || fn === 'head') L.push(`    res = http.${fn}(${r.urlExpr}, ${params})`)
    else if (fn) L.push(`    res = http.${fn}(${r.urlExpr}, ${r.bodyExpr || 'null'}, ${params})`)
    else L.push(`    res = http.request(${JSON.stringify(method)}, ${r.urlExpr}, ${r.bodyExpr || 'null'}, ${params})`)
    const expected = r.t.status || 200
    L.push(`    check(res, { ${JSON.stringify(`${r.tag} is ${expected}`)}: r => r.status === ${expected} })`)
    for (const src of extractionsAt.get(r.idx) || []) {
      L.push(`    ${src.var} = res.json(${JSON.stringify(src.path)}) // correlated: used ${src.usedBy} time(s) later`)
    }
  })
  if (open) L.push('  })')
  L.push('  sleep(THINK_TIME)')
  L.push('}')
  L.push('')

  return {
    script: L.join('\n'),
    envVars: envVars.map(({ key, value, sensitive }) => ({ key, value, sensitive })),
    requests: classified.map(t => ({ seq: t.seq, method: t.method, url: t.url, status: t.status, page: t.page, kept: t.kept, reason: t.reason })),
    summary: {
      captured: classified.length,
      kept: kept.length,
      skipped: classified.filter(t => !t.kept).reduce((acc, t) => { acc[t.reason] = (acc[t.reason] || 0) + 1; return acc }, {}),
      groups: new Set(requests.map(r => r.page)).size,
      correlations: correlations.map(c => ({ variable: c.var, from: c.reqTag, path: c.path, usedBy: c.usedBy })),
      secrets: envVars.filter(e => e.sensitive).map(e => e.key)
    }
  }
}

// Header values: correlated vars become template literals, secrets become __ENV reads.
function headerExpr (v) {
  const s = String(v)
  const secret = s.match(/^\u0001([A-Za-z0-9_]+)\u0001$/)
  if (secret) return `__ENV.${secret[1]}`
  if (s.includes('\u0000')) return '`' + escapeTemplate(s).replace(/\u0000([A-Za-z0-9_]+)\u0000/g, '${$1}') + '`'
  return JSON.stringify(s)
}

module.exports = { convert, classify, flattenJson }
