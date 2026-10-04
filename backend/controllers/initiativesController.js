// ============================================
// controllers/initiativesController.js
// Initiatives Controller - Updated for Prisma + SQLite
// ============================================
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  transformStrategicInitiative,
  transformTeam
} = require('../lib/helpers')
const featureHealthService = require('../services/featureHealthService')
const evidenceReportService = require('../services/evidenceReportService')

// Get all initiatives
exports.getAllInitiatives = async (req, res) => {
  try {
    const { status, team, priority } = req.query

    const where = { isActive: true }
    if (status) where.status = status
    if (team) where.teamId = team
    if (priority) where.priority = priority

    const initiatives = await prisma.strategicInitiative.findMany({
      where,
      include: {
        team: true,
        assignee: true
      },
      orderBy: [
        { priority: 'desc' },
        { progress: 'desc' }
      ]
    })

    res.json({ success: true, initiatives: initiatives.map(transformStrategicInitiative) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get initiative by ID with full details
exports.getInitiativeById = async (req, res) => {
  try {
    const initiative = await prisma.strategicInitiative.findUnique({
      where: { id: req.params.id },
      include: {
        team: true,
        assignee: true
      }
    })

    if (!initiative) {
      return res.status(404).json({ success: false, message: 'Initiative not found' })
    }

    res.json({ success: true, initiative: transformStrategicInitiative(initiative) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Get initiatives summary for dashboard
exports.getInitiativesSummary = async (req, res) => {
  try {
    const initiatives = await prisma.strategicInitiative.findMany({
      where: { isActive: true },
      include: {
        team: true,
        assignee: true
      },
      orderBy: [
        { priority: 'desc' },
        { progress: 'desc' }
      ]
    })

    const transformedInitiatives = initiatives.map(transformStrategicInitiative)

    // Calculate summary stats
    const summary = {
      total: transformedInitiatives.length,
      completed: transformedInitiatives.filter(i => i.status === 'completed').length,
      onTrack: transformedInitiatives.filter(i => i.status === 'on-track').length,
      inProgress: transformedInitiatives.filter(i => i.status === 'in-progress').length,
      atRisk: transformedInitiatives.filter(i => i.status === 'at-risk').length,
      planning: transformedInitiatives.filter(i => i.status === 'planning').length,
      averageProgress: transformedInitiatives.length > 0
        ? Math.round(transformedInitiatives.reduce((sum, i) => sum + i.progress, 0) / transformedInitiatives.length)
        : 0
    }

    // Group by team
    const byTeam = {}
    transformedInitiatives.forEach(init => {
      const teamName = init.team?.name || 'Unassigned'
      if (!byTeam[teamName]) {
        byTeam[teamName] = []
      }
      byTeam[teamName].push(init)
    })

    res.json({
      success: true,
      summary,
      initiatives: transformedInitiatives,
      byTeam
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Create new initiative
exports.createInitiative = async (req, res) => {
  try {
    const {
      name,
      description,
      teamId,
      progress,
      status,
      priority,
      targetQuarter,
      startDate,
      targetDate,
      assigneeId,
      milestones,
      metrics,
      tags
    } = req.body

    const initiative = await prisma.strategicInitiative.create({
      data: {
        name,
        description,
        teamId,
        progress: progress || 0,
        status: status || 'planning',
        priority: priority || 'medium',
        targetQuarter,
        startDate: startDate ? new Date(startDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        assigneeId,
        milestonesJson: stringifyJson(milestones || []),
        metricsJson: stringifyJson(metrics || {}),
        tagsJson: stringifyJson(tags || [])
      },
      include: {
        team: true,
        assignee: true
      }
    })

    res.status(201).json({ success: true, initiative: transformStrategicInitiative(initiative) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update initiative
exports.updateInitiative = async (req, res) => {
  try {
    const {
      name,
      description,
      teamId,
      progress,
      status,
      priority,
      targetQuarter,
      startDate,
      targetDate,
      completedDate,
      assigneeId,
      milestones,
      metrics,
      tags
    } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (teamId !== undefined) updateData.teamId = teamId
    if (progress !== undefined) updateData.progress = progress
    if (status !== undefined) updateData.status = status
    if (priority !== undefined) updateData.priority = priority
    if (targetQuarter !== undefined) updateData.targetQuarter = targetQuarter
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null
    if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId
    if (milestones !== undefined) updateData.milestonesJson = stringifyJson(milestones)
    if (metrics !== undefined) updateData.metricsJson = stringifyJson(metrics)
    if (tags !== undefined) updateData.tagsJson = stringifyJson(tags)

    const initiative = await prisma.strategicInitiative.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        team: true,
        assignee: true
      }
    })

    if (!initiative) {
      return res.status(404).json({ success: false, message: 'Initiative not found' })
    }

    res.json({ success: true, initiative: transformStrategicInitiative(initiative) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Update initiative progress
exports.updateProgress = async (req, res) => {
  try {
    const { progress, status, milestoneUpdates } = req.body

    const initiative = await prisma.strategicInitiative.findUnique({
      where: { id: req.params.id }
    })

    if (!initiative) {
      return res.status(404).json({ success: false, message: 'Initiative not found' })
    }

    const updateData = {}
    if (progress !== undefined) updateData.progress = progress
    if (status) updateData.status = status

    // Update milestones if provided
    if (milestoneUpdates && Array.isArray(milestoneUpdates)) {
      const milestones = parseJson(initiative.milestonesJson, [])
      milestoneUpdates.forEach(update => {
        const milestone = milestones.find(m => m.id === update.milestoneId)
        if (milestone) {
          if (update.status) milestone.status = update.status
          if (update.completedDate) milestone.completedDate = update.completedDate
        }
      })
      updateData.milestonesJson = stringifyJson(milestones)
    }

    const updated = await prisma.strategicInitiative.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        team: true,
        assignee: true
      }
    })

    res.json({ success: true, initiative: transformStrategicInitiative(updated) })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// Delete initiative (soft delete)
exports.deleteInitiative = async (req, res) => {
  try {
    const initiative = await prisma.strategicInitiative.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })

    if (!initiative) {
      return res.status(404).json({ success: false, message: 'Initiative not found' })
    }

    res.json({ success: true, message: 'Initiative deleted successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/initiatives/:id/health — Tier 1 RAG summary across every Feature (and any
// legacy directly-linked packs) under this initiative
exports.getInitiativeHealth = async (req, res) => {
  try {
    const health = await featureHealthService.computeInitiativeHealth(req.params.id)
    if (!health) return res.status(404).json({ success: false, message: 'Initiative not found' })
    res.json({ success: true, ...health })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
}

// GET /api/initiatives/:id/report — consolidated PDF spanning every Feature/pack in this initiative
exports.getInitiativeReport = async (req, res) => {
  try {
    const health = await featureHealthService.computeInitiativeHealth(req.params.id)
    if (!health) return res.status(404).json({ success: false, message: 'Initiative not found' })

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
    console.error('[Initiative report] Failed to generate PDF:', error.message)
    res.status(500).json({ success: false, message: 'Failed to generate report' })
  }
}
