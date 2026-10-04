// Contract tests for the Jira and Azure DevOps adapters.
// A local HTTP server stands in for Jira Cloud, Jira Server/DC and Azure DevOps,
// asserting the requests each adapter sends and returning documented response shapes.
// Run: npm test  (node --test)
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const { createJiraAdapter } = require('../services/trackers/jira')
const { createAdoAdapter } = require('../services/trackers/ado')
const common = require('../services/trackers/common')
const { buildBugSections } = require('../services/trackers')

const seen = [] // every request the fake server received
let base
let server

const b64 = s => Buffer.from(s).toString('base64')
const JIRA_CLOUD_AUTH = 'Basic ' + b64('qa@example.com:cloud-token')
const JIRA_SERVER_AUTH = 'Bearer server-pat'
const ADO_AUTH = 'Basic ' + b64(':ado-pat')

const adfDescription = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'As a shopper I want to pay by card.' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Acceptance Criteria' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'When the card is declined, the system shall show the decline reason' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The page should be fast' }] }] }
      ]
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Not a criterion' }] }
  ]
}

function send (res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const entry = { method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, body: raw ? JSON.parse(raw) : null }
      seen.push(entry)
      const auth = req.headers.authorization
      const p = url.pathname

      // ── Jira Cloud (REST v3) ──
      if (p.startsWith('/cloud/rest/api/3/')) {
        if (auth !== JIRA_CLOUD_AUTH) return send(res, 401, { errorMessages: ['Client must be authenticated'] })
        if (p.endsWith('/myself')) return send(res, 200, { displayName: 'QA Lead' })
        if (p.endsWith('/project/search')) return send(res, 200, { values: [{ key: 'PAY', name: 'Payments' }], isLast: true })
        if (p.endsWith('/search/jql')) {
          return send(res, 200, {
            issues: [
              { key: 'PAY-1', fields: { summary: 'Card payments', description: adfDescription } },
              { key: 'PAY-2', fields: { summary: 'Refunds', description: null } }
            ]
          })
        }
        if (p.endsWith('/issue') && req.method === 'POST') return send(res, 201, { id: '10001', key: 'PAY-101' })
      }

      // ── Jira Server / Data Center (REST v2) ──
      if (p.startsWith('/server/rest/api/2/')) {
        if (auth !== JIRA_SERVER_AUTH) return send(res, 401, { errorMessages: ['Unauthorized'] })
        if (p.endsWith('/myself')) return send(res, 200, { name: 'qa.lead' })
        if (p.endsWith('/project')) return send(res, 200, [{ key: 'OPS', name: 'Operations' }])
        if (p.endsWith('/search')) {
          return send(res, 200, {
            issues: [{
              key: 'OPS-7',
              fields: {
                summary: 'Export report',
                description: 'h2. Background\nSomething',
                customfield_10035: 'Given a finished run\nWhen the user clicks Export\nThen the system shall download a PDF\n* The file must be under 5 MB'
              }
            }]
          })
        }
        if (p.endsWith('/issue') && req.method === 'POST') return send(res, 201, { id: '2', key: 'OPS-55' })
      }

      // ── Azure DevOps ──
      if (p.startsWith('/org/')) {
        if (auth !== ADO_AUTH) return send(res, 401)
        if (p === '/org/_apis/projects') return send(res, 200, { count: 1, value: [{ name: 'Shop' }] })
        if (p === '/org/_apis/connectionData') return send(res, 200, { authenticatedUser: { providerDisplayName: 'Dev Ops' } })
        if (p === '/org/Shop/_apis/wit/wiql') return send(res, 200, { workItems: [{ id: 11 }, { id: 12 }] })
        if (p === '/org/Shop/_apis/wit/workitems') {
          return send(res, 200, {
            value: [
              { id: 11, fields: { 'System.Title': 'Basket totals', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<ul><li>If a voucher is applied, the total shall update</li><li>Totals are appropriate</li></ul>' } },
              { id: 12, fields: { 'System.Title': 'Wishlist', 'System.Description': '<div>Let users save items</div>' } }
            ]
          })
        }
        if (p === '/org/Shop/_apis/wit/workitems/$Bug' && req.method === 'POST') return send(res, 200, { id: 4521 })
      }
      send(res, 404, { message: 'no route' })
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server.close())

const last = () => seen[seen.length - 1]

// ── Text helpers ─────────────────────────────────────────────────────────

test('splitCriteria keeps Given/When/Then together and splits bullets', () => {
  const items = common.splitCriteria('Given a user\nWhen they log in\nThen the dashboard shall load\n- The button must be blue\n1. AC2: If offline, the app shall queue')
  assert.deepEqual(items, [
    'Given a user When they log in Then the dashboard shall load',
    'The button must be blue',
    'If offline, the app shall queue'
  ])
})

test('htmlToText turns ADO HTML into lines', () => {
  assert.equal(common.htmlToText('<ul><li>One &amp; two</li><li>Three</li></ul>'), '- One & two\n- Three')
})

test('extractAcSection stops at the next heading', () => {
  assert.equal(common.extractAcSection('Intro\n# Acceptance Criteria\n- a\n- b\n# Notes\n- c'), '- a\n- b')
})

// ── Jira Cloud ───────────────────────────────────────────────────────────

test('Jira Cloud: connection, projects, requirements and issue creation', async () => {
  const jira = createJiraAdapter({ baseUrl: `${base}/cloud/`, deployment: 'cloud', email: 'qa@example.com', defaultProject: 'PAY' }, 'cloud-token')

  assert.deepEqual(await jira.testConnection(), { ok: true, user: 'QA Lead' })
  assert.deepEqual(await jira.listProjects(), [{ key: 'PAY', name: 'Payments' }])

  const { items, sources } = await jira.fetchRequirements({ project: 'PAY', limit: 10 })
  const q = last().query
  assert.equal(last().path, '/cloud/rest/api/3/search/jql', 'Cloud must use the /search/jql endpoint')
  assert.match(q.get('jql'), /^project = "PAY" AND issuetype in \(Story, Task\)/)
  assert.equal(q.get('maxResults'), '10')
  assert.deepEqual(items, [
    { type: 'AC', text: 'When the card is declined, the system shall show the decline reason', reference: 'PAY-1' },
    { type: 'AC', text: 'The page should be fast', reference: 'PAY-1' },
    { type: 'User Story', text: 'Refunds', reference: 'PAY-2' }
  ])
  assert.equal(sources[0].url, `${base}/cloud/browse/PAY-1`)

  const created = await jira.createIssue({ title: 'Checkout fails', sections: [{ heading: 'Error', text: 'boom', code: true }], labels: ['aurora', 'severity high'] })
  assert.deepEqual(created, { key: 'PAY-101', url: `${base}/cloud/browse/PAY-101` })
  const body = last().body
  assert.equal(body.fields.project.key, 'PAY')
  assert.equal(body.fields.issuetype.name, 'Bug')
  assert.equal(body.fields.description.type, 'doc', 'Cloud descriptions must be ADF')
  assert.equal(body.fields.description.content[1].type, 'codeBlock')
  assert.deepEqual(body.fields.labels, ['aurora', 'severity-high'])
})

test('Jira Cloud: bad token gives a readable error', async () => {
  const jira = createJiraAdapter({ baseUrl: `${base}/cloud`, deployment: 'cloud', email: 'qa@example.com' }, 'wrong')
  await assert.rejects(jira.testConnection(), err => {
    assert.equal(err.name, 'TrackerError')
    assert.equal(err.status, 400)
    assert.match(err.message, /rejected the credentials/)
    return true
  })
})

test('Jira Cloud: missing email is caught before any request', () => {
  assert.throws(() => createJiraAdapter({ baseUrl: base, deployment: 'cloud' }, 't'), /account email/)
})

// ── Jira Server / DC ─────────────────────────────────────────────────────

test('Jira Server: PAT auth, v2 API, custom AC field, wiki description', async () => {
  const jira = createJiraAdapter({ baseUrl: `${base}/server`, deployment: 'server', acField: 'customfield_10035', issueType: 'Defect' }, 'server-pat')

  assert.deepEqual(await jira.testConnection(), { ok: true, user: 'qa.lead' })
  assert.deepEqual(await jira.listProjects(), [{ key: 'OPS', name: 'Operations' }])

  const { items } = await jira.fetchRequirements({ query: 'project = OPS' })
  assert.equal(last().path, '/server/rest/api/2/search')
  assert.equal(last().query.get('jql'), 'project = OPS')
  assert.match(last().query.get('fields'), /customfield_10035/)
  assert.deepEqual(items.map(i => i.text), [
    'Given a finished run When the user clicks Export Then the system shall download a PDF',
    'The file must be under 5 MB'
  ])

  await jira.createIssue({ project: 'OPS', title: 'x', sections: [{ heading: 'Error', text: 'boom', code: true }] })
  const body = last().body
  assert.equal(body.fields.issuetype.name, 'Defect')
  assert.equal(typeof body.fields.description, 'string', 'Server descriptions are wiki text')
  assert.match(body.fields.description, /h3\. Error\n\{noformat\}\nboom\n\{noformat\}/)
})

// ── Azure DevOps ─────────────────────────────────────────────────────────

test('Azure DevOps: connection, projects, WIQL requirements and bug creation', async () => {
  const ado = createAdoAdapter({ orgUrl: `${base}/org`, defaultProject: 'Shop' }, 'ado-pat')

  assert.deepEqual(await ado.testConnection(), { ok: true, user: 'Dev Ops' })
  assert.deepEqual(await ado.listProjects(), [{ key: 'Shop', name: 'Shop' }])

  const { items, sources } = await ado.fetchRequirements({ limit: 5 })
  const wiql = seen.find(r => r.path === '/org/Shop/_apis/wit/wiql')
  assert.match(wiql.body.query, /\[System\.TeamProject\] = @project/)
  assert.equal(wiql.query.get('$top'), '5')
  assert.equal(last().query.get('ids'), '11,12')
  assert.deepEqual(items, [
    { type: 'AC', text: 'If a voucher is applied, the total shall update', reference: '#11' },
    { type: 'AC', text: 'Totals are appropriate', reference: '#11' },
    { type: 'User Story', text: 'Wishlist — Let users save items', reference: '#12' }
  ])
  assert.equal(sources[0].url, `${base}/org/Shop/_workitems/edit/11`)

  const created = await ado.createIssue({ title: 'Checkout fails', severity: 'high', sections: [{ heading: 'Error', text: '<boom>', code: true }], labels: ['aurora'] })
  assert.deepEqual(created, { key: '4521', url: `${base}/org/Shop/_workitems/edit/4521` })
  const req = last()
  assert.equal(req.headers['content-type'], 'application/json-patch+json')
  const ops = Object.fromEntries(req.body.map(o => [o.path, o.value]))
  assert.equal(ops['/fields/System.Title'], 'Checkout fails')
  assert.equal(ops['/fields/Microsoft.VSTS.Common.Severity'], '2 - High')
  assert.equal(ops['/fields/Microsoft.VSTS.TCM.ReproSteps'], '<h3>Error</h3><pre>&lt;boom&gt;</pre>')
  assert.equal(ops['/fields/System.Tags'], 'aurora')
})

test('Azure DevOps: non-Bug work item types get a description instead of repro steps', async () => {
  const ado = createAdoAdapter({ orgUrl: `${base}/org`, defaultProject: 'Shop', workItemType: 'Issue' }, 'ado-pat')
  await ado.createIssue({ title: 't', sections: [{ text: 'hello' }] }).catch(() => {}) // fake server 404s $Issue; we only inspect the request
  const ops = Object.fromEntries(last().body.map(o => [o.path, o.value]))
  assert.equal(last().path, '/org/Shop/_apis/wit/workitems/$Issue')
  assert.equal(ops['/fields/System.Description'], '<p>hello</p>')
  assert.equal(ops['/fields/Microsoft.VSTS.Common.Severity'], undefined)
})

// ── Bug description ──────────────────────────────────────────────────────

test('buildBugSections includes the facts a triager needs', () => {
  const sections = buildBugSections({
    severity: 'HIGH', source: 'pack', consecutiveFails: 3,
    firstFailedAt: '2026-09-01T10:00:00Z', lastFailedAt: '2026-09-02T10:00:00Z',
    spec: { name: 'Checkout', url: 'https://shop.example' },
    reproSteps: '1. Add item\n2. Pay', errorMessage: 'Timeout', stackTrace: 'at x', evidenceDir: 'bundle-1'
  })
  assert.deepEqual(sections.map(s => s.heading), ['Reported by Aurora', 'Steps to reproduce', 'Error', 'Stack trace', 'Evidence'])
  assert.match(sections[0].text, /Severity: high/)
  assert.match(sections[0].text, /Test: Checkout/)
  assert.equal(sections[2].code, true)
})
