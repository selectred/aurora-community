'use strict'
const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const recording = require('../services/recordingService')

// POST /api/agent-tests/recording/start
// Launches a headed Playwright browser with the recording overlay injected.
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body
    const { sessionId } = await recording.startSession(url || '')
    res.json({ success: true, sessionId })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/agent-tests/recording/stream/:sessionId
// SSE stream — emits step events as they arrive from the injected overlay.
router.get('/stream/:sessionId', authMiddleware, (req, res) => {
  const { sessionId } = req.params
  const emitter = recording.getEmitter(sessionId)
  if (!emitter) return res.status(404).json({ success: false, message: 'Session not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const onStep = (step) => {
    res.write(`data: ${JSON.stringify({ type: 'step', step })}\n\n`)
  }
  const onStopped = ({ steps, code }) => {
    res.write(`data: ${JSON.stringify({ type: 'stopped', steps, code })}\n\n`)
    res.end()
  }

  emitter.on('step', onStep)
  emitter.on('stopped', onStopped)

  req.on('close', () => {
    emitter.off('step', onStep)
    emitter.off('stopped', onStopped)
  })
})

// POST /api/agent-tests/recording/event/:sessionId
// Called from the injected overlay script in the recording browser.
// No auth — called from inside the Playwright browser context.
router.post('/event/:sessionId', (req, res) => {
  const added = recording.addEvent(req.params.sessionId, req.body)
  res.json({ success: added })
})

// POST /api/agent-tests/recording/stop-from-browser/:sessionId
// Called by the "Stop" button inside the recording overlay.
// No auth — called from inside the Playwright browser context.
router.post('/stop-from-browser/:sessionId', async (req, res) => {
  const result = await recording.stopSession(req.params.sessionId)
  res.json({ success: !!result })
})

// POST /api/agent-tests/recording/stop/:sessionId
// Called from the Aurora UI to stop recording and get the captured steps + code.
router.post('/stop/:sessionId', authMiddleware, async (req, res) => {
  try {
    const result = await recording.stopSession(req.params.sessionId)
    if (!result) return res.status(404).json({ success: false, message: 'Session not found or already stopped' })
    res.json({ success: true, steps: result.steps, code: result.code, trafficCount: result.trafficCount || 0 })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// DELETE /api/agent-tests/recording/step/:sessionId/:index
// Remove a single step from the live step list.
router.delete('/step/:sessionId/:index', authMiddleware, (req, res) => {
  const ok = recording.removeStep(req.params.sessionId, parseInt(req.params.index, 10))
  res.json({ success: ok })
})

// GET /api/agent-tests/recording/steps/:sessionId
// Get current step list (for reconnecting after SSE drop).
router.get('/steps/:sessionId', authMiddleware, (req, res) => {
  const steps = recording.getSteps(req.params.sessionId)
  if (!steps) return res.status(404).json({ success: false, message: 'Session not found' })
  res.json({ success: true, steps })
})

// POST /api/agent-tests/recording/generate-code
// Stateless code generation from a provided steps array (no active session needed).
router.post('/generate-code', (req, res) => {
  const { steps } = req.body
  if (!Array.isArray(steps)) return res.status(400).json({ success: false, message: 'steps must be an array' })
  const code = recording.generateCode(steps)
  res.json({ success: true, code })
})

module.exports = router
