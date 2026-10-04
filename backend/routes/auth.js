// ============================================
// routes/auth.js - App status and settings routes
// ============================================
const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { authMiddleware } = require('../middleware/auth')

// App status (no auth needed)
router.get('/status', authController.getStatus)

// Initial setup (no auth needed)
router.post('/setup', authController.setup)

// Profile/settings management
router.get('/profile', authMiddleware, authController.getProfile)
router.put('/profile', authMiddleware, authController.updateProfile)

// Legacy endpoints for compatibility
router.post('/login', authController.login)
router.post('/logout', authController.logout)

module.exports = router