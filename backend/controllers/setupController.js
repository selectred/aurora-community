// ============================================
// controllers/setupController.js
// Test-engine (Playwright browsers) setup — downloaded into the user's own data dir at
// first-run setup or on-demand from Settings, rather than baked into the installer.
// ============================================
const browserSetupService = require('../services/browserSetupService')

// GET /api/setup/browsers-status
exports.getBrowsersStatus = async (req, res) => {
  try {
    const status = browserSetupService.checkInstalled()
    res.json({ success: true, ...status })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/setup/download-browsers — SSE progress stream
exports.downloadBrowsers = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(type, data = {}) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const before = browserSetupService.checkInstalled()
    if (before.installed) {
      send('done', { message: 'Test engine already installed' })
      return res.end()
    }

    send('start', { missing: before.missing })

    await browserSetupService.downloadBrowsers((progress) => {
      send('progress', progress)
    })

    send('done', { message: 'Test engine installed' })
  } catch (error) {
    console.error('[Setup] Browser download failed:', error.message)
    send('error', { message: error.message || 'Download failed' })
  } finally {
    res.end()
  }
}
