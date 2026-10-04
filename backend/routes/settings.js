// ============================================
// routes/settings.js - App settings routes
// ============================================
const express = require('express')
const router = express.Router()
const settingsController = require('../controllers/settingsController')
const { authMiddleware } = require('../middleware/auth')

// App settings
router.get('/', authMiddleware, settingsController.getSettings)
router.put('/', authMiddleware, settingsController.updateSettings)
router.post('/test-continuum', authMiddleware, settingsController.testContinuumConnection)
router.post('/sync-continuum', authMiddleware, settingsController.syncContinuumPipeline)

// API keys for external integrations
router.get('/api-keys', authMiddleware, settingsController.getAPIKeys)
router.post('/api-keys', authMiddleware, settingsController.generateAPIKey)
router.delete('/api-keys/:id', authMiddleware, settingsController.revokeAPIKey)

// AI providers management
router.get('/ai-providers', authMiddleware, settingsController.getAiProvidersStatus)
router.put('/ai-providers/active', authMiddleware, settingsController.setActiveAiProvider)
router.post('/ai-providers/test', authMiddleware, settingsController.testAiConnection)

// Individual AI provider keys
router.get('/anthropic', authMiddleware, settingsController.getAnthropicStatus)
router.put('/anthropic', authMiddleware, settingsController.updateAnthropicKey)
router.put('/openai', authMiddleware, settingsController.updateOpenAiKey)
router.put('/azure-openai', authMiddleware, settingsController.updateAzureOpenAi)
router.put('/local-llm', authMiddleware, settingsController.updateLocalLlm)

module.exports = router