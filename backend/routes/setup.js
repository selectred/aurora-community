const express = require('express')
const router = express.Router()
const setupController = require('../controllers/setupController')
const { authMiddleware } = require('../middleware/auth')

router.get('/browsers-status', authMiddleware, setupController.getBrowsersStatus)
router.get('/download-browsers', authMiddleware, setupController.downloadBrowsers)

module.exports = router
