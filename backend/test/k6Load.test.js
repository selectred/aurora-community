// Load profiles, the run wrapper and result parsing for local performance runs.
// The wrapper test runs real k6 (K6_BIN or installed via Aurora).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const L = require('../services/k6/k6Load')
const k6Tool = require('../services/k6/k6Tool')
const { readTimeseries } = require('../services/k6/perfRunner')

const hasK6 = k6Tool.status().installed

test('validateLoad: ramping profile is normalised; 20 users is the ceiling', () => {
  const ok = L.validateLoad({ executor: 'ramping-vus', startVUs: '0', stages: [{ duration: '30s', target: '10' }, { duration: '1m', target: 20 }, { duration: '10s', target: 0 }] })
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.load, { executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '30s', target: 10 }, { duration: '1m', target: 20 }, { duration: '10s', target: 0 }] })
  assert.equal(L.peakVus(ok.load), 20)
  assert.equal(L.totalDurationSec(ok.load), 100)

  const over = L.validateLoad({ executor: 'constant-vus', vus: 21, duration: '1m' })
  assert.match(over.errors[0], /limited to 20/)
  // A lower cap from settings applies, but never a higher one.
  assert.match(L.validateLoad({ executor: 'constant-vus', vus: 8, duration: '1m' }, { cap: 5 }).errors[0], /limited to 5/)
  assert.match(L.validateLoad({ executor: 'constant-vus', vus: 25, duration: '1m' }, { cap: 50 }).errors[0], /limited to 20/)
})

test('validateLoad: rejects bad durations, empty stages, overlong runs and zero load', () => {
  assert.match(L.validateLoad({ executor: 'constant-vus', vus: 2, duration: '5 minutes' }).errors[0], /duration like/)
  assert.match(L.validateLoad({ executor: 'ramping-vus', stages: [] }).errors[0], /at least one stage/)
  assert.match(L.validateLoad({ executor: 'constant-vus', vus: 2, duration: '2h' }).errors[0], /limited to 60 minutes/)
  assert.match(L.validateLoad({ executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '10s', target: 0 }] }).errors[0], /never starts/)
  assert.match(L.validateLoad({ executor: 'nope' }).errors[0], /Unknown load type/)
  const ar = L.validateLoad({ executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '1m', preAllocatedVUs: 5, maxVUs: 3 })
  assert.match(ar.errors[0], /at least the pre-allocated/)
})

test('loadOptions and profilePoints', () => {
  const { load } = L.validateLoad({ executor: 'ramping-vus', startVUs: 2, stages: [{ duration: '10s', target: 6 }] })
  const o = L.loadOptions(load, { p95Ms: 800, avgMs: null, maxFailRatePct: 2 })
  assert.deepEqual(o.scenarios.load, { executor: 'ramping-vus', startVUs: 2, stages: [{ duration: '10s', target: 6 }] })
  assert.deepEqual(o.thresholds, { http_req_duration: ['p(95)<800'], http_req_failed: ['rate<0.02'] })
  assert.deepEqual(L.profilePoints(load), [{ tSec: 0, vus: 2 }, { tSec: 10, vus: 6 }])
  const b = L.loadOptions({ executor: 'constant-vus', vus: 1, duration: '5s' }, {}, 'browser')
  assert.deepEqual(b.scenarios.load.options, { browser: { type: 'chromium' } })
})

test('parseSummary reads both threshold formats; compareMetrics flags regressions', () => {
  const s = {
    metrics: {
      http_reqs: { count: 120, rate: 12 },
      http_req_duration: { avg: 110, med: 100, 'p(90)': 180, 'p(95)': 200, max: 400, thresholds: { 'p(95)<150': true } },
      http_req_failed: { value: 0.02, thresholds: { 'rate<0.05': { ok: true } } },
      vus_max: { value: 5 },
      checks: { passes: 118, fails: 2 }
    }
  }
  const { metrics, thresholds } = L.parseSummary(s)
  assert.equal(metrics.p95Duration, 200)
  assert.equal(metrics.peakVus, 5)
  assert.equal(metrics.checksFailed, 2)
  assert.deepEqual(thresholds.map(t => [t.expr, t.passed]), [['p(95)<150', false], ['rate<0.05', true]])

  const cmp = L.compareMetrics({ p95Duration: 230, avgDuration: 105, failRate: 0.025 }, { p95Duration: 200, avgDuration: 100, failRate: 0.02 })
  assert.equal(cmp.regressed, true)
  assert.deepEqual(cmp.deltas.find(d => d.metric === 'p95Duration'), { metric: 'p95Duration', baseline: 200, current: 230, changePct: 15, regressed: true })
  assert.equal(cmp.deltas.find(d => d.metric === 'avgDuration').regressed, false)
  assert.equal(cmp.deltas.find(d => d.metric === 'failRate').regressed, false)
})

test('parseProgress reads k6 progress lines', () => {
  const p = L.parseProgress('running (02.0s), 1/3 VUs, 4 complete and 0 interrupted iterations')
  assert.deepEqual(p, { elapsed: '02.0s', vus: 1, maxVus: 3, iterations: 4, interrupted: 0 })
  assert.deepEqual(L.parseProgress('load   [  33% ] 1/3 VUs  2.0s/6.0s', p), { ...p, pct: 33 })
  assert.equal(L.parseProgress('     data_received....: 1 kB'), null)
})

test('timeseries buckets k6 points', () => {
  const ts = L.createTimeseries()
  const at = s => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()
  const pt = (metric, s, value) => JSON.stringify({ type: 'Point', metric, data: { time: at(s), value } })
  ts.add(pt('vus', 0, 1))
  ts.add(pt('http_req_duration', 1, 100))
  ts.add(pt('http_req_duration', 2, 300))
  ts.add(pt('http_req_failed', 2, 1))
  ts.add(pt('vus', 6, 4))
  ts.add('not json')
  const r = ts.result()
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { tSec: 0, vus: 1, reqRate: 0.4, avgDuration: 200, maxDuration: 300, failRate: 1, iterations: 0 })
  assert.equal(r[1].vus, 4)
})

test('the wrapper runs a script under a profile with real k6', { skip: !hasK6 && 'k6 not installed' }, async () => {
  let hits = 0
  const server = http.createServer((req, res) => { hits++; res.end('ok') })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'k6load-test-'))
  try {
    // The script asks for 50 users for 10 minutes; the profile must replace that.
    await fsp.writeFile(path.join(dir, 'scenario.js'), `import http from 'k6/http'
import { check, sleep } from 'k6'
export const options = { vus: 50, duration: '10m', thresholds: { checks: ['rate>0.9'] } }
export default function () { check(http.get(__ENV.BASE_URL), { ok: r => r.status === 200 }); sleep(0.2) }`)
    const { load } = L.validateLoad({ executor: 'ramping-vus', startVUs: 0, stages: [{ duration: '2s', target: 3 }, { duration: '1s', target: 0 }] })
    await fsp.writeFile(path.join(dir, 'run.js'), L.buildWrapper(load, { p95Ms: 5000, maxFailRatePct: 1 }))
    const t0 = Date.now()
    const code = await new Promise(resolve => {
      const p = spawn(k6Tool.binaryPath(), ['run', '--quiet', '--summary-export', 'summary.json', '--out', 'json=raw.json.gz', '--env', `BASE_URL=http://127.0.0.1:${server.address().port}/`, 'run.js'], { cwd: dir })
      p.on('close', resolve)
    })
    assert.equal(code, 0)
    assert.ok(Date.now() - t0 < 40000, 'ran the 3s profile, not the script\'s 10m')
    const { metrics, thresholds } = L.parseSummary(JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')))
    assert.ok(metrics.peakVus <= 3)
    assert.ok(hits > 3)
    // Script thresholds are kept and the scenario's are added.
    assert.deepEqual(thresholds.map(t => t.expr).sort(), ['p(95)<5000', 'rate<0.01', 'rate>0.9'])
    assert.ok(thresholds.every(t => t.passed))
    const ts = await readTimeseries(path.join(dir, 'raw.json.gz'))
    assert.ok(ts.length >= 1)
    assert.ok(ts.some(b => b.avgDuration !== null))
  } finally {
    server.close()
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('bucket size follows the planned run length', () => {
  assert.equal(L.bucketMsFor({ executor: 'constant-vus', vus: 1, duration: '9s' }), 1000)
  assert.equal(L.bucketMsFor({ executor: 'constant-vus', vus: 1, duration: '1h' }), 24000)
  const ts = L.createTimeseries({ bucketMs: 1000 })
  const at = s => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString()
  for (let s = 0; s < 5; s++) ts.add(JSON.stringify({ type: 'Point', metric: 'vus', data: { time: at(s), value: s } }))
  assert.equal(ts.result().length, 5)
})
