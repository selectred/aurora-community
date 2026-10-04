// ============================================
// middleware/auth.js - Simplified auth for desktop app
// Updated for Prisma + SQLite
// ============================================
const prisma = require('../lib/prisma')
const { parseJson } = require('../lib/helpers')

// Helper to get or create singleton AppSettings
async function getSettings() {
  let settings = await prisma.appSettings.findFirst()
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: {}
    })
  }
  return settings
}

/**
 * For desktop app, authentication is simplified:
 * - No JWT tokens needed (local app, single manager)
 * - Just verify app is set up and attach settings to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    const settings = await getSettings()
    req.settings = settings
    req.isManager = true // Desktop app user is always the manager
    next()
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load app settings' })
  }
}

/**
 * Optional: Check if setup is completed
 * Use this on routes that require initial setup to be done
 */
const setupRequiredMiddleware = async (req, res, next) => {
  try {
    const settings = await getSettings()
    if (!settings.setupCompleted) {
      return res.status(403).json({
        success: false,
        message: 'Initial setup required',
        requiresSetup: true
      })
    }
    req.settings = settings
    next()
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to check setup status' })
  }
}

/**
 * Legacy middleware - kept for compatibility during transition
 * These are no-ops in desktop mode since there's only one manager
 */
const adminMiddleware = (req, res, next) => next()
const managerMiddleware = (req, res, next) => next()

module.exports = {
  authMiddleware,
  adminMiddleware,
  managerMiddleware,
  setupRequiredMiddleware
}
