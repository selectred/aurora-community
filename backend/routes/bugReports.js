// ============================================
// routes/bugReports.js - Bug report routes
// ============================================
const express = require('express')
const router = express.Router()
const bugReportsController = require('../controllers/bugReportsController')
const { authMiddleware } = require('../middleware/auth')

// /summary MUST precede /:id or Express matches "summary" as an id param
router.get('/summary', authMiddleware, bugReportsController.getBugReportsSummary)
router.get('/', authMiddleware, bugReportsController.getAllBugReports)
router.delete('/', authMiddleware, bugReportsController.deleteAllBugReports)
router.get('/:id', authMiddleware, bugReportsController.getBugReportById)
router.put('/:id', authMiddleware, bugReportsController.updateBugReport)
router.delete('/:id', authMiddleware, bugReportsController.deleteBugReport)
router.post('/:id/notes', authMiddleware, bugReportsController.addNote)
router.delete('/:id/notes/:noteId', authMiddleware, bugReportsController.deleteNote)

module.exports = router
