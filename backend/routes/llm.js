const express = require('express')
const router = express.Router()
const { authMiddleware } = require('../middleware/auth')
const ctrl = require('../controllers/llmLogsController')

router.get('/health',                    authMiddleware, ctrl.getHealth)
router.put('/logs/:id/outcome',          authMiddleware, ctrl.updateOutcome)

module.exports = router
