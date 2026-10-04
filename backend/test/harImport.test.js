// HAR import: browser network logs mapped onto recorder traffic, then converted.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harToTraffic } = require('../services/k6/harImport')
const { convert } = require('../services/k6/k6Converter')

const entry = (o) => ({
  startedDateTime: o.at,
  pageref: o.pageref,
  _resourceType: o.type,
  request: {
    method: o.method || 'GET',
    url: o.url,
    headers: o.headers || [],
    ...(o.body ? { postData: { mimeType: 'application/json', text: JSON.stringify(o.body) } } : {})
  },
  response: {
    status: o.status ?? 200,
    content: o.json
      ? { mimeType: 'application/json', text: o.base64 ? Buffer.from(JSON.stringify(o.json)).toString('base64') : JSON.stringify(o.json), ...(o.base64 ? { encoding: 'base64' } : {}) }
      : { mimeType: o.mime || 'text/html', text: '' }
  }
})

const har = {
  log: {
    version: '1.2',
    pages: [{ id: 'page_1', title: 'https://shop.example.com/' }],
    entries: [
      entry({ at: '2026-10-01T10:00:00.000Z', pageref: 'page_1', type: 'document', url: 'https://shop.example.com/' }),
      entry({ at: '2026-10-01T10:00:00.100Z', pageref: 'page_1', type: 'stylesheet', url: 'https://shop.example.com/app.css', mime: 'text/css' }),
      entry({ at: '2026-10-01T10:00:00.200Z', pageref: 'page_1', type: 'xhr', url: 'https://www.google-analytics.com/collect', mime: 'image/gif' }),
      entry({ at: '2026-10-01T10:00:01.000Z', pageref: 'page_1', type: 'fetch', method: 'POST', url: 'https://shop.example.com/api/login', body: { email: 'qa@example.com', password: 'hunter2hunter2' }, json: { token: 'tok_abcdefghijklmnop' }, base64: true, headers: [{ name: 'Content-Type', value: 'application/json' }, { name: ':authority', value: 'x' }, { name: 'User-Agent', value: 'x' }] }),
      entry({ at: '2026-10-01T10:00:02.000Z', pageref: 'page_1', type: 'fetch', url: 'https://shop.example.com/api/basket', json: { items: [] }, headers: [{ name: 'Authorization', value: 'Bearer tok_abcdefghijklmnop' }] }),
      entry({ at: '2026-10-01T10:00:03.000Z', pageref: 'page_1', type: 'fetch', url: 'https://shop.example.com/api/blocked', status: 0 })
    ]
  }
}

test('harToTraffic maps entries, decodes base64 bodies and keeps useful headers only', () => {
  const r = harToTraffic(JSON.stringify(har))
  assert.equal(r.startUrl, 'https://shop.example.com/')
  assert.deepEqual(r.traffic.map(t => t.resourceType), ['document', 'xhr', 'fetch', 'fetch', 'fetch'])
  const login = r.traffic.find(t => t.url.endsWith('/login'))
  assert.deepEqual(login.responseJson, { token: 'tok_abcdefghijklmnop' })
  assert.deepEqual(Object.keys(login.requestHeaders), ['content-type'])
  assert.equal(r.traffic.at(-1).failure, 'no response')
  assert.equal(r.skipped, 1) // the stylesheet
})

test('a HAR converts to a k6 script with correlation and secrets as variables', () => {
  const { traffic, startUrl } = harToTraffic(har)
  const out = convert(traffic, { startUrl, name: 'Shop login' })
  assert.equal(out.summary.kept, 3)
  assert.ok(out.script.includes("res.json(\"token\")"), 'token read from the login response')
  assert.ok(!out.script.includes('tok_abcdefghijklmnop'), 'recorded token is not replayed')
  assert.ok(!out.script.includes('hunter2hunter2'), 'password is not in the script')
  assert.ok(out.summary.secrets.length >= 1)
})

test('firefox-style HARs without _resourceType are inferred', () => {
  const ff = JSON.parse(JSON.stringify(har))
  for (const e of ff.log.entries) delete e._resourceType
  const r = harToTraffic(ff)
  assert.equal(r.traffic[0].resourceType, 'document')
  assert.ok(r.traffic.some(t => t.url.endsWith('/api/basket') && t.resourceType === 'fetch'))
})

test('rejects files that are not HARs', () => {
  assert.throws(() => harToTraffic({ foo: 1 }), /not a HAR/)
})
