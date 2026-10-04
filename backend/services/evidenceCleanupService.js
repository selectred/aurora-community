'use strict'

/**
 * evidenceCleanupService.js — daily retention sweep for failure evidence bundles.
 * Scheduled from server.js alongside the existing license re-validation cron job.
 */

const evidenceStorage = require('../lib/evidenceStorage')

/**
 * Prune evidence bundles older than AppSettings.evidenceRetentionDays, and null out
 * any TestResult/BugReport rows that pointed at a now-deleted bundle so the UI doesn't
 * show dead links.
 * @param {object} prisma
 */
async function pruneExpiredBundles(prisma) {
  try {
    const settings = await prisma.appSettings.findFirst()
    if (!settings) return

    const evidenceRoot = evidenceStorage.getEvidenceRoot(settings)
    const deleted = await evidenceStorage.pruneOldBundles(evidenceRoot, settings.evidenceRetentionDays)

    if (deleted.length === 0) return

    await prisma.testResult.updateMany({
      where: { evidenceDir: { in: deleted } },
      data: { evidenceDir: null, screenshot: null }
    })
    await prisma.bugReport.updateMany({
      where: { evidenceDir: { in: deleted } },
      data: { evidenceDir: null, screenshotPath: null }
    })

    console.log(`[Evidence Cleanup] Pruned ${deleted.length} expired evidence bundle(s)`)
  } catch (error) {
    console.error('[Evidence Cleanup] Failed:', error.message)
  }
}

module.exports = { pruneExpiredBundles }
