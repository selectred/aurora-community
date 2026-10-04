// ============================================
// routes/synthetics.js
// API routes for synthetic monitoring
// ============================================

const express = require('express')
const router = express.Router()
const syntheticsController = require('../controllers/syntheticsController')
const { authMiddleware } = require('../middleware/auth')

// All routes require authentication
router.use(authMiddleware)

// Results endpoints
router.get('/results', syntheticsController.getResults)
router.get('/results/latest', syntheticsController.getLatestResults)
router.get('/results/:id', syntheticsController.getResultById)

// Trends and analytics
router.get('/trends', syntheticsController.getTrends)
router.get('/summary', syntheticsController.getSummary)

// Transaction management
router.get('/transactions', syntheticsController.getTransactions)
router.post('/transactions', syntheticsController.createTransaction)
router.put('/transactions/:id', syntheticsController.updateTransaction)
router.delete('/transactions/:id', syntheticsController.deleteTransaction)

// Manual execution
router.post('/run', syntheticsController.runAllTransactions)
router.post('/run/:transactionId', syntheticsController.runTransaction)

// Scheduler status
router.get('/scheduler/status', syntheticsController.getSchedulerStatus)

module.exports = router
