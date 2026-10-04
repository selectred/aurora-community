// ============================================
// tests/synthetic/config.js
// Configuration for synthetic monitoring tests
// ============================================

const fs = require('fs')

// Locate a system Chrome/Chromium installation so Playwright can run without
// downloading its own browser bundle (important for packaged desktop builds).
function findSystemChrome() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }

  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    win32: [
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ],
  }

  const paths = candidates[process.platform] || []
  return paths.find(p => p && fs.existsSync(p)) || null
}

module.exports = {
  // Base URL for the application under test
  baseURL: process.env.SYNTHETIC_BASE_URL || 'http://frontend',

  // Browser settings
  browser: {
    type: 'chromium',
    headless: true,
    // Prefer a system Chrome install; falls back to Playwright's own download
    executablePath: findSystemChrome(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  },

  // Viewport settings
  viewport: {
    width: 1920,
    height: 1080
  },

  // Timeout settings
  timeouts: {
    navigation: 30000, // 30 seconds
    action: 10000,     // 10 seconds
    test: 60000        // 60 seconds per test
  },

  // Screenshot settings
  screenshots: {
    onFailure: true,
    path: '/tmp/synthetic-screenshots',
    fullPage: true
  },

  // Retry settings
  retries: {
    enabled: false,
    count: 0
  },

  // Performance thresholds
  thresholds: {
    fcp: 2000,  // First Contentful Paint should be < 2s
    tti: 5000,  // Time to Interactive should be < 5s
    loadTime: 3000 // Page load should be < 3s
  }
}
