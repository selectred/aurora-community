// controllers/authController.js
// Simplified for desktop app - no login required, just settings management
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  getTierDisplayName
} = require('../lib/helpers')
const { getLicense, getLicenseInfo } = require('../middleware/license')

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
 * Get app status - check if setup is complete
 */
exports.getStatus = async (req, res) => {
  try {
    const settings = await getSettings()
    const licenseInfo = await getLicenseInfo()

    res.json({
      success: true,
      setupCompleted: settings.setupCompleted,
      managerName: settings.managerName,
      license: {
        tier: licenseInfo.tier,
        tierName: licenseInfo.tierDisplayName,
        locked: licenseInfo.locked,
        validationWarning: licenseInfo.validationWarning,
        daysUntilLock: licenseInfo.daysUntilLock,
        remoteStatus: licenseInfo.remoteStatus,
        statusMessage: licenseInfo.statusMessage,
        expiresAt: licenseInfo.expiresAt
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Complete initial setup
 */
exports.setup = async (req, res) => {
  try {
    const { managerName, email, anthropicKey, openaiKey, localLlmEndpoint, activeAiProvider } = req.body

    const settings = await getSettings()

    const updateData = {
      managerName: managerName || 'Manager',
      email: email || '',
      setupCompleted: true
    }

    if (anthropicKey) updateData.anthropicKey = anthropicKey
    if (openaiKey) updateData.openaiKey = openaiKey
    if (localLlmEndpoint) updateData.localLlmEndpoint = localLlmEndpoint
    if (activeAiProvider) updateData.activeAiProvider = activeAiProvider

    const updated = await prisma.appSettings.update({
      where: { id: settings.id },
      data: updateData
    })

    res.json({
      success: true,
      message: 'Setup completed',
      settings: {
        managerName: updated.managerName,
        email: updated.email,
        setupCompleted: updated.setupCompleted
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Get current profile/settings
 */
exports.getProfile = async (req, res) => {
  try {
    const settings = await getSettings()
    const licenseInfo = await getLicenseInfo()

    const preferences = parseJson(settings.preferencesJson, {
      theme: 'system',
      notifications: { enabled: true, onTestFailure: true, onSyntheticAlert: true },
      defaultTimeout: 60000,
      autoHealTests: true
    })

    const syntheticDefaults = parseJson(settings.syntheticDefaultsJson, {
      schedule: '*/30 * * * *',
      alertThreshold: 3000,
      retryCount: 2
    })

    res.json({
      success: true,
      profile: {
        managerName: settings.managerName,
        email: settings.email,
        preferences,
        syntheticDefaults,
        continuumIntegration: {
          enabled: settings.continuumEnabled,
          url: settings.continuumUrl
          // Don't expose API key
        },
        setupCompleted: settings.setupCompleted
      },
      license: {
        tier: licenseInfo.tier,
        tierName: licenseInfo.tierDisplayName,
        limits: licenseInfo.limits,
        usage: licenseInfo.usage,
        expiresAt: licenseInfo.expiresAt,
        locked: licenseInfo.locked,
        validationWarning: licenseInfo.validationWarning,
        daysUntilLock: licenseInfo.daysUntilLock,
        remoteStatus: licenseInfo.remoteStatus,
        statusMessage: licenseInfo.statusMessage
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Update profile/settings
 */
exports.updateProfile = async (req, res) => {
  try {
    const { managerName, email, preferences, syntheticDefaults, continuumIntegration, apiKeys } = req.body

    const settings = await getSettings()
    const updateData = {}

    if (managerName !== undefined) updateData.managerName = managerName
    if (email !== undefined) updateData.email = email

    if (preferences) {
      const currentPrefs = parseJson(settings.preferencesJson, {})
      updateData.preferencesJson = stringifyJson({ ...currentPrefs, ...preferences })
    }

    if (syntheticDefaults) {
      const currentDefaults = parseJson(settings.syntheticDefaultsJson, {})
      updateData.syntheticDefaultsJson = stringifyJson({ ...currentDefaults, ...syntheticDefaults })
    }

    if (continuumIntegration) {
      if (continuumIntegration.enabled !== undefined) {
        updateData.continuumEnabled = continuumIntegration.enabled
      }
      if (continuumIntegration.url !== undefined) {
        updateData.continuumUrl = continuumIntegration.url
      }
      if (continuumIntegration.apiKey !== undefined) {
        updateData.continuumApiKey = continuumIntegration.apiKey
      }
    }

    if (apiKeys) {
      if (apiKeys.anthropic !== undefined) {
        updateData.anthropicKey = apiKeys.anthropic
      }
    }

    const updated = await prisma.appSettings.update({
      where: { id: settings.id },
      data: updateData
    })

    const updatedPreferences = parseJson(updated.preferencesJson, {})
    const updatedSyntheticDefaults = parseJson(updated.syntheticDefaultsJson, {})

    res.json({
      success: true,
      message: 'Settings updated',
      profile: {
        managerName: updated.managerName,
        email: updated.email,
        preferences: updatedPreferences,
        syntheticDefaults: updatedSyntheticDefaults,
        continuumIntegration: {
          enabled: updated.continuumEnabled,
          url: updated.continuumUrl
        },
        setupCompleted: updated.setupCompleted
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Legacy endpoints - kept for compatibility
exports.login = async (req, res) => {
  // In desktop mode, login just returns app status
  return exports.getStatus(req, res)
}

exports.logout = async (req, res) => {
  res.json({ success: true, message: 'Session ended' })
}

exports.changePassword = async (req, res) => {
  // Not applicable in desktop mode
  res.status(400).json({ success: false, message: 'Password not required in desktop mode' })
}
