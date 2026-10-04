// ============================================
// controllers/bugReportsController.js
// BugReport CRUD + lifecycle helper
// ============================================
const prisma = require('../lib/prisma')
const crypto = require('crypto')

function parseJson(val, fallback = []) {
  if (!val) return fallback
  try { return JSON.parse(val) } catch { return fallback }
}

function formatBugReport(r) {
  return {
    ...r,
    history: parseJson(r.historyJson, []),
    notes:   parseJson(r.notesJson,   []),
    historyJson: undefined,
    notesJson:   undefined
  }
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Generate a short bug title from spec name + error.
 * Attempts AI generation first; falls back to template string.
 */
async function generateBugTitle(specName, errorMessage) {
  try {
    const ai = require('../services/aiService')
    if (ai.isAvailable()) {
      return await ai.generateBugTitle(specName, errorMessage)
    }
  } catch {
    // AI unavailable — fall through to template
  }
  const msg = (errorMessage || 'unknown error').slice(0, 80)
  return `${specName} failed: ${msg}`
}

/**
 * Create, increment, or resolve a BugReport after a spec run.
 * Call this from agentTestsController after every runSpec / pack run.
 */
async function upsertBugReportForResult({ specId, packId, source, specName, result }) {
  try {
    if (result.status === 'failed') {
      const title = await generateBugTitle(specName, result.error)
      const screenshotPath = result.evidenceDir ? `${result.evidenceDir}/screenshot.png` : null

      const existing = await prisma.bugReport.findFirst({
        where: { specId, status: { in: ['open', 'in-progress'] } }
      })

      if (existing) {
        await prisma.bugReport.update({
          where: { id: existing.id },
          data: {
            consecutiveFails: { increment: 1 },
            lastFailedAt: new Date(),
            errorMessage: result.error || existing.errorMessage,
            stackTrace: result.stackTrace || existing.stackTrace,
            // Only overwrite evidence if this run actually captured a bundle — an older
            // bundle (possibly since pruned) is still better than nothing.
            ...(result.evidenceDir ? { evidenceDir: result.evidenceDir, screenshotPath } : {})
          }
        })
      } else {
        await prisma.bugReport.create({
          data: {
            title,
            source,
            specId,
            packId: packId || null,
            errorMessage: result.error || null,
            stackTrace: result.stackTrace || null,
            evidenceDir: result.evidenceDir || null,
            screenshotPath,
            firstFailedAt: new Date(),
            lastFailedAt: new Date()
          }
        })
      }
    } else if (result.status === 'passed') {
      await prisma.bugReport.updateMany({
        where: { specId, status: { in: ['open', 'in-progress'] } },
        data: { status: 'resolved', resolvedAt: new Date() }
      })
    }
  } catch (error) {
    // Non-fatal — log but don't break the test run
    console.error('[BugReport] Failed to upsert bug report:', error.message)
  }
}

// ── CRUD Controllers ──────────────────────────────────────────────

/**
 * GET /api/bug-reports/summary
 * Returns counts grouped by status and severity.
 */
exports.getBugReportsSummary = async (req, res) => {
  try {
    const [byStatusRaw, bySeverityRaw] = await Promise.all([
      prisma.bugReport.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.bugReport.groupBy({ by: ['severity'], _count: { id: true } })
    ])

    const byStatus = { open: 0, 'in-progress': 0, resolved: 0, 'wont-fix': 0 }
    for (const row of byStatusRaw) byStatus[row.status] = row._count.id

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const row of bySeverityRaw) bySeverity[row.severity] = row._count.id

    res.json({ success: true, summary: { byStatus, bySeverity } })
  } catch (error) {
    console.error('[BugReport] Summary error:', error)
    res.status(500).json({ success: false, message: 'Failed to load summary' })
  }
}

/**
 * GET /api/bug-reports
 * Optional query: ?status=open&severity=high&source=synthetic
 */
exports.getAllBugReports = async (req, res) => {
  try {
    const where = {}
    if (req.query.status) where.status = req.query.status
    if (req.query.severity) where.severity = req.query.severity
    if (req.query.source) where.source = req.query.source

    const reports = await prisma.bugReport.findMany({
      where,
      include: { spec: { select: { specId: true, name: true, url: true } } },
      orderBy: [{ status: 'asc' }, { lastFailedAt: 'desc' }]
    })

    res.json({ success: true, bugReports: reports.map(formatBugReport) })
  } catch (error) {
    console.error('[BugReport] List error:', error)
    res.status(500).json({ success: false, message: 'Failed to load bug reports' })
  }
}

/**
 * GET /api/bug-reports/:id
 */
exports.getBugReportById = async (req, res) => {
  try {
    const report = await prisma.bugReport.findUnique({
      where: { id: req.params.id },
      include: { spec: { select: { specId: true, name: true, url: true, status: true } } }
    })
    if (!report) return res.status(404).json({ success: false, message: 'Bug report not found' })
    res.json({ success: true, bugReport: formatBugReport(report) })
  } catch (error) {
    console.error('[BugReport] Get error:', error)
    res.status(500).json({ success: false, message: 'Failed to load bug report' })
  }
}

/**
 * PUT /api/bug-reports/:id
 * Allows updating: status, severity, reproSteps
 */
exports.updateBugReport = async (req, res) => {
  try {
    const existing = await prisma.bugReport.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Bug report not found' })

    const { status, severity, reproSteps } = req.body
    const data = {}
    if (status)    data.status    = status
    if (severity)  data.severity  = severity
    if (reproSteps !== undefined) data.reproSteps = reproSteps
    if (status === 'resolved' && existing.status !== 'resolved') data.resolvedAt = new Date()

    // Record what changed in history
    const history = parseJson(existing.historyJson, [])
    const now = new Date().toISOString()
    const tracked = [
      { field: 'status',   from: existing.status,   to: status },
      { field: 'severity', from: existing.severity, to: severity }
    ]
    for (const t of tracked) {
      if (t.to && t.to !== t.from) {
        history.push({ at: now, field: t.field, from: t.from, to: t.to })
      }
    }
    data.historyJson = JSON.stringify(history)

    const updated = await prisma.bugReport.update({ where: { id: req.params.id }, data })
    res.json({ success: true, bugReport: formatBugReport(updated) })
  } catch (error) {
    console.error('[BugReport] Update error:', error)
    res.status(500).json({ success: false, message: 'Failed to update bug report' })
  }
}

exports.addNote = async (req, res) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'Note text is required' })

    const existing = await prisma.bugReport.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Bug report not found' })

    const notes = parseJson(existing.notesJson, [])
    notes.push({ id: crypto.randomUUID(), text: text.trim(), createdAt: new Date().toISOString() })

    const updated = await prisma.bugReport.update({
      where: { id: req.params.id },
      data: { notesJson: JSON.stringify(notes) },
      include: { spec: { select: { specId: true, name: true, url: true, status: true } } }
    })
    res.json({ success: true, bugReport: formatBugReport(updated) })
  } catch (error) {
    console.error('[BugReport] Add note error:', error)
    res.status(500).json({ success: false, message: 'Failed to add note' })
  }
}

exports.deleteNote = async (req, res) => {
  try {
    const existing = await prisma.bugReport.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Bug report not found' })

    const notes = parseJson(existing.notesJson, []).filter(n => n.id !== req.params.noteId)
    const updated = await prisma.bugReport.update({
      where: { id: req.params.id },
      data: { notesJson: JSON.stringify(notes) },
      include: { spec: { select: { specId: true, name: true, url: true, status: true } } }
    })
    res.json({ success: true, bugReport: formatBugReport(updated) })
  } catch (error) {
    console.error('[BugReport] Delete note error:', error)
    res.status(500).json({ success: false, message: 'Failed to delete note' })
  }
}

/**
 * DELETE /api/bug-reports
 * Bulk delete — accepts same ?status, ?severity, ?source filters as GET.
 * Omit all filters to delete everything.
 */
exports.deleteAllBugReports = async (req, res) => {
  try {
    const where = {}
    if (req.query.status)   where.status   = req.query.status
    if (req.query.severity) where.severity = req.query.severity
    if (req.query.source)   where.source   = req.query.source

    const result = await prisma.bugReport.deleteMany({ where })
    res.json({ success: true, deleted: result.count })
  } catch (error) {
    console.error('[BugReport] Delete all error:', error)
    res.status(500).json({ success: false, message: 'Failed to delete bug reports' })
  }
}

/**
 * DELETE /api/bug-reports/:id
 */
exports.deleteBugReport = async (req, res) => {
  try {
    const existing = await prisma.bugReport.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ success: false, message: 'Bug report not found' })
    await prisma.bugReport.delete({ where: { id: req.params.id } })
    res.json({ success: true, message: 'Bug report dismissed' })
  } catch (error) {
    console.error('[BugReport] Delete error:', error)
    res.status(500).json({ success: false, message: 'Failed to dismiss bug report' })
  }
}

// Export helper for use in agentTestsController
exports.upsertBugReportForResult = upsertBugReportForResult
