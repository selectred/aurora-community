// ============================================
// routes/testCaseImport.js
// CSV Test Cases Import Routes
// ============================================
const express = require('express')
const router = express.Router()
const controller = require('../controllers/testCaseImportController')
const { authMiddleware } = require('../middleware/auth')

// All routes require authentication
router.use(authMiddleware)

/**
 * POST /api/test-cases/preview
 * Parse CSV and return headers + preview for column mapping UI
 */
router.post('/preview', controller.preview)

/**
 * POST /api/test-cases/import
 * Import CSV test cases and optionally generate Playwright tests
 * Returns Server-Sent Events for progress streaming
 */
router.post('/import', controller.importCSV)

/**
 * POST /api/test-cases/extract
 * Extract test cases from freeform text using AI
 */
router.post('/extract', controller.extractTestCases)

/**
 * POST /api/test-cases/import-extracted
 * Import extracted/edited test cases into a pack
 */
router.post('/import-extracted', controller.importExtracted)

/**
 * GET /api/test-cases/status/:id
 * Get status of an import job (not implemented - use SSE)
 */
router.get('/status/:id', controller.getImportStatus)

module.exports = router
