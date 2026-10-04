// ============================================
// tests/synthetic/transactions/03_settings_navigation.js
// Example: Settings navigation test
// ============================================

const BaseTest = require('../helpers/baseTest')
const config = require('../config')

async function runTransaction() {
  const test = new BaseTest()
  const pageMetrics = []
  const startTime = Date.now()

  try {
    await test.setup()

    // Login
    await test.navigateAndCapture(`${config.baseURL}/login`, 'Login Page')
    await test.fill('input[type="email"]', 'admin@testtracker.com')
    await test.fill('input[type="password"]', 'admin123')
    await test.click('button[type="submit"]')
    await test.waitForNavigation()

    // Navigate to settings
    await test.click('a[href="/settings"]')
    await test.waitForNavigation()

    const settingsMetrics = await test.navigateAndCapture(
      `${config.baseURL}/settings`,
      'Settings Page'
    )
    pageMetrics.push(settingsMetrics)

    // Navigate to user settings
    const userSettingsMetrics = await test.navigateAndCapture(
      `${config.baseURL}/settings/user`,
      'User Settings'
    )
    pageMetrics.push(userSettingsMetrics)

    const duration = Date.now() - startTime

    return {
      transactionId: 'settings-navigation',
      transactionName: 'Settings Navigation',
      url: `${config.baseURL}/settings`,
      description: 'Navigate through settings pages',
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
    const screenshot = await test.captureScreenshot(`settings-nav-${Date.now()}.png`)

    return {
      transactionId: 'settings-navigation',
      transactionName: 'Settings Navigation',
      url: `${config.baseURL}/settings`,
      description: 'Navigate through settings pages',
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
