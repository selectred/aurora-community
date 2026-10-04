const express = require('express');
const router = express.Router();
const agentTestsController = require('../controllers/agentTestsController');
const { authMiddleware } = require('../middleware/auth');
const { checkSyntheticLimit, checkTestPackLimit, checkProFeature } = require('../middleware/license');

// All routes require authentication
router.use(authMiddleware);

// Spec management
router.get('/specs', agentTestsController.getSpecs);
router.get('/specs/:specId', agentTestsController.getSpecById);
router.post('/specs', agentTestsController.createSpec);
router.put('/specs/:specId', agentTestsController.updateSpec);
router.delete('/specs/:specId', agentTestsController.deleteSpec);

// Code generation
router.post('/specs/:specId/generate', agentTestsController.generateCode);

// Running tests
router.post('/specs/:specId/run', agentTestsController.runSpec);
router.post('/run-all', agentTestsController.runAllSpecs);

// Utilities
router.post('/parse', agentTestsController.parseSpec);
router.get('/templates', agentTestsController.getTemplates);

// MCP intent graph — parse spec code into structured step-by-step intent
router.post('/specs/:specId/extract-intent', agentTestsController.extractIntent)
router.post('/extract-intent-batch', agentTestsController.extractIntentBatch)

// API Discovery
router.post('/discover', agentTestsController.discoverAPIs);
router.post('/discover/quick', agentTestsController.quickDiscoverAPIs);

// Healing & Refactoring
router.post('/specs/:specId/heal', agentTestsController.healSpec)
router.post('/specs/:specId/heal-stream', agentTestsController.healSpecStream)
router.patch('/specs/:specId/code', agentTestsController.updateSpecCode)
router.post('/specs/:specId/heal-step', agentTestsController.healStep)
router.post('/specs/:specId/refactor-stream', agentTestsController.refactorSpecStream)

// Synthetic Monitoring (license check on promote)
router.get('/synthetics', agentTestsController.getSynthetics);
router.post('/specs/:specId/promote', checkSyntheticLimit, agentTestsController.promoteToSynthetic);
router.post('/specs/:specId/demote', agentTestsController.demoteFromSynthetic);
router.put('/specs/:specId/synthetic-settings', agentTestsController.updateSyntheticSettings);

// Review queue (imported specs pending validation)
router.get('/review-queue', agentTestsController.getReviewQueue)

// Test Packs
router.get('/packs', agentTestsController.getPacks);
router.post('/packs', checkTestPackLimit, agentTestsController.createPack);
router.get('/packs/:packId', agentTestsController.getPackById);
router.put('/packs/:packId', agentTestsController.updatePack);
router.delete('/packs/:packId', agentTestsController.deletePack);
router.post('/packs/:packId/tests', agentTestsController.addTestsToPack);
router.delete('/packs/:packId/tests', agentTestsController.removeTestsFromPack);
router.post('/packs/:packId/run', agentTestsController.runPack);
router.post('/packs/:packId/validate-all', agentTestsController.validatePack);
router.post('/specs/:specId/auto-validate', agentTestsController.autoValidateSpec);
router.post('/packs/:packId/generate-seed', checkProFeature, agentTestsController.generateSeedCode);
router.post('/packs/:packId/generate', agentTestsController.generatePackCode);
router.put('/packs/:packId/order', agentTestsController.reorderPackTests);
router.patch('/packs/:packId/tests/:specId/excluded', agentTestsController.setTestExcluded);

// Pack variables (encrypted credentials/secrets)
router.get('/packs/:packId/placeholders', agentTestsController.getPackPlaceholders);
router.get('/packs/:packId/scan-variables', agentTestsController.scanPackVariables);
router.get('/packs/:packId/variables', agentTestsController.getPackVariables);
router.post('/packs/:packId/variables', agentTestsController.createPackVariable);
router.put('/packs/:packId/variables/:varId', agentTestsController.updatePackVariable);
router.delete('/packs/:packId/variables/:varId', agentTestsController.deletePackVariable);
router.post('/packs/:packId/variables/:varId/replace', agentTestsController.replaceVariableInSpecs);

// Pack storage
router.post('/adopt-directory', agentTestsController.adoptDirectory);
router.get('/storage-health', agentTestsController.storageHealth);

// Push all ready specs in a pack to Continuum (Pro+ feature)
router.post('/packs/:packId/push-continuum', checkProFeature, async (req, res) => {
  const { syncPackToContinuum } = require('../services/continuumService')
  try {
    const results = await syncPackToContinuum(req.params.packId)
    res.json(results)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Proxy HTTP request — lets the frontend test API endpoints without CORS issues
router.post('/proxy-request', async (req, res) => {
  const { method = 'GET', url, headers: reqHeaders = {}, body, expectedStatus } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })
  const start = Date.now()
  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args))
    const opts = {
      method,
      headers: reqHeaders,
      redirect: 'follow',
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {})
    }
    const response = await fetch(url, opts)
    const text = await response.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = text }
    res.json({ status: response.status, statusText: response.statusText, body: parsed, duration: Date.now() - start })
  } catch (e) {
    res.status(502).json({ error: e.message, status: 0 })
  }
})

module.exports = router;
