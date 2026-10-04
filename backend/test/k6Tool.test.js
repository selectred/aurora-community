// k6Tool tests. The smoke tests need k6 (K6_BIN or installed via Aurora).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const k6Tool = require('../services/k6/k6Tool')

const hasK6 = k6Tool.status().installed

test('asset names per platform', () => {
  assert.equal(k6Tool.assetName('darwin', 'arm64'), `k6-v${k6Tool.K6_VERSION}-macos-arm64.zip`)
  assert.equal(k6Tool.assetName('win32', 'x64'), `k6-v${k6Tool.K6_VERSION}-windows-amd64.zip`)
  assert.equal(k6Tool.assetName('linux', 'x64'), `k6-v${k6Tool.K6_VERSION}-linux-amd64.tar.gz`)
  assert.throws(() => k6Tool.assetName('aix', 'ppc64'), /not available/)
})

test('smoke run: one iteration, failed checks named with their group', { skip: !hasK6 && 'k6 not installed' }, async () => {
  const server = http.createServer((req, res) => { res.statusCode = req.url === '/bad' ? 500 : 200; res.end('ok') })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  try {
    const script = `import http from 'k6/http'
import { check, group } from 'k6'
export const options = { vus: 20, duration: '5m', thresholds: { http_req_duration: ['p(95)<2000'] } }
export default function () {
  group('Home', () => { check(http.get(__ENV.BASE_URL + '/'), { 'home is 200': r => r.status === 200 }) })
  group('Broken page', () => { check(http.get(__ENV.BASE_URL + '/bad'), { 'bad is 200': r => r.status === 200 }) })
}`
    const t0 = Date.now()
    const r = await k6Tool.smoke(script, [{ key: 'BASE_URL', value: `http://127.0.0.1:${server.address().port}` }])
    assert.ok(Date.now() - t0 < 20000, "the script's own 5m load is replaced by one iteration")
    assert.equal(r.requests, 2)
    assert.deepEqual(r.checks, { passes: 1, fails: 1 })
    assert.deepEqual(r.failedChecks, [{ name: 'bad is 200', group: 'Broken page' }])
    assert.equal(r.ok, false)
    assert.ok(r.thresholds.some(t => t.expr === 'p(95)<2000' && t.passed))
  } finally {
    server.close()
  }
})

test('inspect rejects a script k6 cannot load', { skip: !hasK6 && 'k6 not installed' }, async () => {
  assert.equal((await k6Tool.inspect('export default function () {}')).ok, true)
  const bad = await k6Tool.inspect('export default function ( {')
  assert.equal(bad.ok, false)
  assert.ok(bad.error.length > 0)
})
