// ============================================
// controllers/evidenceController.js
// Serves failure evidence bundle files (screenshot/video/trace/report) and the
// zipped "Download failure package" bundle.
// ============================================
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const prisma = require('../lib/prisma')
const evidenceStorage = require('../lib/evidenceStorage')
const evidenceReportService = require('../services/evidenceReportService')
const evidenceZipService = require('../services/evidenceZipService')

const SAFE_DIR_RE = /^[a-zA-Z0-9_-]+$/
const ALLOWED_FILES = new Set(['screenshot.png', 'replay.webm', 'trace.zip', 'report.html', 'report.pdf'])

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf'
}

/**
 * Resolve an evidence bundle file path, guarding against path traversal with both an
 * allowlist (evidenceDir charset, fixed filename set) and a containment check on the
 * resolved absolute path.
 * @returns {Promise<{ok:true, absPath:string}|{ok:false, status:number, message:string}>}
 */
async function resolveEvidenceFile(evidenceDir, filename) {
  if (!SAFE_DIR_RE.test(evidenceDir || '')) return { ok: false, status: 400, message: 'Invalid evidence bundle id' }
  if (!ALLOWED_FILES.has(filename)) return { ok: false, status: 400, message: 'Invalid file name' }

  const settings = await prisma.appSettings.findFirst().catch(() => null)
  const evidenceRoot = evidenceStorage.getEvidenceRoot(settings)
  const bundleDir = evidenceStorage.resolveBundleDir(evidenceRoot, evidenceDir)
  const absPath = path.join(bundleDir, filename)

  // Containment check — the resolved path must still live under evidenceRoot
  const rootWithSep = path.join(evidenceRoot, path.sep)
  if (!absPath.startsWith(rootWithSep)) return { ok: false, status: 400, message: 'Invalid path' }

  return { ok: true, absPath, bundleDir, evidenceRoot }
}

// GET /api/evidence/:evidenceDir/:filename
exports.getEvidenceFile = async (req, res) => {
  try {
    const { evidenceDir, filename } = req.params
    const resolved = await resolveEvidenceFile(evidenceDir, filename)
    if (!resolved.ok) return res.status(resolved.status).json({ success: false, message: resolved.message })

    if (!fs.existsSync(resolved.absPath)) {
      return res.status(404).json({ success: false, message: 'Evidence file not found' })
    }

    const ext = path.extname(filename)
    res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream')
    fs.createReadStream(resolved.absPath).pipe(res)
  } catch (error) {
    console.error('[Evidence] Failed to serve file:', error.message)
    res.status(500).json({ success: false, message: 'Failed to serve evidence file' })
  }
}

// GET /api/evidence/:evidenceDir/download — zipped bundle
exports.downloadEvidenceBundle = async (req, res) => {
  try {
    const { evidenceDir } = req.params
    if (!SAFE_DIR_RE.test(evidenceDir || '')) {
      return res.status(400).json({ success: false, message: 'Invalid evidence bundle id' })
    }

    const settings = await prisma.appSettings.findFirst().catch(() => null)
    const evidenceRoot = evidenceStorage.getEvidenceRoot(settings)
    const buffer = await evidenceZipService.zipBundle(evidenceRoot, evidenceDir)

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${evidenceDir}.zip"`)
    res.send(buffer)
  } catch (error) {
    console.error('[Evidence] Failed to zip bundle:', error.message)
    res.status(404).json({ success: false, message: 'Evidence bundle not found or empty' })
  }
}

// GET /api/evidence/:evidenceDir/pdf — lazy per-test PDF (rendered on first request, cached after)
exports.getEvidencePdf = async (req, res) => {
  try {
    const { evidenceDir } = req.params
    const resolved = await resolveEvidenceFile(evidenceDir, 'report.pdf')
    if (!resolved.ok) return res.status(resolved.status).json({ success: false, message: resolved.message })

    if (!fs.existsSync(resolved.absPath)) {
      const htmlPath = path.join(resolved.bundleDir, 'report.html')
      if (!fs.existsSync(htmlPath)) {
        return res.status(404).json({ success: false, message: 'No report.html to render — evidence bundle incomplete' })
      }
      await evidenceReportService.renderPdf(htmlPath, resolved.absPath)
    }

    res.setHeader('Content-Type', 'application/pdf')
    fs.createReadStream(resolved.absPath).pipe(res)
  } catch (error) {
    console.error('[Evidence] Failed to render/serve PDF:', error.message)
    res.status(500).json({ success: false, message: 'Failed to generate PDF' })
  }
}
