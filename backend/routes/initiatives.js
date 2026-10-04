// ============================================
// routes/initiatives.js - Strategic Initiatives routes
// ============================================
const express = require('express')
const router = express.Router()
const initiativesController = require('../controllers/initiativesController')
const { authMiddleware, adminMiddleware, managerMiddleware } = require('../middleware/auth')
const { checkInitiativeLimit } = require('../middleware/license')

// Get all initiatives (manager+ access)
router.get('/', authMiddleware, managerMiddleware, initiativesController.getAllInitiatives)

// Get initiatives summary for dashboard (manager+ access)
router.get('/summary', authMiddleware, managerMiddleware, initiativesController.getInitiativesSummary)

// Get Tier 1 RAG health summary across the initiative (manager+ access)
router.get('/:id/health', authMiddleware, managerMiddleware, initiativesController.getInitiativeHealth)

// Generate consolidated PDF report across the initiative (manager+ access)
router.get('/:id/report', authMiddleware, managerMiddleware, initiativesController.getInitiativeReport)

// Get single initiative by ID (manager+ access)
router.get('/:id', authMiddleware, managerMiddleware, initiativesController.getInitiativeById)

// Create new initiative (admin only)
router.post('/', authMiddleware, adminMiddleware, checkInitiativeLimit, initiativesController.createInitiative)

// Update initiative (admin only)
router.put('/:id', authMiddleware, adminMiddleware, initiativesController.updateInitiative)

// Update initiative progress (manager+ access)
router.patch('/:id/progress', authMiddleware, managerMiddleware, initiativesController.updateProgress)

// Delete initiative (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, initiativesController.deleteInitiative)

module.exports = router
