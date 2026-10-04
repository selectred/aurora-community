// ============================================
// routes/tracker.js — /api/tracker
// Issue tracker (Jira / Azure DevOps) settings, requirement import and bug push.
// ============================================
const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { authMiddleware } = require('../middleware/auth')
const {
  PROVIDERS, TrackerError, createAdapter, loadTrackerSettings, getConfiguredAdapter,
  pickConfig, buildBugSections, parseJson
} = require('../services/trackers')
const { normaliseSeverity } = require('../services/trackers/common')

router.use(authMiddleware)

// Bug ids with a push in progress, so a double-click can't create two tickets.
const pushesInFlight = new Set()

function handle (fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof TrackerError) {
        return res.status(err.status).json({ success: false, message: err.message })
      }
      console.error('[Tracker]', err)
      res.status(500).json({ success: false, message: 'Issue tracker request failed' })
    }
  }
}

/**
 * Resolve the provider/config/token to use for a test or project listing.
 * The settings form sends unsaved values; a blank token means "use the saved one"
 * as long as the provider hasn't changed.
 */
async function resolveDraft (body = {}) {
  const saved = await loadTrackerSettings()
  const provider = body.provider || saved.provider
  const config = body.config ? pickConfig(provider, body.config) : saved.config
  const token = body.token || (provider === saved.provider ? saved.token : '')
  return createAdapter(provider, config, token)
}

// GET /api/tracker/config — never returns the token
router.get('/config', handle(async (req, res) => {
  const { provider, config, token } = await loadTrackerSettings()
  res.json({
    success: true,
    provider,
    label: PROVIDERS[provider]?.label || null,
    config,
    hasToken: !!token,
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label }))
  })
}))

// PUT /api/tracker/config — { provider, config, token? }
router.put('/config', handle(async (req, res) => {
  const { provider, config = {}, token } = req.body
  if (provider !== 'none' && !PROVIDERS[provider]) {
    throw new TrackerError(`Unknown tracker "${provider}".`, 400)
  }
  const saved = await loadTrackerSettings()
  const data = {
    trackerProvider: provider,
    trackerConfigJson: JSON.stringify(provider === 'none' ? {} : pickConfig(provider, config))
  }
  // Keep the saved token unless a new one is supplied; drop it on provider change or disconnect.
  if (provider === 'none' || provider !== saved.provider) data.trackerToken = ''
  if (token) data.trackerToken = String(token).trim()

  if (saved.settings) {
    await prisma.appSettings.update({ where: { id: saved.settings.id }, data })
  } else {
    await prisma.appSettings.create({ data })
  }
  const next = await loadTrackerSettings()
  res.json({ success: true, provider: next.provider, config: next.config, hasToken: !!next.token })
}))

// POST /api/tracker/test — test saved or draft settings
router.post('/test', handle(async (req, res) => {
  const adapter = await resolveDraft(req.body)
  const result = await adapter.testConnection()
  res.json({ success: true, ...result })
}))

// POST /api/tracker/projects — list projects with saved or draft settings
router.post('/projects', handle(async (req, res) => {
  const adapter = await resolveDraft(req.body)
  res.json({ success: true, projects: await adapter.listProjects() })
}))

// POST /api/tracker/requirements — { project?, query?, limit? } → items for the ambiguity gate
router.post('/requirements', handle(async (req, res) => {
  const { config } = await loadTrackerSettings()
  const adapter = await getConfiguredAdapter()
  const { project, query, limit } = req.body || {}
  const { items, sources } = await adapter.fetchRequirements({
    project: project || config.defaultProject,
    query,
    limit
  })
  res.json({
    success: true,
    provider: adapter.provider,
    items: items.map((item, i) => ({ id: i, ...item })),
    sources
  })
}))

// POST /api/tracker/bugs/:id — push an Aurora bug report to the tracker as a ticket
router.post('/bugs/:id', handle(async (req, res) => {
  const bug = await prisma.bugReport.findUnique({
    where: { id: req.params.id },
    include: { spec: { select: { name: true, url: true } } }
  })
  if (!bug) return res.status(404).json({ success: false, message: 'Bug report not found' })
  if (bug.trackerKey) {
    return res.status(409).json({
      success: false,
      message: `Already pushed as ${bug.trackerKey}.`,
      trackerKey: bug.trackerKey,
      trackerUrl: bug.trackerUrl
    })
  }

  if (pushesInFlight.has(bug.id)) {
    return res.status(409).json({ success: false, message: 'This bug is already being pushed.' })
  }
  pushesInFlight.add(bug.id)
  let created, adapter
  const severity = normaliseSeverity(bug.severity)
  try {
    // Re-check inside the slot: a request that loaded the bug before an earlier push
    // saved its link would otherwise create a duplicate ticket.
    const fresh = await prisma.bugReport.findUnique({ where: { id: bug.id }, select: { trackerKey: true, trackerUrl: true } })
    if (fresh?.trackerKey) {
      return res.status(409).json({ success: false, message: `Already pushed as ${fresh.trackerKey}.`, trackerKey: fresh.trackerKey, trackerUrl: fresh.trackerUrl })
    }
    adapter = await getConfiguredAdapter()
    created = await adapter.createIssue({
      project: req.body?.project,
      title: bug.title,
      sections: buildBugSections(bug),
      severity,
      labels: ['aurora', `severity-${severity}`]
    })
    const history = parseJson(bug.historyJson, [])
    history.push({ at: new Date().toISOString(), field: 'tracker', from: null, to: created.key })
    await prisma.bugReport.update({
      where: { id: bug.id },
      data: { trackerKey: created.key, trackerUrl: created.url, historyJson: JSON.stringify(history) }
    })
  } finally {
    // Released only after the link is saved, so a late second request sees trackerKey.
    pushesInFlight.delete(bug.id)
  }
  res.json({ success: true, provider: adapter.provider, trackerKey: created.key, trackerUrl: created.url })
}))

module.exports = router
