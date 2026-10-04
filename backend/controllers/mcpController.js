const prisma = require('../lib/prisma')
const { parseJson } = require('../lib/helpers')
const { resolvePackCode } = require('../lib/packStorage')
const { parseSpec } = require('../services/specParserService')
const { runValidation } = require('../services/mcpAgentRunner')
const mcpStreaming = require('../services/mcpStreamingService')
const { decrypt } = require('../lib/encryption')

// Active validation sessions: id → { status, specId, startedAt, results }
const activeSessions = new Map()

// POST /api/mcp/validate/:specId
// Starts a browser validation session for a spec's intent graph.
// Returns the session ID immediately; progress streams over WebSocket /ws/mcp?sessionId=...
exports.startValidation = async (req, res) => {
  const { specId } = req.params
  const { headed = false } = req.body

  try {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec) return res.status(404).json({ success: false, message: 'Spec not found' })

    const code = await resolvePackCode(spec)
    if (!code) return res.status(400).json({ success: false, message: 'Spec has no generated code to validate' })

    // Use stored intent graph or parse on the fly
    let intentGraph = spec.intentJson ? parseJson(spec.intentJson, null) : null
    if (!intentGraph) {
      intentGraph = await parseSpec(code)
      await prisma.agentTestSpec.update({
        where: { specId },
        data: { intentJson: JSON.stringify(intentGraph) }
      })
    }

    // Load pack variables for this spec (resolve {{PLACEHOLDER}} substitutions)
    let variables = {}
    const packLink = await prisma.testPackTest.findFirst({
      where: { specId },
      include: { testPack: { include: { variables: true } } }
    })
    if (packLink?.testPack?.variables?.length) {
      const settings = await prisma.appSettings.findFirst()
      const encKey = settings?.encryptionKey
      for (const v of packLink.testPack.variables) {
        try {
          variables[v.name] = v.sensitive && encKey ? decrypt(v.value, encKey) : v.value
        } catch {
          variables[v.name] = v.value
        }
      }
    }

    const sessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    activeSessions.set(sessionId, { status: 'running', specId, startedAt: Date.now(), results: [] })

    // Emit helper — sends to WebSocket and updates in-memory state
    const emit = (type, data) => {
      mcpStreaming.send(sessionId, type, data)
      if (type === 'step-result') {
        const session = activeSessions.get(sessionId)
        if (session) session.results.push(data)
      }
      if (type === 'complete' || type === 'error') {
        const session = activeSessions.get(sessionId)
        if (session) {
          session.status = type === 'complete' ? 'done' : 'error'
          if (data.validatedSpec) session.validatedSpec = data.validatedSpec
          if (data.summary)       session.summary       = data.summary
          if (data.message)       session.error         = data.message
        }
      }
    }

    // Run in background — response returns immediately with session ID
    runValidation(specId, intentGraph, { headed, variables, sessionId }, emit).catch(err => {
      emit('error', { message: err.message })
    })

    res.json({ success: true, sessionId, totalSteps: intentGraph.steps?.length ?? 0 })
  } catch (err) {
    console.error('[MCP] startValidation error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
}

// GET /api/mcp/sessions/:sessionId
exports.getSession = (req, res) => {
  const session = activeSessions.get(req.params.sessionId)
  if (!session) return res.status(404).json({ success: false, message: 'Session not found' })
  res.json({ success: true, session })
}

// POST /api/mcp/sessions/:sessionId/input — deliver user input (hint / skip / abort)
// Primary input path: more reliable than bidirectional WS in the Tauri context
exports.submitInput = (req, res) => {
  const { sessionId } = req.params
  const { action, hint } = req.body || {}
  if (!action) return res.status(400).json({ success: false, message: 'Missing action' })
  mcpStreaming.triggerInput(sessionId, { action, hint })
  res.json({ success: true })
}

// DELETE /api/mcp/sessions/:sessionId — abort a running session
exports.deleteSession = async (req, res) => {
  const { sessionId } = req.params
  const session = activeSessions.get(sessionId)
  if (!session) return res.status(404).json({ success: false, message: 'Session not found' })

  // Destroy the underlying browser session if still open
  const browserSessions = require('../services/browserSessionService')
  await browserSessions.destroy(sessionId).catch(() => {})

  activeSessions.delete(sessionId)
  mcpStreaming.send(sessionId, 'aborted', {})
  res.json({ success: true })
}

// POST /api/mcp/sessions/:sessionId/apply
// Saves the validated spec code back to the spec record
exports.applyValidatedSpec = async (req, res) => {
  const session = activeSessions.get(req.params.sessionId)
  if (!session) return res.status(404).json({ success: false, message: 'Session not found' })
  if (session.status !== 'done') return res.status(400).json({ success: false, message: 'Validation not complete' })

  try {
    const { saveGeneratedCode } = require('../lib/packStorage')
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: session.specId } })
    if (!spec) return res.status(404).json({ success: false, message: 'Spec not found' })

    const settings = await prisma.appSettings.findFirst()

    // saveGeneratedCode returns { codeStorage, codeFilePath, generatedCode } — must be persisted
    const { codeStorage, codeFilePath, generatedCode } = await saveGeneratedCode(
      spec.specId,
      session.validatedSpec,
      settings
    )

    await prisma.agentTestSpec.update({
      where: { specId: session.specId },
      data: {
        generatedCode,
        codeStorage,
        codeFilePath,
        status:    'ready',
        healCount: 0
      }
    })

    res.json({ success: true, specId: session.specId })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
}
