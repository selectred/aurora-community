// ============================================
// routes/dataTransfer.js - Data import/export
// ============================================
const express = require('express')
const router = express.Router()
const prisma = require('../lib/prisma')
const { authMiddleware } = require('../middleware/auth')
const { saveGeneratedCode, DEFAULT_PACKS_ROOT } = require('../lib/packStorage')
const fs = require('fs').promises
const path = require('path')

const SCHEMA_VERSION = 1
const SUPPORTED_SCHEMA_VERSIONS = [1]

// ============================================
// GET /api/data/export/summary
// Returns record counts without exporting data
// ============================================
router.get('/export/summary', authMiddleware, async (req, res) => {
  try {
    const [testResults, agentSpecs, teams, teamMembers, initiatives] = await Promise.all([
      prisma.testResult.count(),
      prisma.agentTestSpec.count(),
      prisma.team.count(),
      prisma.teamMember.count(),
      prisma.strategicInitiative.count()
    ])

    res.json({
      success: true,
      summary: { testResults, agentSpecs, teams, teamMembers, initiatives }
    })
  } catch (error) {
    console.error('[DataTransfer] Export summary error:', error)
    res.status(500).json({ success: false, message: 'Failed to generate export summary' })
  }
})

// ============================================
// GET /api/data/export
// Streams a JSON file download
// ============================================
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const [testResults, agentSpecs, teams, teamMembers, initiatives, settings] = await Promise.all([
      prisma.testResult.findMany({ orderBy: { executedAt: 'asc' } }),
      prisma.agentTestSpec.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.team.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.teamMember.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.strategicInitiative.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.appSettings.findFirst()
    ])

    const pkg = require('../package.json')
    const exportData = {
      auroraVersion: pkg.version,
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      data: {
        settings: settings ? {
          managerName: settings.managerName,
          email: settings.email,
          preferencesJson: settings.preferencesJson,
          syntheticDefaultsJson: settings.syntheticDefaultsJson,
          continuumEnabled: settings.continuumEnabled,
          continuumUrl: settings.continuumUrl
          // anthropicKey, openaiKey, azureOpenaiKey excluded intentionally
        } : null,

        teams: teams.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          color: t.color,
          metricsJson: t.metricsJson,
          isActive: t.isActive,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt
        })),

        teamMembers: teamMembers.map(m => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          avatarColor: m.avatarColor,
          isActive: m.isActive,
          statsJson: m.statsJson,
          teamId: m.teamId,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt
        })),

        // AgentTestSpec.id is the UUID used as FK in TestResult.specId
        // File-backed specs have their code embedded inline in the export for portability
        agentSpecs: await Promise.all(agentSpecs.map(async s => {
          let generatedCode = s.generatedCode
          if (s.codeStorage === 'file' && s.codeFilePath) {
            const packsRoot = settings?.packsRootDir || DEFAULT_PACKS_ROOT
            try {
              generatedCode = await fs.readFile(path.join(packsRoot, s.codeFilePath), 'utf8')
            } catch {
              console.warn(`[export] Could not read pack file for spec ${s.specId}: ${s.codeFilePath}`)
              generatedCode = null
            }
          }
          return {
            id: s.id,
            specId: s.specId,
            name: s.name,
            testType: s.testType,
            isSynthetic: s.isSynthetic,
            promotedToSyntheticAt: s.promotedToSyntheticAt,
            description: s.description,
            url: s.url,
            method: s.method,
            headers: s.headers,
            requestBody: s.requestBody,
            expectedStatus: s.expectedStatus,
            alertThreshold: s.alertThreshold,
            markdownSpec: s.markdownSpec,
            generatedCode,       // always inline in the export payload
            codeStorage: 'inline', // importer treats it as inline regardless
            codeFilePath: null,
            fixturesFilePath: s.fixturesFilePath || null,
            status: s.status,
            enabled: s.enabled,
            schedule: s.schedule,
            timeout: s.timeout,
            healCount: s.healCount,
            lastHealDetailsJson: s.lastHealDetailsJson,
            tagsJson: s.tagsJson,
            generationMetaJson: s.generationMetaJson,
            teamId: s.teamId,
            createdById: s.createdById,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
          }
        })),

        testResults: testResults.map(r => ({
          id: r.id,
          testCaseId: r.testCaseId,
          testName: r.testName,
          testType: r.testType,
          suite: r.suite,
          status: r.status,
          duration: r.duration,
          errorMessage: r.errorMessage,
          stackTrace: r.stackTrace,
          browser: r.browser,
          environment: r.environment,
          scriptLocation: r.scriptLocation,
          retries: r.retries,
          metadataJson: r.metadataJson,
          teamId: r.teamId,
          executedById: r.executedById,
          specId: r.specId, // FK to AgentTestSpec.id (UUID)
          executedAt: r.executedAt,
          createdAt: r.createdAt
        })),

        initiatives: initiatives.map(i => ({
          id: i.id,
          name: i.name,
          description: i.description,
          progress: i.progress,
          status: i.status,
          priority: i.priority,
          targetQuarter: i.targetQuarter,
          startDate: i.startDate,
          targetDate: i.targetDate,
          completedDate: i.completedDate,
          milestonesJson: i.milestonesJson,
          metricsJson: i.metricsJson,
          tagsJson: i.tagsJson,
          isActive: i.isActive,
          teamId: i.teamId,
          assigneeId: i.assigneeId,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt
        }))
      }
    }

    const date = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="aurora-export-${date}.json"`)
    res.json(exportData)
  } catch (error) {
    console.error('[DataTransfer] Export error:', error)
    res.status(500).json({ success: false, message: 'Failed to export data' })
  }
})

// ============================================
// POST /api/data/import
// Accepts parsed JSON export, upserts all records
// ============================================
router.post('/import', authMiddleware, async (req, res) => {
  try {
    const payload = req.body

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' })
    }

    if (!payload.schemaVersion || !SUPPORTED_SCHEMA_VERSIONS.includes(payload.schemaVersion)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported schema version: ${payload.schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`
      })
    }

    const { data } = payload
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Missing or invalid data field' })
    }

    const summary = { imported: {}, skipped: {} }

    await prisma.$transaction(async (tx) => {
      // ── 1. Teams (natural key: name) ──────────────────────────────
      const teamIdMap = {} // old UUID → new UUID
      let teamsImported = 0, teamsSkipped = 0

      for (const team of (data.teams || [])) {
        const existing = await tx.team.findFirst({ where: { name: team.name } })
        if (existing) {
          teamIdMap[team.id] = existing.id
          teamsSkipped++
        } else {
          const created = await tx.team.create({
            data: {
              name: team.name,
              description: team.description || '',
              color: team.color || '#7367F0',
              metricsJson: team.metricsJson || '{}',
              isActive: team.isActive !== undefined ? team.isActive : true
            }
          })
          teamIdMap[team.id] = created.id
          teamsImported++
        }
      }
      summary.imported.teams = teamsImported
      summary.skipped.teams = teamsSkipped

      // ── 2. TeamMembers (natural key: name + resolved teamId) ──────
      const memberIdMap = {} // old UUID → new UUID
      let membersImported = 0, membersSkipped = 0

      for (const member of (data.teamMembers || [])) {
        const newTeamId = member.teamId ? (teamIdMap[member.teamId] || member.teamId) : null
        if (!newTeamId) { membersSkipped++; continue }

        const existing = await tx.teamMember.findFirst({
          where: { name: member.name, teamId: newTeamId }
        })
        if (existing) {
          memberIdMap[member.id] = existing.id
          membersSkipped++
        } else {
          const created = await tx.teamMember.create({
            data: {
              name: member.name,
              email: member.email || null,
              role: member.role || 'qa_engineer',
              avatarColor: member.avatarColor || '#7367F0',
              isActive: member.isActive !== undefined ? member.isActive : true,
              statsJson: member.statsJson || '{}',
              teamId: newTeamId
            }
          })
          memberIdMap[member.id] = created.id
          membersImported++
        }
      }
      summary.imported.teamMembers = membersImported
      summary.skipped.teamMembers = membersSkipped

      // ── 3. AgentTestSpecs (natural key: specId) ───────────────────
      // specUuidMap maps old AgentTestSpec.id (UUID) → new AgentTestSpec.id (UUID)
      // because TestResult.specId is a FK to AgentTestSpec.id, not specId
      const importerSettings = await prisma.appSettings.findFirst()
      const specUuidMap = {}
      let specsImported = 0, specsSkipped = 0

      for (const spec of (data.agentSpecs || [])) {
        const existing = await tx.agentTestSpec.findUnique({ where: { specId: spec.specId } })
        if (existing) {
          specUuidMap[spec.id] = existing.id
          specsSkipped++
        } else {
          // Re-apply the importer's threshold decision so large codes land on disk
          let { codeStorage, codeFilePath, generatedCode } = { codeStorage: 'inline', codeFilePath: null, generatedCode: spec.generatedCode || null }
          if (spec.generatedCode) {
            ;({ codeStorage, codeFilePath, generatedCode } = await saveGeneratedCode(spec.specId, spec.generatedCode, importerSettings))
          }

          const created = await tx.agentTestSpec.create({
            data: {
              specId: spec.specId,
              name: spec.name,
              testType: spec.testType || 'functional',
              isSynthetic: spec.isSynthetic || false,
              promotedToSyntheticAt: spec.promotedToSyntheticAt ? new Date(spec.promotedToSyntheticAt) : null,
              description: spec.description || null,
              url: spec.url,
              method: spec.method || 'GET',
              headers: spec.headers || '',
              requestBody: spec.requestBody || '',
              expectedStatus: spec.expectedStatus || 200,
              alertThreshold: spec.alertThreshold || 3000,
              markdownSpec: spec.markdownSpec,
              generatedCode,
              codeStorage,
              codeFilePath,
              fixturesFilePath: spec.fixturesFilePath || null,
              status: spec.status || 'draft',
              enabled: spec.enabled !== undefined ? spec.enabled : true,
              schedule: spec.schedule || '*/30 * * * *',
              timeout: spec.timeout || 60000,
              healCount: spec.healCount || 0,
              lastHealDetailsJson: spec.lastHealDetailsJson || '{}',
              tagsJson: spec.tagsJson || '[]',
              generationMetaJson: spec.generationMetaJson || '{}',
              teamId: spec.teamId ? (teamIdMap[spec.teamId] || null) : null,
              createdById: spec.createdById ? (memberIdMap[spec.createdById] || null) : null
            }
          })
          specUuidMap[spec.id] = created.id
          specsImported++
        }
      }
      summary.imported.agentSpecs = specsImported
      summary.skipped.agentSpecs = specsSkipped

      // ── 4. TestResults (natural key: testCaseId + executedAt) ─────
      let resultsImported = 0, resultsSkipped = 0

      for (const result of (data.testResults || [])) {
        const executedAt = result.executedAt ? new Date(result.executedAt) : new Date()
        const existing = await tx.testResult.findFirst({
          where: { testCaseId: result.testCaseId, executedAt }
        })
        if (existing) {
          resultsSkipped++
        } else {
          await tx.testResult.create({
            data: {
              testCaseId: result.testCaseId,
              testName: result.testName,
              testType: result.testType,
              suite: result.suite || null,
              status: result.status,
              duration: result.duration || null,
              errorMessage: result.errorMessage || null,
              stackTrace: result.stackTrace || null,
              browser: result.browser || null,
              environment: result.environment || 'staging',
              scriptLocation: result.scriptLocation || null,
              retries: result.retries || 0,
              metadataJson: result.metadataJson || '{}',
              teamId: result.teamId ? (teamIdMap[result.teamId] || null) : null,
              executedById: result.executedById ? (memberIdMap[result.executedById] || null) : null,
              specId: result.specId ? (specUuidMap[result.specId] || null) : null,
              executedAt,
              createdAt: result.createdAt ? new Date(result.createdAt) : new Date()
            }
          })
          resultsImported++
        }
      }
      summary.imported.testResults = resultsImported
      summary.skipped.testResults = resultsSkipped

      // ── 5. Initiatives (natural key: name + resolved teamId) ──────
      let initiativesImported = 0, initiativesSkipped = 0

      for (const initiative of (data.initiatives || [])) {
        const newTeamId = initiative.teamId ? (teamIdMap[initiative.teamId] || null) : null
        const existing = await tx.strategicInitiative.findFirst({
          where: { name: initiative.name, teamId: newTeamId }
        })
        if (existing) {
          initiativesSkipped++
        } else {
          await tx.strategicInitiative.create({
            data: {
              name: initiative.name,
              description: initiative.description || null,
              progress: initiative.progress || 0,
              status: initiative.status || 'planning',
              priority: initiative.priority || 'medium',
              targetQuarter: initiative.targetQuarter || null,
              startDate: initiative.startDate ? new Date(initiative.startDate) : null,
              targetDate: initiative.targetDate ? new Date(initiative.targetDate) : null,
              completedDate: initiative.completedDate ? new Date(initiative.completedDate) : null,
              milestonesJson: initiative.milestonesJson || '[]',
              metricsJson: initiative.metricsJson || '{}',
              tagsJson: initiative.tagsJson || '[]',
              isActive: initiative.isActive !== undefined ? initiative.isActive : true,
              teamId: newTeamId,
              assigneeId: initiative.assigneeId ? (memberIdMap[initiative.assigneeId] || null) : null
            }
          })
          initiativesImported++
        }
      }
      summary.imported.initiatives = initiativesImported
      summary.skipped.initiatives = initiativesSkipped

    }, { timeout: 60000 }) // 60s for large imports

    console.log('[DataTransfer] Import complete:', summary)
    res.json({ success: true, summary })
  } catch (error) {
    console.error('[DataTransfer] Import error:', error)
    res.status(500).json({ success: false, message: `Import failed: ${error.message}` })
  }
})

// POST /api/data/load-sample-data
// Inserts demo data. Skips if teams already exist.
router.post('/load-sample-data', authMiddleware, async (req, res) => {
  try {
    const { seedSampleData } = require('../services/seedService')
    const result = await seedSampleData()
    if (result.skipped) {
      return res.status(409).json({ success: false, message: 'Data already exists — clear it first before loading sample data.' })
    }
    res.json({ success: true, message: 'Sample data loaded successfully.', inserted: result.inserted })
  } catch (error) {
    console.error('Load sample data error:', error)
    res.status(500).json({ success: false, message: `Failed to load sample data: ${error.message}` })
  }
})

// POST /api/data/clear-sample-data
// Deletes all seeded/sample data — preserves AppSettings and License
router.post('/clear-sample-data', authMiddleware, async (req, res) => {
  try {
    await prisma.syntheticResult.deleteMany({})
    await prisma.syntheticTransaction.deleteMany({})
    await prisma.testResult.deleteMany({})
    await prisma.agentTerminalSession.deleteMany({})
    await prisma.testPackTest.deleteMany({})
    await prisma.testPack.deleteMany({})
    await prisma.agentTestSpec.deleteMany({})
    await prisma.strategicInitiative.deleteMany({})
    // Unset team leads before deleting members (FK constraint)
    await prisma.team.updateMany({ data: { leadId: null } })
    await prisma.teamMember.deleteMany({})
    await prisma.team.deleteMany({})

    res.json({ success: true })
  } catch (error) {
    console.error('Clear sample data error:', error)
    res.status(500).json({ success: false, message: `Failed to clear data: ${error.message}` })
  }
})

module.exports = router
