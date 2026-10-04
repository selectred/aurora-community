// routes/license.js — Community Edition
// Reports the built-in Community Edition licence. There are no keys to activate.
const express = require('express')
const router = express.Router()
const { authMiddleware } = require('../middleware/auth')
const { getLicenseInfo } = require('../middleware/license')

router.use(authMiddleware)

router.get('/', async (req, res) => {
  res.json(await getLicenseInfo())
})

const noKeys = (req, res) => res.status(400).json({
  error: 'The Community Edition has no licence keys: every feature is already available.'
})
router.post('/activate', noKeys)
router.post('/deactivate', noKeys)

router.get('/tiers', async (req, res) => {
  const info = await getLicenseInfo()
  res.json({ tiers: [{ id: 'community', name: 'Community Edition', price: 0, description: 'Every feature, no limits', limits: info.limits, features: ['Unlimited features, initiatives, test packs and monitors', 'Functional, API and performance tests', 'Push to Continuum'] }] })
})

module.exports = router
