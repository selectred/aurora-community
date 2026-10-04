// ============================================
// tests/synthetic/transactions/01_login.js
// Example: Login flow synthetic test
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
    const loginMetrics = await test.navigateAndCapture(
      `${config.baseURL}/login`,
      'Login Page'
    )
    pageMetrics.push(loginMetrics)

    // Step 2: Fill in login form
    await test.fill('input[type="email"]', 'admin@testtracker.com')
    await test.fill('input[type="password"]', 'admin123')

    // Step 3: Click login button
    await test.click('button[type="submit"]')

    // Step 4: Wait for navigation to dashboard
    await test.waitForNavigation()

    // Step 5: Capture dashboard metrics
    const dashboardMetrics = await test.navigateAndCapture(
      `${config.baseURL}/dashboard`,
      'Dashboard Page'
    )
    pageMetrics.push(dashboardMetrics)

    // Verify we're on the dashboard
    const title = await test.getTitle()
    if (!title.includes('Test Results Tracker')) {
      throw new Error('Failed to reach dashboard after login')
    }

    const duration = Date.now() - startTime

    return {
      transactionId: 'login-flow',
      transactionName: 'User Login Flow',
      url: `${config.baseURL}/login`,
      description: 'Complete user login flow from login page to dashboard',
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
    const screenshot = await test.captureScreenshot(`login-flow-${Date.now()}.png`)

    return {
      transactionId: 'login-flow',
      transactionName: 'User Login Flow',
      url: `${config.baseURL}/login`,
      description: 'Complete user login flow from login page to dashboard',
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
