// ============================================
// controllers/syntheticsController.js
// Controller for synthetic monitoring endpoints
// Updated for Prisma + SQLite
// ============================================
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  transformSyntheticResult,
  transformSyntheticTransaction
} = require('../lib/helpers')
const syntheticMonitoringService = require('../services/syntheticMonitoring')

/**
 * Get synthetic test results with filtering
 */
exports.getResults = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      transactionId,
      status,
      limit = 100,
      skip = 0
    } = req.query

    // Build query
    const where = {}

    if (startDate || endDate) {
      where.executedAt = {}
      if (startDate) where.executedAt.gte = new Date(startDate)
      if (endDate) where.executedAt.lte = new Date(endDate)
    }

    if (transactionId) {
      where.transactionId = transactionId
    }

    if (status) {
      where.status = status
    }

    const results = await prisma.syntheticResult.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(skip)
    })

    const total = await prisma.syntheticResult.count({ where })

    res.json({
      results: results.map(transformSyntheticResult),
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > (parseInt(skip) + results.length)
      }
    })
  } catch (error) {
    console.error('Failed to fetch synthetic results:', error)
    res.status(500).json({ message: 'Failed to fetch synthetic results', error: error.message })
  }
}

/**
 * Get single synthetic result by ID
 */
exports.getResultById = async (req, res) => {
  try {
    const result = await prisma.syntheticResult.findUnique({
      where: { id: req.params.id }
    })

    if (!result) {
      return res.status(404).json({ message: 'Result not found' })
    }

    res.json(transformSyntheticResult(result))
  } catch (error) {
    console.error('Failed to fetch synthetic result:', error)
    res.status(500).json({ message: 'Failed to fetch synthetic result', error: error.message })
  }
}

/**
 * Get latest result for each transaction
 */
exports.getLatestResults = async (req, res) => {
  try {
    // Get latest result per unique transactionId — covers both old script-based and
    // new agent-based synthetics (which write transactionId 'agent-<specId>' with no
    // corresponding SyntheticTransaction row)
    const latest = await prisma.syntheticResult.findMany({
      distinct: ['transactionId'],
      orderBy: { executedAt: 'desc' }
    })

    res.json(latest.map(transformSyntheticResult))
  } catch (error) {
    console.error('Failed to fetch latest results:', error)
    res.status(500).json({ message: 'Failed to fetch latest results', error: error.message })
  }
}

/**
 * Get pass/fail trends over time
 */
exports.getTrends = async (req, res) => {
  try {
    const { startDate, endDate, transactionId } = req.query

    // Default to last 7 days if no date range provided
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)

    const where = {
      executedAt: { gte: start, lte: end }
    }

    if (transactionId) {
      where.transactionId = transactionId
    }

    const results = await prisma.syntheticResult.findMany({
      where,
      orderBy: { executedAt: 'asc' }
    })

    // Group by hour and transaction
    const trendData = {}

    results.forEach(item => {
      const date = new Date(item.executedAt)
      const hourKey = `${date.toISOString().split('T')[0]} ${String(date.getHours()).padStart(2, '0')}:00`
      const key = `${item.transactionId}_${item.transactionName}`

      if (!trendData[key]) {
        trendData[key] = {
          transactionId: item.transactionId,
          transactionName: item.transactionName,
          dataPoints: []
        }
      }

      // Find or create data point for this hour
      let dataPoint = trendData[key].dataPoints.find(dp => dp.timestamp === hourKey)
      if (!dataPoint) {
        dataPoint = {
          timestamp: hourKey,
          passed: 0,
          failed: 0,
          count: 0,
          totalDuration: 0
        }
        trendData[key].dataPoints.push(dataPoint)
      }

      if (item.status === 'passed') {
        dataPoint.passed++
      } else {
        dataPoint.failed++
      }
      dataPoint.count++
      dataPoint.totalDuration += item.duration
    })

    // Calculate averages
    Object.values(trendData).forEach(trend => {
      trend.dataPoints.forEach(dp => {
        dp.avgDuration = Math.round(dp.totalDuration / dp.count)
        delete dp.totalDuration
      })
    })

    res.json(Object.values(trendData))
  } catch (error) {
    console.error('Failed to fetch trends:', error)
    res.status(500).json({ message: 'Failed to fetch trends', error: error.message })
  }
}

/**
 * Get summary statistics
 */
exports.getSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    // Default to last 24 hours
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 60 * 60 * 1000)

    const where = {
      executedAt: { gte: start, lte: end }
    }

    const totalRuns = await prisma.syntheticResult.count({ where })
    const passedRuns = await prisma.syntheticResult.count({ where: { ...where, status: 'passed' } })
    const failedRuns = await prisma.syntheticResult.count({ where: { ...where, status: 'failed' } })

    const durationStats = await prisma.syntheticResult.aggregate({
      where,
      _avg: { duration: true },
      _min: { duration: true },
      _max: { duration: true }
    })

    const passRate = totalRuns > 0
      ? ((passedRuns / totalRuns) * 100).toFixed(2)
      : 0

    res.json({
      totalRuns,
      passedRuns,
      failedRuns,
      passRate: parseFloat(passRate),
      avgDuration: Math.round(durationStats._avg.duration || 0),
      minDuration: Math.round(durationStats._min.duration || 0),
      maxDuration: Math.round(durationStats._max.duration || 0),
      period: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    })
  } catch (error) {
    console.error('Failed to fetch summary:', error)
    res.status(500).json({ message: 'Failed to fetch summary', error: error.message })
  }
}

/**
 * Get all transaction definitions
 */
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await prisma.syntheticTransaction.findMany({
      orderBy: { name: 'asc' }
    })
    res.json(transactions.map(transformSyntheticTransaction))
  } catch (error) {
    console.error('Failed to fetch transactions:', error)
    res.status(500).json({ message: 'Failed to fetch transactions', error: error.message })
  }
}

/**
 * Create a new transaction definition
 */
exports.createTransaction = async (req, res) => {
  try {
    const {
      transactionId,
      name,
      description,
      url,
      scriptPath,
      enabled,
      schedule,
      timeout,
      retryOnFailure,
      retryCount,
      tags,
      teamId
    } = req.body

    const transaction = await prisma.syntheticTransaction.create({
      data: {
        transactionId: transactionId || `txn-${Date.now()}`,
        name,
        description,
        url,
        scriptPath,
        enabled: enabled !== false,
        schedule: schedule || '*/30 * * * *',
        timeout: timeout || 60000,
        retryOnFailure: retryOnFailure || false,
        retryCount: retryCount || 0,
        tagsJson: stringifyJson(tags || []),
        teamId
      }
    })

    res.status(201).json(transformSyntheticTransaction(transaction))
  } catch (error) {
    console.error('Failed to create transaction:', error)
    res.status(500).json({ message: 'Failed to create transaction', error: error.message })
  }
}

/**
 * Update transaction definition
 */
exports.updateTransaction = async (req, res) => {
  try {
    const updateData = {}
    const { name, description, url, scriptPath, enabled, schedule, timeout, retryOnFailure, retryCount, tags } = req.body

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (url !== undefined) updateData.url = url
    if (scriptPath !== undefined) updateData.scriptPath = scriptPath
    if (enabled !== undefined) updateData.enabled = enabled
    if (schedule !== undefined) updateData.schedule = schedule
    if (timeout !== undefined) updateData.timeout = timeout
    if (retryOnFailure !== undefined) updateData.retryOnFailure = retryOnFailure
    if (retryCount !== undefined) updateData.retryCount = retryCount
    if (tags !== undefined) updateData.tagsJson = stringifyJson(tags)

    const transaction = await prisma.syntheticTransaction.update({
      where: { transactionId: req.params.id },
      data: updateData
    })

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    res.json(transformSyntheticTransaction(transaction))
  } catch (error) {
    console.error('Failed to update transaction:', error)
    res.status(500).json({ message: 'Failed to update transaction', error: error.message })
  }
}

/**
 * Delete transaction definition
 */
exports.deleteTransaction = async (req, res) => {
  try {
    await prisma.syntheticTransaction.delete({
      where: { transactionId: req.params.id }
    })

    res.json({ message: 'Transaction deleted successfully' })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Transaction not found' })
    }
    console.error('Failed to delete transaction:', error)
    res.status(500).json({ message: 'Failed to delete transaction', error: error.message })
  }
}

/**
 * Manually trigger a single transaction
 */
exports.runTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params

    // Run the transaction
    const result = await syntheticMonitoringService.runSingleTransaction(transactionId)

    res.json({
      message: 'Transaction executed successfully',
      result
    })
  } catch (error) {
    console.error('Failed to run transaction:', error)
    res.status(500).json({ message: 'Failed to run transaction', error: error.message })
  }
}

/**
 * Manually trigger all transactions
 */
exports.runAllTransactions = async (req, res) => {
  try {
    console.log('[Synthetics API] Manual run all triggered by user')

    // Run all transactions
    const results = await syntheticMonitoringService.runAllTransactions()

    res.json({
      message: `Executed ${results.length} transactions`,
      count: results.length,
      results: results.map(r => ({
        transactionId: r.transactionId,
        transactionName: r.transactionName,
        status: r.status,
        duration: r.duration
      }))
    })
  } catch (error) {
    console.error('Failed to run all transactions:', error)
    res.status(500).json({ message: 'Failed to run all transactions', error: error.message })
  }
}

/**
 * Get scheduler status
 */
exports.getSchedulerStatus = async (req, res) => {
  try {
    const status = syntheticMonitoringService.getSchedulerStatus()
    res.json(status)
  } catch (error) {
    console.error('Failed to fetch scheduler status:', error)
    res.status(500).json({ message: 'Failed to fetch scheduler status', error: error.message })
  }
}
