// A recorded login → orders → order-detail journey with typical noise.
const RECORDED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.recorded.signature'
function recording (origin) {
  const page = `${origin}/login`
  let seq = 0
  const e = (o) => ({ seq: seq++, page, resourceType: 'fetch', requestHeaders: {}, postData: null, status: 200, responseJson: null, failure: null, ...o })
  return [
    e({ method: 'GET', url: `${origin}/login`, resourceType: 'document' }),
    e({ method: 'GET', url: `${origin}/assets/app.js`, resourceType: 'fetch' }),
    e({ method: 'POST', url: 'https://www.google-analytics.com/g/collect?v=2' }),
    e({ method: 'GET', url: 'https://cdn.othervendor.net/widget.json' }),
    e({ method: 'OPTIONS', url: `${origin}/api/login` }),
    e({
      method: 'POST', url: `${origin}/api/login`,
      requestHeaders: { 'content-type': 'application/json', accept: 'application/json' },
      postData: JSON.stringify({ email: 'qa@example.com', password: 'hunter2hunter2' }),
      responseJson: { token: RECORDED_TOKEN, user: { id: 48213, name: 'QA' } }
    }),
    e({
      method: 'GET', url: `${origin}/api/orders?limit=10`, page: `${origin}/orders`,
      requestHeaders: { authorization: `Bearer ${RECORDED_TOKEN}`, accept: 'application/json' },
      responseJson: { items: [{ id: 90210, total: 12.5 }] }
    }),
    e({
      method: 'GET', url: `${origin}/api/orders/90210`, page: `${origin}/orders/90210`,
      requestHeaders: { authorization: `Bearer ${RECORDED_TOKEN}` },
      responseJson: { id: 90210, status: 'shipped' }
    }),
    e({ method: 'GET', url: `${origin}/api/broken`, failure: 'net::ERR_ABORTED' })
  ]
}

module.exports = { recording, RECORDED_TOKEN }
