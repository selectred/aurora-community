// ============================================
// routes/k6.js — /api/k6
// k6 load-test authoring from a recorded session: convert captured traffic,
// optionally improve with AI, smoke-run locally, push to Continuum.
// ============================================
const express = require('express')
const router = express.Router()
const { authMiddleware } = require('../middleware/auth')
const { checkContinuumEnabled } = require('../middleware/license')
const recording = require('../services/recordingService')
const { convert } = require('../services/k6/k6Converter')
const k6Tool = require('../services/k6/k6Tool')
const k6Ai = require('../services/k6/k6Ai')
const { pushPerfScenario } = require('../services/continuumService')

const MAX_SCRIPT_BYTES = 512 * 1024

function handle (fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err.status) return res.status(err.status).json({ success: false, message: err.message, detail: err.detail })
      console.error('[k6]', err)
      res.status(500).json({ success: false, message: err.message || 'k6 request failed' })
    }
  }
}

function requireScript (req) {
  const script = req.body?.script
  if (typeof script !== 'string' || !script.trim()) { const e = new Error('script is required'); e.status = 400; throw e }
  if (Buffer.byteLength(script) > MAX_SCRIPT_BYTES) { const e = new Error('Script is larger than 512 KB'); e.status = 413; throw e }
  return script
}

router.use(authMiddleware)

// GET /api/k6/status — is k6 installed on this machine?
router.get('/status', (req, res) => res.json({ success: true, ...k6Tool.status() }))

// GET /api/k6/install — download k6 (server-sent events, same shape as the browser download)
router.get('/install', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  const send = (type, data = {}) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  try {
    if (k6Tool.status().installed) { send('done', { message: 'k6 is already installed' }); return res.end() }
    send('start', { version: k6Tool.K6_VERSION })
    await k6Tool.install(p => send('progress', p))
    send('done', { message: `k6 ${k6Tool.K6_VERSION} installed` })
  } catch (err) {
    console.error('[k6] install failed:', err.message)
    send('error', { message: err.message || 'Download failed' })
  } finally {
    res.end()
  }
})

// POST /api/k6/convert — { sessionId, name?, thinkTimeSec?, exclude?, includeHosts? }
router.post('/convert', handle(async (req, res) => {
  const { sessionId, name, thinkTimeSec, exclude, includeHosts } = req.body || {}
  const captured = sessionId && recording.getTraffic(sessionId)
  if (!captured) return res.status(404).json({ success: false, message: 'No captured traffic for this recording. Recordings are kept for two hours; record the journey again.' })
  if (!captured.traffic.length) return res.status(422).json({ success: false, message: 'This recording captured no page loads or API calls.' })
  const result = convert(captured.traffic, {
    startUrl: captured.startUrl,
    name: name || 'Recorded journey',
    thinkTimeSec: thinkTimeSec ?? 1,
    exclude: Array.isArray(exclude) ? exclude : [],
    includeHosts: Array.isArray(includeHosts) && includeHosts.length ? includeHosts : null
  })
  res.json({ success: true, ...result })
}))

// POST /api/k6/improve — { script, summary? }
router.post('/improve', handle(async (req, res) => {
  const result = await k6Ai.improve(requireScript(req), req.body?.summary || {})
  res.json({ success: true, ...result })
}))

// POST /api/k6/smoke — { script, envVars?, scriptType? }  one VU, one iteration
router.post('/smoke', handle(async (req, res) => {
  const result = await k6Tool.smoke(requireScript(req), Array.isArray(req.body?.envVars) ? req.body.envVars : [], req.body?.scriptType || 'http')
  if (result.notInstalled) return res.status(409).json({ success: false, notInstalled: true, message: 'Install k6 first.' })
  res.json({ success: true, ...result })
}))

// POST /api/k6/push — { name, description?, script, envVars? } to Continuum's performance module
router.post('/push', checkContinuumEnabled, handle(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ success: false, message: 'name is required' })
  const result = await pushPerfScenario({
    name,
    description: req.body?.description || '',
    script: requireScript(req),
    envVars: Array.isArray(req.body?.envVars) ? req.body.envVars : [],
    scriptType: req.body?.scriptType || 'http'
  })
  res.json({ success: true, ...result })
}))

module.exports = router
