// ============================================
// routes/teams.js - Team management routes
// ============================================
const express = require('express')
const router = express.Router()
const teamController = require('../controllers/teamController')
const { authMiddleware } = require('../middleware/auth')
const { checkFeatureLimit } = require('../middleware/license')

// Team CRUD
router.get('/', authMiddleware, teamController.getAllTeams)
router.get('/:id', authMiddleware, teamController.getTeamById)
router.post('/', authMiddleware, checkFeatureLimit, teamController.createTeam)
router.put('/:id', authMiddleware, teamController.updateTeam)
router.delete('/:id', authMiddleware, teamController.deleteTeam)

// Team stats
router.get('/:id/stats', authMiddleware, teamController.getTeamStats)

// Team members
router.get('/:id/members', authMiddleware, teamController.getTeamMembers)
router.post('/:id/members', authMiddleware, teamController.addTeamMember)
router.put('/:id/members/:memberId', authMiddleware, teamController.updateTeamMember)
router.delete('/:id/members/:memberId', authMiddleware, teamController.removeTeamMember)

module.exports = router