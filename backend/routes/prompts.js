const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { checkProFeature } = require('../middleware/license')
const promptService = require('../services/promptService')

// GET /api/prompts — readable by all tiers
router.get('/', authMiddleware, (req, res) => {
  res.json({ success: true, prompts: promptService.getAll(), defaults: promptService.DEFAULTS })
})

// Write operations require Pro or Unlimited
router.put('/', authMiddleware, checkProFeature, (req, res) => {
  try {
    promptService.save(req.body.prompts)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

router.post('/reset/:key', authMiddleware, checkProFeature, (req, res) => {
  const value = promptService.resetKey(req.params.key)
  res.json({ success: true, value })
})

router.post('/reset-all', authMiddleware, checkProFeature, (req, res) => {
  promptService.resetAll()
  res.json({ success: true, prompts: promptService.DEFAULTS })
})

module.exports = router
