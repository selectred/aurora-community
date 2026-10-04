const prisma = require('../lib/prisma')
const { transformFeature } = require('../lib/helpers')
const featureHealthService = require('../services/featureHealthService')
const evidenceReportService = require('../services/evidenceReportService')

// GET /api/features?initiativeId=xxx
exports.getFeatures = async (req, res) => {
  try {
    const { initiativeId } = req.query
    const where = initiativeId ? { initiativeId } : {}

    const features = await prisma.feature.findMany({
      where,
      include: {
        initiative: { select: { id: true, name: true } },
        team: true
      },
      orderBy: { name: 'asc' }
    })

    res.json({ success: true, features: features.map(transformFeature) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/features/:id
exports.getFeatureById = async (req, res) => {
  try {
    const feature = await prisma.feature.findUnique({
      where: { id: req.params.id },
      include: {
        initiative: { select: { id: true, name: true } },
        team: true,
        testPacks: { select: { id: true, name: true } }
      }
    })
    if (!feature) return res.status(404).json({ success: false, message: 'Feature not found' })
    res.json({ success: true, feature: transformFeature(feature) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// POST /api/features
exports.createFeature = async (req, res) => {
  try {
    const { name, description, initiativeId, teamId } = req.body
    if (!name?.trim()) return res.status(400).json({ success: false, message: '"name" is required' })
    if (!initiativeId) return res.status(400).json({ success: false, message: '"initiativeId" is required' })

    const initiative = await prisma.strategicInitiative.findUnique({ where: { id: initiativeId } })
    if (!initiative) return res.status(404).json({ success: false, message: 'Initiative not found' })

    const feature = await prisma.feature.create({
      data: { name: name.trim(), description: description || null, initiativeId, teamId: teamId || null },
      include: { initiative: { select: { id: true, name: true } }, team: true }
    })
    res.status(201).json({ success: true, feature: transformFeature(feature) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// PUT /api/features/:id
exports.updateFeature = async (req, res) => {
  try {
    const { name, description, teamId } = req.body
    const data = {}
    if (name !== undefined) data.name = name.trim()
    if (description !== undefined) data.description = description || null
    if (teamId !== undefined) data.teamId = teamId || null
    data.updatedAt = new Date()

    const feature = await prisma.feature.update({
      where: { id: req.params.id },
      data,
      include: { initiative: { select: { id: true, name: true } }, team: true }
    })
    res.json({ success: true, feature: transformFeature(feature) })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Feature not found' })
    res.status(500).json({ success: false, message: error.message })
  }
}

// DELETE /api/features/:id
exports.deleteFeature = async (req, res) => {
  try {
    await prisma.testPack.updateMany({ where: { featureId: req.params.id }, data: { featureId: null } })
    await prisma.feature.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Feature not found' })
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/features/:id/health — Tier 1 RAG summary for this feature
exports.getFeatureHealth = async (req, res) => {
  try {
    const health = await featureHealthService.computeFeatureHealth(req.params.id)
    if (!health) return res.status(404).json({ success: false, message: 'Feature not found' })
    res.json({ success: true, ...health })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/features/:id/report — consolidated PDF (headline RAG + per-failure detail)
exports.getFeatureReport = async (req, res) => {
  try {
    const health = await featureHealthService.computeFeatureHealth(req.params.id)
    if (!health) return res.status(404).json({ success: false, message: 'Feature not found' })

    const html = evidenceReportService.buildFeatureOrInitiativeReportHtml({
      scopeName: health.scopeName,
      scopeType: health.scopeType,
      ragRows: health.ragRows,
      failingTests: health.failingTests
    })

    const os = require('os')
    const path = require('path')
    const fs = require('fs').promises
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-report-'))
    const htmlPath = path.join(tmpDir, 'report.html')
    const pdfPath = path.join(tmpDir, 'report.pdf')
    await fs.writeFile(htmlPath, html, 'utf8')
    await evidenceReportService.renderPdf(htmlPath, pdfPath)

    const pdfBuffer = await fs.readFile(pdfPath)
    await fs.rm(tmpDir, { recursive: true, force: true })

    const filename = `${health.scopeName.replace(/[^a-z0-9]+/gi, '-')}-report.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(pdfBuffer)
  } catch (error) {
    console.error('[Feature report] Failed to generate PDF:', error.message)
    res.status(500).json({ success: false, message: 'Failed to generate report' })
  }
}
