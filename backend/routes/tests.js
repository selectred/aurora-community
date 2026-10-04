// ============================================
// routes/tests.js - Test results routes
// ============================================
const express = require('express')
const router = express.Router()
const testController = require('../controllers/testController')
const { authMiddleware } = require('../middleware/auth')

router.get('/results', authMiddleware, testController.getTestResults)
router.get('/timeline', authMiddleware, testController.getTestTimeline)
router.get('/functional', authMiddleware, testController.getFunctionalTests)
router.get('/api', authMiddleware, testController.getAPITests)
router.get('/metrics', authMiddleware, testController.getTestMetrics)
router.get('/quality-trends', authMiddleware, testController.getQualityTrends)
router.get('/failed', authMiddleware, testController.getFailedTests)
router.get('/flaky', authMiddleware, testController.getFlakyTests)
router.post('/import', authMiddleware, testController.importTestResults)

module.exports = router