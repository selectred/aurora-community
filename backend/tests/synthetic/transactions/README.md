# Synthetic Test Transactions

This directory contains Playwright-based synthetic monitoring tests that run every 30 minutes to monitor application health and performance.

## Structure

Each test file should export a `runTransaction` function that returns a result object with the following structure:

```javascript
{
  transactionId: string,        // Unique identifier
  transactionName: string,      // Human-readable name
  url: string,                  // Primary URL being tested
  description: string,          // Test description
  status: 'passed' | 'failed',  // Test status
  duration: number,             // Total execution time in ms
  pageMetrics: Array<{
    pageName: string,
    url: string,
    httpStatusCode: number,
    fcp: number,                // First Contentful Paint (ms)
    tti: number,                // Time to Interactive (ms)
    loadTime: number,           // Page load time (ms)
    domContentLoaded: number    // DOM content loaded (ms)
  }>,
  errorMessage: string,         // Error message if failed
  stackTrace: string,           // Stack trace if failed
  screenshot: string,           // Screenshot path if failed
  browser: string,
  viewport: object,
  scheduledRun: boolean,
  executedAt: Date
}
```

## Example Tests Provided

1. **01_login.js** - Tests user login flow
2. **02_dashboard_load.js** - Tests dashboard load performance
3. **03_settings_navigation.js** - Tests settings navigation

## Adding New Tests

To add a new synthetic test:

1. Create a new file following the naming convention: `##_test_name.js`
2. Import the BaseTest helper
3. Implement the `runTransaction` function
4. Register the transaction in the database via the API

## Using BaseTest Helper

The BaseTest class provides these methods:

- `setup()` - Initialize browser and page
- `navigateAndCapture(url, pageName)` - Navigate and capture performance metrics
- `capturePerformanceMetrics()` - Get FCP, TTI, and other metrics
- `captureScreenshot(filename)` - Take screenshot on failure
- `fill(selector, value)` - Fill form field
- `click(selector)` - Click element
- `waitForSelector(selector)` - Wait for element
- `waitForNavigation()` - Wait for page navigation
- `getTitle()` - Get page title
- `teardown()` - Clean up resources

## Configuration

Edit `../config.js` to customize:
- Base URL
- Browser settings
- Timeouts
- Screenshot settings
- Performance thresholds

## Manual Test Execution

To run a single transaction manually:

```javascript
const { runTransaction } = require('./transactions/01_login')
runTransaction().then(console.log)
```
