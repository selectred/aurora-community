// controllers/settingsController.js
// Updated for desktop app using Prisma with SQLite
const prisma = require('../lib/prisma')
const crypto = require('crypto')
const axios = require('axios')
const { parseJson, stringifyJson } = require('../lib/helpers')

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

exports.getSettings = async (req, res) => {
  try {
    const settings = await getSettings()

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
      settings: {
        managerName: settings.managerName,
        email: settings.email,
        preferences,
        syntheticDefaults,
        continuumIntegration: {
          enabled: settings.continuumEnabled,
          url: settings.continuumUrl,
          apiKey: settings.continuumApiKey
        },
        packStorage: {
          packsRootDir: settings.packsRootDir || null,
          packFileSizeThreshold: settings.packFileSizeThreshold ?? 8192,
          maxPackCount: settings.maxPackCount ?? null
        },
        evidenceSettings: {
          evidenceRootDir: settings.evidenceRootDir || null,
          evidenceRetentionDays: settings.evidenceRetentionDays ?? 30,
          evidenceCaptureEnabled: settings.evidenceCaptureEnabled ?? true,
          ragRedThresholdPct: settings.ragRedThresholdPct ?? 50
        },
        setupCompleted: settings.setupCompleted
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body
    const settings = await getSettings()

    const updateData = {}

    if (updates.managerName !== undefined) updateData.managerName = updates.managerName
    if (updates.email !== undefined) updateData.email = updates.email

    if (updates.preferences) {
      const currentPrefs = parseJson(settings.preferencesJson, {})
      updateData.preferencesJson = stringifyJson({ ...currentPrefs, ...updates.preferences })
    }

    if (updates.syntheticDefaults) {
      const currentDefaults = parseJson(settings.syntheticDefaultsJson, {})
      updateData.syntheticDefaultsJson = stringifyJson({ ...currentDefaults, ...updates.syntheticDefaults })
    }

    if (updates.continuumIntegration) {
      if (updates.continuumIntegration.enabled !== undefined) {
        updateData.continuumEnabled = updates.continuumIntegration.enabled
      }
      if (updates.continuumIntegration.url !== undefined) {
        updateData.continuumUrl = updates.continuumIntegration.url
      }
      if (updates.continuumIntegration.apiKey !== undefined) {
        updateData.continuumApiKey = updates.continuumIntegration.apiKey
      }
    }

    if (updates.packStorage) {
      if (updates.packStorage.packsRootDir !== undefined) {
        updateData.packsRootDir = updates.packStorage.packsRootDir
      }
      if (updates.packStorage.packFileSizeThreshold !== undefined) {
        updateData.packFileSizeThreshold = Number(updates.packStorage.packFileSizeThreshold)
      }
      if (updates.packStorage.maxPackCount !== undefined) {
        updateData.maxPackCount = updates.packStorage.maxPackCount === null
          ? null
          : Number(updates.packStorage.maxPackCount)
      }
    }

    if (updates.evidenceSettings) {
      if (updates.evidenceSettings.evidenceRootDir !== undefined) {
        updateData.evidenceRootDir = updates.evidenceSettings.evidenceRootDir
      }
      if (updates.evidenceSettings.evidenceRetentionDays !== undefined) {
        updateData.evidenceRetentionDays = Number(updates.evidenceSettings.evidenceRetentionDays)
      }
      if (updates.evidenceSettings.evidenceCaptureEnabled !== undefined) {
        updateData.evidenceCaptureEnabled = !!updates.evidenceSettings.evidenceCaptureEnabled
      }
      if (updates.evidenceSettings.ragRedThresholdPct !== undefined) {
        updateData.ragRedThresholdPct = Number(updates.evidenceSettings.ragRedThresholdPct)
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
      message: 'Settings updated successfully',
      settings: {
        managerName: updated.managerName,
        email: updated.email,
        preferences: updatedPreferences,
        syntheticDefaults: updatedSyntheticDefaults,
        continuumIntegration: {
          enabled: updated.continuumEnabled,
          url: updated.continuumUrl
        },
        packStorage: {
          packsRootDir: updated.packsRootDir || null,
          packFileSizeThreshold: updated.packFileSizeThreshold ?? 8192,
          maxPackCount: updated.maxPackCount ?? null
        },
        evidenceSettings: {
          evidenceRootDir: updated.evidenceRootDir || null,
          evidenceRetentionDays: updated.evidenceRetentionDays ?? 30,
          evidenceCaptureEnabled: updated.evidenceCaptureEnabled ?? true,
          ragRedThresholdPct: updated.ragRedThresholdPct ?? 50
        }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getAPIKeys = async (req, res) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      where: { isActive: true }
    })

    // Transform and exclude hashedKey
    const transformedKeys = keys.map(k => ({
      id: k.id,
      key: k.key,
      name: k.name,
      description: k.description,
      permissions: parseJson(k.permissionsJson, []),
      isActive: k.isActive,
      lastUsed: k.lastUsed,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt
    }))

    res.json({ success: true, keys: transformedKeys })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.generateAPIKey = async (req, res) => {
  try {
    const { name, description, permissions } = req.body

    const key = crypto.randomBytes(32).toString('hex')
    const hashedKey = crypto.createHash('sha256').update(key).digest('hex')

    const apiKey = await prisma.aPIKey.create({
      data: {
        key: key.substring(0, 8) + '...' + key.substring(key.length - 4),
        name,
        description,
        hashedKey,
        permissionsJson: stringifyJson(permissions || ['read'])
      }
    })

    res.status(201).json({
      success: true,
      key,
      message: 'API key generated. Save this key securely, it will not be shown again.'
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.revokeAPIKey = async (req, res) => {
  try {
    await prisma.aPIKey.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })
    res.json({ success: true, message: 'API key revoked successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get all AI provider status
exports.getAiProvidersStatus = async (req, res) => {
  try {
    const settings = await getSettings()

    const maskKey = (key) => key ? key.substring(0, 10) + '...' : null

    res.json({
      success: true,
      activeProvider: settings.activeAiProvider || 'none',
      providers: {
        anthropic: {
          configured: !!settings.anthropicKey,
          maskedKey: maskKey(settings.anthropicKey)
        },
        openai: {
          configured: !!settings.openaiKey,
          maskedKey: maskKey(settings.openaiKey)
        },
        azureOpenai: {
          configured: !!(settings.azureOpenaiKey && settings.azureOpenaiEndpoint),
          maskedKey: maskKey(settings.azureOpenaiKey),
          endpoint: settings.azureOpenaiEndpoint || null,
          deploymentName: settings.azureOpenaiDeployment || null
        },
        local: {
          configured: !!settings.localLlmEndpoint,
          endpoint: settings.localLlmEndpoint || null,
          model: settings.localLlmModel || null,
          hasApiKey: !!settings.localLlmApiKey
        }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get Anthropic API key status (not the actual key)
exports.getAnthropicStatus = async (req, res) => {
  try {
    const settings = await getSettings()
    res.json({
      success: true,
      configured: !!settings.anthropicKey,
      maskedKey: settings.anthropicKey
        ? settings.anthropicKey.substring(0, 10) + '...'
        : null
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Anthropic API key
exports.updateAnthropicKey = async (req, res) => {
  try {
    const { apiKey } = req.body

    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Anthropic API key format'
      })
    }

    const settings = await getSettings()
    await prisma.appSettings.update({
      where: { id: settings.id },
      data: { anthropicKey: apiKey }
    })

    res.json({
      success: true,
      message: 'Anthropic API key updated',
      maskedKey: apiKey.substring(0, 10) + '...'
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update OpenAI API key
exports.updateOpenAiKey = async (req, res) => {
  try {
    const { apiKey } = req.body

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OpenAI API key format'
      })
    }

    const settings = await getSettings()
    await prisma.appSettings.update({
      where: { id: settings.id },
      data: { openaiKey: apiKey }
    })

    res.json({
      success: true,
      message: 'OpenAI API key updated',
      maskedKey: apiKey.substring(0, 10) + '...'
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Azure OpenAI settings
exports.updateAzureOpenAi = async (req, res) => {
  try {
    const { apiKey, endpoint, deploymentName } = req.body

    if (!apiKey || !endpoint) {
      return res.status(400).json({
        success: false,
        message: 'API key and endpoint are required for Azure OpenAI'
      })
    }

    const settings = await getSettings()
    await prisma.appSettings.update({
      where: { id: settings.id },
      data: {
        azureOpenaiKey: apiKey,
        azureOpenaiEndpoint: endpoint,
        azureOpenaiDeployment: deploymentName || ''
      }
    })

    res.json({
      success: true,
      message: 'Azure OpenAI settings updated',
      maskedKey: apiKey.substring(0, 10) + '...'
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update Local / OpenAI-compatible LLM settings
exports.updateLocalLlm = async (req, res) => {
  try {
    const { endpoint, model, apiKey } = req.body

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Endpoint URL is required'
      })
    }

    const settings = await getSettings()
    await prisma.appSettings.update({
      where: { id: settings.id },
      data: {
        localLlmEndpoint: endpoint,
        localLlmModel: model || '',
        localLlmApiKey: apiKey || ''
      }
    })

    res.json({ success: true, message: 'Local LLM settings updated', endpoint })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Test AI provider connection with a real (minimal) API call
exports.testAiConnection = async (req, res) => {
  try {
    const settings = await getSettings()
    const provider = req.body.provider || settings.activeAiProvider

    if (!provider || provider === 'none') {
      return res.status(400).json({ success: false, message: 'No AI provider configured' })
    }

    const start = Date.now()

    if (provider === 'anthropic') {
      if (!settings.anthropicKey) {
        return res.status(400).json({ success: false, message: 'Anthropic API key not set' })
      }
      const Anthropic = require('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: settings.anthropicKey })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
    } else if (provider === 'openai') {
      if (!settings.openaiKey) {
        return res.status(400).json({ success: false, message: 'OpenAI API key not set' })
      }
      const OpenAI = require('openai')
      const client = new OpenAI({ apiKey: settings.openaiKey })
      await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
    } else if (provider === 'azure-openai') {
      if (!settings.azureOpenaiKey || !settings.azureOpenaiEndpoint) {
        return res.status(400).json({ success: false, message: 'Azure OpenAI not fully configured' })
      }
      const OpenAI = require('openai')
      const deployment = settings.azureOpenaiDeployment || 'gpt-4'
      const client = new OpenAI({
        apiKey: settings.azureOpenaiKey,
        baseURL: `${settings.azureOpenaiEndpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
        defaultQuery: { 'api-version': '2024-02-01' },
        defaultHeaders: { 'api-key': settings.azureOpenaiKey }
      })
      await client.chat.completions.create({
        model: deployment,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
    } else if (provider === 'local') {
      if (!settings.localLlmEndpoint) {
        return res.status(400).json({ success: false, message: 'Local LLM endpoint not configured' })
      }
      const OpenAI = require('openai')
      const client = new OpenAI({
        apiKey: settings.localLlmApiKey || 'local',
        baseURL: `${settings.localLlmEndpoint.replace(/\/$/, '')}/v1`
      })
      await client.chat.completions.create({
        model: settings.localLlmModel || 'llama3.2',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      })
    }

    res.json({ success: true, latencyMs: Date.now() - start, provider })
  } catch (error) {
    const httpStatus = error.status || error.statusCode
    const message = httpStatus === 401
      ? 'Invalid API key — check your key and try again'
      : httpStatus === 429
        ? 'Rate limited — key is valid but over quota'
        : error.message || 'Connection failed'
    res.json({ success: false, message })
  }
}

// Test Continuum connection
exports.testContinuumConnection = async (req, res) => {
  const { url, apiKey } = req.body
  if (!url) return res.status(400).json({ success: false, message: 'URL is required' })

  try {
    const baseUrl = url.replace(/\/$/, '')
    // Test against the real imports/meta endpoint — validates both connectivity and API key
    await axios.get(`${baseUrl}/api/imports/meta`, {
      headers: apiKey ? { 'X-API-Key': apiKey } : {},
      timeout: 8000
    })
    res.json({ success: true, message: 'Connected to Continuum successfully' })
  } catch (error) {
    const status = error.response?.status
    if (status === 401 || status === 403) {
      res.status(400).json({ success: false, message: 'Invalid API key — check the key in Continuum Settings → API Keys' })
    } else if (status && status < 500) {
      res.json({ success: true, message: 'Continuum reachable' })
    } else {
      res.status(400).json({ success: false, message: `Could not reach Continuum: ${error.message}` })
    }
  }
}

exports.syncContinuumPipeline = async (req, res) => {
  try {
    const { syncPipeline } = require('../services/continuumService')
    const result = await syncPipeline()
    if (result.skipped) {
      return res.status(400).json({ success: false, message: 'Continuum integration is not configured or disabled' })
    }
    res.json({ success: true, message: `Synced ${result.total} initiative(s) — ${result.created} created in Continuum`, ...result })
  } catch (error) {
    const status = error.response?.status
    if (status === 401 || status === 403) {
      res.status(400).json({ success: false, message: 'Invalid API key — check Settings → Continuum' })
    } else {
      res.status(500).json({ success: false, message: `Sync failed: ${error.message}` })
    }
  }
}

// Set active AI provider
exports.setActiveAiProvider = async (req, res) => {
  try {
    const { provider } = req.body

    if (!['anthropic', 'openai', 'azure-openai', 'none'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid AI provider'
      })
    }

    const settings = await getSettings()

    // Verify the provider has valid credentials
    if (provider === 'anthropic' && !settings.anthropicKey) {
      return res.status(400).json({
        success: false,
        message: 'Anthropic API key not configured'
      })
    }
    if (provider === 'openai' && !settings.openaiKey) {
      return res.status(400).json({
        success: false,
        message: 'OpenAI API key not configured'
      })
    }
    if (provider === 'azure-openai' && (!settings.azureOpenaiKey || !settings.azureOpenaiEndpoint)) {
      return res.status(400).json({
        success: false,
        message: 'Azure OpenAI not fully configured'
      })
    }

    await prisma.appSettings.update({
      where: { id: settings.id },
      data: { activeAiProvider: provider }
    })

    res.json({
      success: true,
      message: `Active AI provider set to ${provider}`,
      activeProvider: provider
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
