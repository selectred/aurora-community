// ============================================
// tests/synthetic/transactions/02_dashboard_load.js
// Example: Dashboard load performance test
// ============================================

const BaseTest = require('../helpers/baseTest')
const config = require('../config')

async function runTransaction() {
  const test = new BaseTest()
  const pageMetrics = []
  const startTime = Date.now()

  try {
    await test.setup()

    // Step 1: Navigate to login page
    await test.navigateAndCapture(`${config.baseURL}/login`, 'Login Page')

    // Step 2: Login
    await test.fill('input[type="email"]', 'admin@testtracker.com')
    await test.fill('input[type="password"]', 'admin123')
    await test.click('button[type="submit"]')
    await test.waitForNavigation()

    // Step 3: Capture dashboard load metrics
    const dashboardMetrics = await test.navigateAndCapture(
      `${config.baseURL}/dashboard`,
      'Dashboard - Main View'
    )
    pageMetrics.push(dashboardMetrics)

    // Verify dashboard loaded
    await test.waitForSelector('text=Test Results Tracker', { timeout: 5000 })

    const duration = Date.now() - startTime

    return {
      transactionId: 'dashboard-load',
      transactionName: 'Dashboard Load Performance',
      url: `${config.baseURL}/dashboard`,
      description: 'Measure dashboard initial load performance',
      status: 'passed',
      duration,
      pageMetrics,
      browser: 'chromium',
      viewport: config.viewport,
      scheduledRun: true,
      executedAt: new Date()
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const screenshot = await test.captureScreenshot(`dashboard-load-${Date.now()}.png`)

    return {
      transactionId: 'dashboard-load',
      transactionName: 'Dashboard Load Performance',
      url: `${config.baseURL}/dashboard`,
      description: 'Measure dashboard initial load performance',
      status: 'failed',
      duration,
      pageMetrics,
      errorMessage: error.message,
      stackTrace: error.stack,
      screenshot,
      browser: 'chromium',
      viewport: config.viewport,
      scheduledRun: true,
      executedAt: new Date()
    }
  } finally {
    await test.teardown()
  }
}

module.exports = { runTransaction }
