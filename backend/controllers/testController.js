// ============================================
// controllers/testController.js
// Updated for Prisma + SQLite
// ============================================
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  transformTestResult,
  transformTeam
} = require('../lib/helpers')

exports.getTestResults = async (req, res) => {
  try {
    const { dateRange = 'week', team, status, testType } = req.query

    const where = {}

    // Date range filter
    const now = new Date()
    if (dateRange === 'week') {
      where.executedAt = { gte: new Date(now.setDate(now.getDate() - 7)) }
    } else if (dateRange === 'month') {
      where.executedAt = { gte: new Date(now.setMonth(now.getMonth() - 1)) }
    } else if (dateRange === 'quarter') {
      where.executedAt = { gte: new Date(now.setMonth(now.getMonth() - 3)) }
    }

    if (team && team !== 'all') where.teamId = team
    if (status && status !== 'all') where.status = status
    if (testType && testType !== 'all') where.testType = testType

    const results = await prisma.testResult.findMany({
      where,
      include: {
        team: true,
        executedBy: true
      },
      orderBy: { executedAt: 'desc' },
      take: 1000
    })

    res.json({ success: true, results: results.map(transformTestResult) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getFunctionalTests = async (req, res) => {
  try {
    const tests = await prisma.testResult.findMany({
      where: { testType: 'functional' },
      include: {
        team: true
      },
      orderBy: { executedAt: 'desc' },
      take: 500
    })

    res.json({ success: true, tests: tests.map(transformTestResult) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getAPITests = async (req, res) => {
  try {
    const tests = await prisma.aPITest.findMany({
      include: {
        team: true
      },
      orderBy: { executedAt: 'desc' },
      take: 500
    })

    // Transform API tests
    const transformedTests = tests.map(t => ({
      id: t.id,
      endpoint: t.endpoint,
      method: t.method,
      service: t.service,
      status: t.status,
      statusCode: t.statusCode,
      responseTime: t.responseTime,
      errorMessage: t.errorMessage,
      testScript: t.testScript,
      coverage: t.coverage,
      teamId: t.teamId,
      team: t.team ? transformTeam(t.team) : null,
      executedAt: t.executedAt
    }))

    res.json({ success: true, tests: transformedTests })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getTestMetrics = async (req, res) => {
  try {
    const { timeRange = 'week', hours, testType } = req.query

    const now = new Date()
    let startDate

    if (hours) {
      startDate = new Date(now.getTime() - parseInt(hours) * 60 * 60 * 1000)
    } else if (timeRange === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    } else if (timeRange === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (timeRange === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    }

    const where = { executedAt: { gte: startDate } }
    if (testType && testType !== 'all') where.testType = testType

    const [total, passed, failed, flaky, avgResult, uniqueCaseRows] = await Promise.all([
      prisma.testResult.count({ where }),
      prisma.testResult.count({ where: { ...where, status: 'passed' } }),
      prisma.testResult.count({ where: { ...where, status: 'failed' } }),
      prisma.testResult.count({ where: { ...where, status: 'flaky' } }),
      prisma.testResult.aggregate({ where, _avg: { duration: true } }),
      prisma.testResult.findMany({ where, select: { testCaseId: true }, distinct: ['testCaseId'] })
    ])

    res.json({
      success: true,
      metrics: {
        total,
        passed,
        failed,
        flaky,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0',
        avgDuration: avgResult._avg.duration || 0,
        uniqueCases: uniqueCaseRows.length
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getQualityTrends = async (req, res) => {
  try {
    const now = new Date()
    const startDate = new Date(now)
    startDate.setMonth(startDate.getMonth() - 4)
    startDate.setDate(1)
    startDate.setHours(0, 0, 0, 0)

    const results = await prisma.testResult.findMany({
      where: { executedAt: { gte: startDate } },
      select: { status: true, executedAt: true }
    })

    const monthMap = {}
    results.forEach(r => {
      const d = new Date(r.executedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-GB', { month: 'short' })
      if (!monthMap[key]) monthMap[key] = { month: label, passed: 0, failed: 0, skipped: 0 }
      if (r.status === 'passed') monthMap[key].passed++
      else if (r.status === 'failed') monthMap[key].failed++
      else monthMap[key].skipped++
    })

    const trends = Object.keys(monthMap).sort().map(k => monthMap[k])
    res.json({ success: true, trends })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getFailedTests = async (req, res) => {
  try {
    const { testType = 'all' } = req.query

    const where = { status: 'failed' }
    if (testType !== 'all') where.testType = testType

    const tests = await prisma.testResult.findMany({
      where,
      include: {
        team: true
      },
      orderBy: { executedAt: 'desc' },
      take: 100
    })

    res.json({ success: true, tests: tests.map(transformTestResult) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getFlakyTests = async (req, res) => {
  try {
    const { testType = 'all' } = req.query

    // For flaky tests, we need raw SQL or a different approach
    // SQLite doesn't support complex aggregations easily
    // For now, return tests marked as flaky
    const where = { status: 'flaky' }
    if (testType !== 'all') where.testType = testType

    const tests = await prisma.testResult.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: 20
    })

    const flakyTests = tests.map(t => ({
      _id: t.testCaseId,
      testName: t.testName,
      totalRuns: 1,
      flakeRate: 50 // Placeholder - would need historical analysis
    }))

    res.json({ success: true, tests: flakyTests })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.importTestResults = async (req, res) => {
  try {
    const { results, tool } = req.body

    // Transform results for Prisma
    const data = results.map(result => ({
      testCaseId: result.testCaseId,
      testName: result.testName,
      testType: result.testType,
      suite: result.suite,
      status: result.status,
      duration: result.duration,
      errorMessage: result.errorMessage,
      stackTrace: result.stackTrace,
      screenshot: result.screenshot,
      browser: result.browser,
      environment: result.environment || 'staging',
      scriptLocation: result.scriptLocation,
      retries: result.retries || 0,
      metadataJson: stringifyJson({ ...result.metadata, tool }),
      teamId: result.team,
      executedById: result.executedBy
    }))

    const inserted = await prisma.testResult.createMany({
      data
    })

    res.json({
      success: true,
      message: `Imported ${inserted.count} test results`,
      count: inserted.count
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

exports.getTestTimeline = async (req, res) => {
  try {
    const { date, dateRange = '7', hours, teamId, packId, testType } = req.query

    let startDate, endDate

    if (hours) {
      // Rolling hour-window mode — used by the dashboard hour selector
      endDate = new Date()
      startDate = new Date(endDate.getTime() - parseInt(hours) * 60 * 60 * 1000)
    } else {
      // Legacy day-range mode
      const days = parseInt(dateRange) || 7
      endDate = date ? new Date(date + 'T23:59:59') : new Date()
      startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - days)
      startDate.setHours(0, 0, 0, 0)
    }

    const where = { executedAt: { gte: startDate, lte: endDate } }

    if (packId) {
      // Filter by test pack: find all spec UUIDs belonging to this pack
      const packTests = await prisma.testPackTest.findMany({
        where: { testPackId: packId },
        include: { spec: { select: { id: true } } }
      })
      where.specId = { in: packTests.map(pt => pt.spec.id) }
    } else if (teamId) {
      where.teamId = teamId
    }
    if (testType && testType !== 'all') where.testType = testType

    const results = await prisma.testResult.findMany({
      where,
      orderBy: { executedAt: 'asc' }
    })

    // Group by day and hour
    const timelineData = {}

    results.forEach(result => {
      const dateKey = new Date(result.executedAt).toISOString().split('T')[0]
      const hours = String(new Date(result.executedAt).getHours()).padStart(2, '0')
      const timeKey = hours + ':00'

      if (!timelineData[dateKey]) {
        timelineData[dateKey] = {}
      }

      if (!timelineData[dateKey][timeKey]) {
        timelineData[dateKey][timeKey] = { passed: 0, failed: 0, skipped: 0, total: 0 }
      }

      if (result.status === 'passed') {
        timelineData[dateKey][timeKey].passed++
      } else if (result.status === 'failed') {
        timelineData[dateKey][timeKey].failed++
      } else if (result.status === 'skipped') {
        timelineData[dateKey][timeKey].skipped++
      }
      timelineData[dateKey][timeKey].total++
    })

    res.json({ success: true, data: timelineData, count: results.length })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}
