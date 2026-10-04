// ============================================
// tests/synthetic/helpers/baseTest.js
// Base Playwright test helper for synthetic monitoring
// ============================================

const { chromium } = require('playwright')
const config = require('../config')
const fs = require('fs').promises
const path = require('path')

class BaseTest {
  constructor() {
    this.browser = null
    this.context = null
    this.page = null
    this.responseMap = new Map() // Track HTTP responses
  }

  /**
   * Initialize browser and page
   */
  async setup() {
    const launchOptions = {
      headless: config.browser.headless,
      args: config.browser.args
    }

    // Use system chromium if executablePath is configured
    if (config.browser.executablePath) {
      launchOptions.executablePath = config.browser.executablePath
    }

    this.browser = await chromium.launch(launchOptions)

    this.context = await this.browser.newContext({
      viewport: config.viewport,
      userAgent: 'SyntheticMonitor/1.0'
    })

    this.page = await this.context.newPage()

    // Set timeouts
    this.page.setDefaultTimeout(config.timeouts.action)
    this.page.setDefaultNavigationTimeout(config.timeouts.navigation)

    // Track HTTP responses
    this.page.on('response', (response) => {
      this.responseMap.set(response.url(), {
        status: response.status(),
        statusText: response.statusText(),
        url: response.url()
      })
    })
  }

  /**
   * Navigate to a page and capture metrics
   */
  async navigateAndCapture(url, pageName) {
    const startTime = Date.now()

    try {
      // Clear response map for this page
      this.responseMap.clear()

      // Navigate to the page
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: config.timeouts.navigation
      })

      const httpStatusCode = response.status()

      // Wait for page to be fully loaded
      await this.page.waitForLoadState('load')

      const loadTime = Date.now() - startTime

      // Capture performance metrics
      const perfMetrics = await this.capturePerformanceMetrics()

      return {
        pageName,
        url,
        httpStatusCode,
        loadTime,
        ...perfMetrics,
        timestamp: new Date()
      }
    } catch (error) {
      const loadTime = Date.now() - startTime
      return {
        pageName,
        url,
        httpStatusCode: 0,
        loadTime,
        error: error.message,
        timestamp: new Date()
      }
    }
  }

  /**
   * Capture FCP, TTI, and other performance metrics
   */
  async capturePerformanceMetrics() {
    try {
      const metrics = await this.page.evaluate(() => {
        const perfData = {}

        // Get Navigation Timing API data
        const perfEntries = performance.getEntriesByType('navigation')[0]
        if (perfEntries) {
          // Time from navigation start to DOMContentLoaded event completion
          perfData.domContentLoaded = Math.round(perfEntries.domContentLoadedEventEnd)

          // Full page load time from Navigation Timing API (load event completion)
          perfData.fullPageLoad = Math.round(perfEntries.loadEventEnd)
        }

        // Get Paint Timing API data
        const paintEntries = performance.getEntriesByType('paint')
        paintEntries.forEach(entry => {
          if (entry.name === 'first-contentful-paint') {
            perfData.fcp = Math.round(entry.startTime)
          }
        })

        // Estimate TTI using a simple heuristic
        // TTI is approximately when the page is interactive
        // We use domInteractive as a proxy
        if (perfEntries) {
          perfData.tti = Math.round(perfEntries.domInteractive)
        }

        return perfData
      })

      return metrics
    } catch (error) {
      console.error('Failed to capture performance metrics:', error.message)
      return {}
    }
  }

  /**
   * Get HTTP status code for a specific URL
   */
  getHttpStatus(url) {
    const response = this.responseMap.get(url)
    return response ? response.status : null
  }

  /**
   * Take screenshot on failure
   */
  async captureScreenshot(filename) {
    try {
      const screenshotPath = path.join(config.screenshots.path, filename)

      // Ensure directory exists
      await fs.mkdir(config.screenshots.path, { recursive: true })

      await this.page.screenshot({
        path: screenshotPath,
        fullPage: config.screenshots.fullPage
      })

      return screenshotPath
    } catch (error) {
      console.error('Failed to capture screenshot:', error.message)
      return null
    }
  }

  /**
   * Fill form field
   */
  async fill(selector, value) {
    await this.page.fill(selector, value)
  }

  /**
   * Click element
   */
  async click(selector) {
    await this.page.click(selector)
  }

  /**
   * Wait for selector
   */
  async waitForSelector(selector, options = {}) {
    await this.page.waitForSelector(selector, options)
  }

  /**
   * Wait for navigation
   */
  async waitForNavigation(options = {}) {
    await this.page.waitForLoadState('networkidle', options)
  }

  /**
   * Get page title
   */
  async getTitle() {
    return await this.page.title()
  }

  /**
   * Clean up browser resources
   */
  async teardown() {
    if (this.page) await this.page.close()
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
  }
}

module.exports = BaseTest
