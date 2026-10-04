'use strict'
// ============================================
// services/k6/k6Tool.js
// k6 on the tester's machine: downloaded on demand (like Playwright's browsers,
// see browserSetupService.js), verified against the release checksums, and used
// to validate and smoke-run generated load tests before they are pushed to
// Continuum. Nothing is installed system-wide.
// ============================================
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { spawn, spawnSync } = require('child_process')
const axios = require('axios')
const JSZip = require('jszip')

const K6_VERSION = '2.2.0' // keep in step with Continuum's perf worker image
const RELEASES = `https://github.com/grafana/k6/releases/download/v${K6_VERSION}`
const SMOKE_TIMEOUT_MS = 2 * 60 * 1000
const CONSOLE_CAP = 64 * 1024

function toolsDir () {
  // Packaged app: the user's Aurora data dir. Development: a git-ignored folder.
  return process.env.AURORA_DATA_DIR
    ? path.join(process.env.AURORA_DATA_DIR, 'tools')
    : path.join(__dirname, '..', '..', '.tools')
}

function binaryName () {
  return process.platform === 'win32' ? 'k6.exe' : 'k6'
}

function binaryPath () {
  if (process.env.K6_BIN) return process.env.K6_BIN
  return path.join(toolsDir(), `k6-${K6_VERSION}`, binaryName())
}

function assetName (platform = process.platform, arch = process.arch) {
  const a = arch === 'arm64' ? 'arm64' : 'amd64'
  if (platform === 'darwin') return `k6-v${K6_VERSION}-macos-${a}.zip`
  if (platform === 'win32') return `k6-v${K6_VERSION}-windows-amd64.zip`
  if (platform === 'linux') return `k6-v${K6_VERSION}-linux-${a}.tar.gz`
  throw new Error(`k6 is not available for ${platform}/${arch}`)
}

function status () {
  const bin = binaryPath()
  if (!fs.existsSync(bin) && !process.env.K6_BIN) return { installed: false, version: K6_VERSION }
  const r = spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 10000 })
  if (r.status !== 0) return { installed: false, version: K6_VERSION, error: (r.stderr || r.error?.message || '').slice(0, 300) }
  return { installed: true, version: (r.stdout.match(/v(\d+\.\d+\.\d+)/) || [])[1] || K6_VERSION, path: bin }
}

// Minimal ustar reader: returns the first regular file whose name ends with `wanted`.
function extractFromTar (buf, wanted) {
  let off = 0
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512)
    if (header.every(b => b === 0)) break
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/s, '')
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/s, '')
    const full = prefix ? `${prefix}/${name}` : name
    const size = parseInt(header.toString('utf8', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 48)
    const start = off + 512
    if ((type === '0' || type === '\0') && (full === wanted || full.endsWith(`/${wanted}`))) return buf.subarray(start, start + size)
    off = start + Math.ceil(size / 512) * 512
  }
  return null
}

/**
 * Download k6 for this machine, verify its checksum and install it.
 * onProgress({ stage, pct }) is called during the download.
 */
async function install (onProgress = () => {}, { platform = process.platform, arch = process.arch, dest = null } = {}) {
  const asset = assetName(platform, arch)
  onProgress({ stage: 'Fetching checksums', pct: 0 })
  const sums = (await axios.get(`${RELEASES}/k6-v${K6_VERSION}-checksums.txt`, { timeout: 30000, responseType: 'text' })).data
  const expected = (String(sums).split('\n').find(l => l.trim().endsWith(asset)) || '').split(/\s+/)[0]
  if (!expected) throw new Error(`No published checksum for ${asset}`)

  const res = await axios.get(`${RELEASES}/${asset}`, {
    responseType: 'arraybuffer',
    timeout: 5 * 60 * 1000,
    maxContentLength: 200 * 1024 * 1024,
    onDownloadProgress: e => onProgress({ stage: `Downloading k6 ${K6_VERSION}`, pct: e.total ? Math.round((e.loaded / e.total) * 100) : null })
  })
  const archive = Buffer.from(res.data)
  const actual = crypto.createHash('sha256').update(archive).digest('hex')
  if (actual !== expected) throw new Error('The k6 download did not match its published checksum; nothing was installed')

  onProgress({ stage: 'Unpacking', pct: 100 })
  const exe = platform === 'win32' ? 'k6.exe' : 'k6'
  let binary
  if (asset.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(archive)
    const entry = Object.values(zip.files).find(f => !f.dir && (f.name === exe || f.name.endsWith(`/${exe}`)))
    if (!entry) throw new Error('k6 binary not found in the download')
    binary = await entry.async('nodebuffer')
  } else {
    binary = extractFromTar(zlib.gunzipSync(archive), exe)
    if (!binary) throw new Error('k6 binary not found in the download')
  }

  const target = dest || path.join(toolsDir(), `k6-${K6_VERSION}`, exe)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.partial`
  await fsp.writeFile(tmp, binary, { mode: 0o755 })
  await fsp.rename(tmp, target)
  return { installed: true, version: K6_VERSION, path: target }
}

function run (args, { env = {}, timeoutMs = SMOKE_TIMEOUT_MS } = {}) {
  return new Promise(resolve => {
    const p = spawn(binaryPath(), args, { env: { ...process.env, ...env } })
    let log = ''
    const append = d => { log += d; if (log.length > CONSOLE_CAP * 2) log = log.slice(-CONSOLE_CAP) }
    p.stdout.on('data', append)
    p.stderr.on('data', append)
    const timer = setTimeout(() => p.kill('SIGTERM'), timeoutMs)
    p.on('error', e => { clearTimeout(timer); resolve({ code: null, log: `${log}\n${e.message}`, spawnError: e.message }) })
    p.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, log: log.slice(-CONSOLE_CAP), timedOut: signal === 'SIGTERM' }) })
  })
}

async function withScript (script, fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aurora-k6-'))
  try {
    await fsp.writeFile(path.join(dir, 'scenario.js'), script)
    return await fn(dir)
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** `k6 inspect`: does k6 load the script? */
async function inspect (script) {
  if (!status().installed) return { ok: false, notInstalled: true, error: 'k6 is not installed' }
  return withScript(script, async dir => {
    const r = await run(['inspect', path.join(dir, 'scenario.js')], { timeoutMs: 30000 })
    return r.code === 0 ? { ok: true } : { ok: false, error: r.log.slice(0, 4000) }
  })
}

// Environment for k6 browser scripts: headless, using Playwright's Chromium (already
// downloaded for the test engine) so no separate Chrome install is needed, and
// without the sandbox when running as root (containers).
function browserEnv () {
  const env = { K6_BROWSER_HEADLESS: 'true' }
  try {
    const exe = require('playwright').chromium.executablePath()
    if (exe && fs.existsSync(exe)) env.K6_BROWSER_EXECUTABLE_PATH = exe
  } catch { /* fall back to k6's own browser discovery */ }
  if (typeof process.getuid === 'function' && process.getuid() === 0) env.K6_BROWSER_ARGS = 'no-sandbox'
  return env
}

// Smoke wrapper: one VU, one iteration, whatever load the script defines.
function smokeWrapper (scriptType) {
  const browser = scriptType === 'browser' ? ", options: { browser: { type: 'chromium' } }" : ''
  return `import * as __scenario from './scenario.js'
export * from './scenario.js'
export { default } from './scenario.js'
const __base = Object.assign({}, __scenario.options || {})
for (const k of ['stages', 'vus', 'duration', 'iterations', 'scenarios']) delete __base[k]
export const options = Object.assign(__base, {
  scenarios: { smoke: { executor: 'shared-iterations', vus: 1, iterations: 1${browser} } }
})
`
}

function failedChecks (group, out = []) {
  if (!group) return out
  for (const c of Object.values(group.checks || {})) {
    if (c.fails > 0) out.push({ name: c.name, group: (group.path || '').replace(/^::/, '').replace(/::/g, ' › ') || null })
  }
  for (const g of Object.values(group.groups || {})) failedChecks(g, out)
  return out
}

/**
 * Run the script once with one VU. envVars: [{ key, value }].
 * Returns { ok, requests, failedRequestRate, checks: { passes, fails }, failedChecks, thresholds, console }.
 */
async function smoke (script, envVars = [], scriptType = 'http') {
  if (!status().installed) return { ok: false, notInstalled: true, error: 'k6 is not installed' }
  return withScript(script, async dir => {
    await fsp.writeFile(path.join(dir, 'smoke.js'), smokeWrapper(scriptType))
    const summaryPath = path.join(dir, 'summary.json')
    const envFlags = envVars.filter(e => e.key).flatMap(e => ['--env', `${e.key}=${e.value ?? ''}`])
    const env = scriptType === 'browser' ? browserEnv() : {}
    const r = await run(['run', '--quiet', '--summary-export', summaryPath, ...envFlags, path.join(dir, 'smoke.js')], { env })
    if (r.spawnError) return { ok: false, error: r.spawnError, console: r.log }
    if (r.timedOut) return { ok: false, error: 'The smoke run took longer than 2 minutes and was stopped', console: r.log }
    let summary = null
    try { summary = JSON.parse(await fsp.readFile(summaryPath, 'utf8')) } catch { /* k6 failed before writing it */ }
    if (!summary) return { ok: false, error: `k6 exited ${r.code} without results`, console: r.log }
    const m = summary.metrics || {}
    const thresholds = []
    for (const [metric, data] of Object.entries(m)) {
      for (const [expr, val] of Object.entries(data?.thresholds || {})) {
        thresholds.push({ metric, expr, passed: typeof val === 'object' && val !== null ? val.ok === true : val === false })
      }
    }
    const checks = { passes: m.checks?.passes || 0, fails: m.checks?.fails || 0 }
    const failed = failedChecks(summary.root_group)
    return {
      ok: (r.code === 0 || r.code === 99) && checks.fails === 0 && thresholds.every(t => t.passed),
      exitCode: r.code,
      requests: m.http_reqs?.count || 0,
      failedRequestRate: m.http_req_failed?.value ?? null,
      avgDurationMs: m.http_req_duration?.avg ?? null,
      checks,
      failedChecks: failed,
      thresholds,
      console: r.log
    }
  })
}

module.exports = { K6_VERSION, status, install, inspect, smoke, assetName, extractFromTar, binaryPath, smokeWrapper, browserEnv }
