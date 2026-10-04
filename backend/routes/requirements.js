const express = require('express')
const router = express.Router()
const { authMiddleware } = require('../middleware/auth')
const { analyzeBatch } = require('../services/requirementsGateService')

router.use(authMiddleware)

// POST /api/requirements/analyze — stateless, no DB
router.post('/analyze', (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'items array is required' })
  }
  try {
    const results = analyzeBatch(items)
    res.json({ success: true, results })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
