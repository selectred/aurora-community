const express = require('express')
const router = express.Router()
const mcpController = require('../controllers/mcpController')
const { authMiddleware } = require('../middleware/auth')

router.use(authMiddleware)

// Start a browser validation session for a spec
router.post('/validate/:specId', mcpController.startValidation)

// Session management
router.get('/sessions/:sessionId', mcpController.getSession)
router.delete('/sessions/:sessionId', mcpController.deleteSession)

// Deliver user input during interactive step recovery (hint / skip / abort)
router.post('/sessions/:sessionId/input', mcpController.submitInput)

// Apply the validated spec back to the spec record
router.post('/sessions/:sessionId/apply', mcpController.applyValidatedSpec)

module.exports = router
