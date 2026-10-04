// k6 converter tests. Run: npm test
// The end-to-end test runs the generated script with real k6 when available
// (K6_BIN or `k6` on PATH) against an API that issues fresh tokens and ids on
// every run — it only passes if correlation works.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { convert, classify } = require('../services/k6/k6Converter')

const K6 = process.env.K6_BIN || 'k6'
const hasK6 = spawnSync(K6, ['version']).status === 0

const { recording, RECORDED_TOKEN } = require('./fixtures/recording')

test('classify keeps the site API and drops noise with reasons', () => {
  const c = classify(recording('https://shop.example.com'), { startUrl: 'https://shop.example.com/login' })
  const reasons = Object.fromEntries(c.map(t => [t.url.replace('https://', ''), t.reason]))
  assert.equal(reasons['shop.example.com/api/login'], null)
  assert.equal(reasons['shop.example.com/assets/app.js'], 'static file')
  assert.equal(reasons['www.google-analytics.com/g/collect?v=2'], 'analytics / tracker')
  assert.equal(reasons['cdn.othervendor.net/widget.json'], 'third-party host')
  assert.equal(c.find(t => t.method === 'OPTIONS').reason, 'CORS preflight')
  assert.match(c.find(t => t.url.endsWith('/api/broken')).reason, /^failed/)
})

test('convert correlates token and id, hides secrets, groups by page', () => {
  const { script, envVars, summary } = convert(recording('https://shop.example.com'), { startUrl: 'https://shop.example.com/login', name: 'Checkout' })
  assert.equal(summary.kept, 4)
  assert.ok(!script.includes(RECORDED_TOKEN), 'recorded token must not be replayed')
  assert.ok(!script.includes('hunter2'), 'password must not be in the script')
  assert.ok(!script.includes('/api/orders/90210'), 'recorded order id must not be replayed')
  assert.match(script, /token = res\.json\("token"\)/)
  assert.match(script, /id = res\.json\("items\.0\.id"\)/)
  assert.match(script, /"Authorization": `Bearer \$\{token\}`/)
  assert.match(script, /\$\{BASE_URL\}\/api\/orders\/\$\{id\}/)
  assert.match(script, /tags: \{ name: "GET \/api\/orders\/\{id\}" \}/)
  assert.match(script, /"password": __ENV\.PASSWORD/)
  assert.deepEqual(envVars.map(e => [e.key, e.sensitive]), [['BASE_URL', false], ['PASSWORD', true]])
  assert.deepEqual(summary.correlations.map(c => [c.variable, c.path]), [['token', 'token'], ['id', 'items.0.id']])
  assert.equal((script.match(/group\(/g) || []).length, 3)
  assert.match(script, /group\("\/orders\/\{id\}"/)
  assert.ok(!script.includes('90210'), 'no recorded id anywhere, including group names')
})

test('exclude and includeHosts let the user change the selection', () => {
  const traffic = recording('https://shop.example.com')
  const loginSeq = traffic.find(t => t.method === 'POST' && t.url.endsWith('/api/login')).seq
  const r = convert(traffic, { startUrl: 'https://shop.example.com/login', exclude: [loginSeq] })
  assert.equal(r.requests.find(q => q.seq === loginSeq).reason, 'excluded by you')
  assert.ok(r.script.includes('AUTH_HEADER'), 'without the login response, the Authorization header becomes a secret')
  const withCdn = convert(traffic, { startUrl: 'https://shop.example.com/login', includeHosts: ['https://shop.example.com', 'https://cdn.othervendor.net'] })
  assert.equal(withCdn.summary.kept, 5)
  assert.ok(withCdn.envVars.some(e => e.key === 'CDN_URL'))
})

test('generated script passes against a live API with fresh tokens', { skip: !hasK6 && 'k6 not installed' }, async () => {
  const tokens = new Set()
  const orders = new Map()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj || {})) }
      const auth = (req.headers.authorization || '').replace('Bearer ', '')
      if (req.url === '/login') return res.end('<html></html>')
      if (req.url === '/api/login' && req.method === 'POST') {
        const { password } = JSON.parse(body || '{}')
        if (password !== 's3cret-for-test') return send(401)
        const t = `tok-${Math.random().toString(36).slice(2)}-${Date.now()}`
        tokens.add(t)
        return send(200, { token: t, user: { id: 1 } })
      }
      if (!tokens.has(auth)) return send(401)
      if (req.url === '/api/orders?limit=10') {
        const id = Math.floor(10000 + Math.random() * 80000)
        orders.set(String(id), auth)
        return send(200, { items: [{ id, total: 1 }] })
      }
      const m = req.url.match(/^\/api\/orders\/(\d+)$/)
      if (m && orders.get(m[1]) === auth) return send(200, { id: Number(m[1]), status: 'shipped' })
      send(404)
    })
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k6conv-'))
  try {
    const { script } = convert(recording(origin), { startUrl: `${origin}/login`, thinkTimeSec: 0 })
    fs.writeFileSync(path.join(dir, 's.js'), script)
    const summaryPath = path.join(dir, 'sum.json')
    const code = await new Promise(resolve => {
      const p = spawn(K6, ['run', '--quiet', '--summary-export', summaryPath, '--env', 'PASSWORD=s3cret-for-test', path.join(dir, 's.js')])
      p.on('close', resolve)
    })
    const sum = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    assert.equal(sum.metrics.checks.fails, 0, 'every check passes with live, correlated values')
    assert.equal(sum.metrics.http_reqs.count, 4)
    assert.equal(code, 0)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
