// ============================================
// services/syntheticMonitoring.js
// Synthetic monitoring orchestration service
// Updated for Prisma + SQLite
// ============================================

const cron = require('node-cron')
const fs = require('fs').promises
const path = require('path')
const prisma = require('../lib/prisma')
const { stringifyJson } = require('../lib/helpers')

class SyntheticMonitoringService {
  constructor() {
    this.scheduledTasks = []
    this.transactionsDir = path.join(__dirname, '../tests/synthetic/transactions')
  }

  /**
   * Initialize the scheduler
   * Default: runs every 30 minutes
   */
  initializeScheduler() {
    console.log('[Synthetic Monitoring] Initializing scheduler...')

    // Schedule to run every 30 minutes
    const task = cron.schedule('*/30 * * * *', async () => {
      console.log('[Synthetic Monitoring] Running scheduled synthetic tests...')
      await this.runAllTransactions()
    }, {
      scheduled: true,
      timezone: 'UTC'
    })

    this.scheduledTasks.push(task)
    console.log('[Synthetic Monitoring] Scheduler initialized - running every 30 minutes')

    // Run once on startup (after 10 seconds delay)
    setTimeout(async () => {
      console.log('[Synthetic Monitoring] Running initial synthetic tests...')
      await this.runAllTransactions()
    }, 10000)
  }

  /**
   * Get all available transaction scripts
   */
  async getAvailableTransactions() {
    try {
      const files = await fs.readdir(this.transactionsDir)
      const transactionFiles = files.filter(file =>
        file.endsWith('.js') && !file.includes('README')
      )

      return transactionFiles.map(file => ({
        filename: file,
        path: path.join(this.transactionsDir, file)
      }))
    } catch (error) {
      console.error('[Synthetic Monitoring] Failed to read transactions directory:', error.message)
      return []
    }
  }

  /**
   * Run all enabled synthetic transactions
   */
  async runAllTransactions() {
    try {
      // Get enabled transactions from database
      const enabledTransactions = await prisma.syntheticTransaction.findMany({
        where: { enabled: true }
      })

      if (enabledTransactions.length === 0) {
        console.log('[Synthetic Monitoring] No enabled transactions found')
        return []
      }

      const results = []

      for (const transaction of enabledTransactions) {
        try {
          const result = await this.runSingleTransaction(transaction.transactionId)
          results.push(result)
        } catch (error) {
          console.error(`[Synthetic Monitoring] Failed to run transaction ${transaction.transactionId}:`, error.message)
        }
      }

      console.log(`[Synthetic Monitoring] Completed ${results.length} transactions`)
      return results
    } catch (error) {
      console.error('[Synthetic Monitoring] Failed to run all transactions:', error.message)
      return []
    }
  }

  /**
   * Run all available transaction scripts (fallback when no DB entries)
   */
  async runAllAvailableScripts() {
    try {
      const transactions = await this.getAvailableTransactions()
      const results = []

      for (const transaction of transactions) {
        try {
          const transactionModule = require(transaction.path)
          if (typeof transactionModule.runTransaction === 'function') {
            console.log(`[Synthetic Monitoring] Running ${transaction.filename}...`)
            const result = await transactionModule.runTransaction()
            await this.saveResult(result)
            results.push(result)
          }
        } catch (error) {
          console.error(`[Synthetic Monitoring] Failed to run ${transaction.filename}:`, error.message)
        }
      }

      return results
    } catch (error) {
      console.error('[Synthetic Monitoring] Failed to run available scripts:', error.message)
      return []
    }
  }

  /**
   * Run a single synthetic transaction by ID
   */
  async runSingleTransaction(transactionId) {
    try {
      // Find transaction definition
      const transaction = await prisma.syntheticTransaction.findUnique({
        where: { transactionId }
      })

      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`)
      }

      // Load and execute the transaction script
      const scriptPath = path.join(__dirname, '..', transaction.scriptPath)
      const transactionModule = require(scriptPath)

      if (typeof transactionModule.runTransaction !== 'function') {
        throw new Error(`Transaction script ${scriptPath} does not export runTransaction function`)
      }

      console.log(`[Synthetic Monitoring] Running transaction: ${transaction.name}`)
      const result = await transactionModule.runTransaction()

      // Save result to database
      await this.saveResult(result)

      console.log(`[Synthetic Monitoring] Transaction ${transactionId} completed: ${result.status}`)
      return result
    } catch (error) {
      console.error(`[Synthetic Monitoring] Failed to run transaction ${transactionId}:`, error.message)
      throw error
    }
  }

  /**
   * Save synthetic test result to database
   */
  async saveResult(result) {
    try {
      const syntheticResult = await prisma.syntheticResult.create({
        data: {
          transactionId: result.transactionId,
          transactionName: result.transactionName,
          url: result.url,
          description: result.description,
          status: result.status,
          duration: result.duration,
          pageMetricsJson: stringifyJson(result.pageMetrics || []),
          errorMessage: result.errorMessage,
          stackTrace: result.stackTrace,
          screenshot: result.screenshot,
          browser: result.browser || 'chromium',
          viewportJson: stringifyJson(result.viewport || {}),
          userAgent: result.userAgent,
          scheduledRun: result.scheduledRun || false,
          cronSchedule: result.cronSchedule
        }
      })
      console.log(`[Synthetic Monitoring] Saved result for ${result.transactionId}: ${result.status}`)
      return syntheticResult
    } catch (error) {
      console.error('[Synthetic Monitoring] Failed to save result:', error.message)
      throw error
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stopScheduler() {
    console.log('[Synthetic Monitoring] Stopping scheduler...')
    this.scheduledTasks.forEach(task => task.stop())
    this.scheduledTasks = []
    console.log('[Synthetic Monitoring] Scheduler stopped')
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus() {
    return {
      active: this.scheduledTasks.length > 0,
      tasksCount: this.scheduledTasks.length,
      schedule: '*/30 * * * *'
    }
  }
}

// Export singleton instance
module.exports = new SyntheticMonitoringService()
