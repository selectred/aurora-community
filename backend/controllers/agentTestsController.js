// ============================================
// controllers/agentTestsController.js
// Updated for Prisma + SQLite
// ============================================
const prisma = require('../lib/prisma')
const { encrypt, decrypt, generateKey } = require('../lib/encryption')
const {
  parseJson,
  stringifyJson,
  transformAgentTestSpec,
  transformTestPack
} = require('../lib/helpers')
const agentTestRunner = require('../services/agentTestRunner')
const SELENIUM_RETIRED = 'Selenium specs are no longer supported. Regenerate this test with Playwright.'
const { upsertBugReportForResult } = require('./bugReportsController')
const { resolvePackCode, deletePackFile, isPackFileAccessible, DEFAULT_PACKS_ROOT } = require('../lib/packStorage')
const fs = require('fs').promises
const ai = require('../services/aiService')
const pageProbeService = require('../services/pageProbeService')
const specParserService = require('../services/specParserService')
const promptService = require('../services/promptService')

function normalizeUrl(url) {
  if (!url) return url
  if (!/^https?:\/\//i.test(url)) return 'https://' + url
  return url
}
const path = require('path')

/**
 * Get all agent test specs
 */
exports.getSpecs = async (req, res) => {
  try {
    const { status, enabled, tags, testType } = req.query

    const where = {}
    if (status) where.status = status
    if (enabled !== undefined) where.enabled = enabled === 'true'
    if (testType) where.testType = testType

    const specs = await prisma.agentTestSpec.findMany({
      where,
      include: {
        createdBy: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // Filter by tags if provided (tags are stored as JSON)
    let filteredSpecs = specs
    if (tags) {
      const tagList = tags.split(',')
      filteredSpecs = specs.filter(spec => {
        const specTags = parseJson(spec.tagsJson, [])
        return tagList.some(t => specTags.includes(t))
      })
    }

    res.json(filteredSpecs.map(transformAgentTestSpec))
  } catch (error) {
    console.error('Error fetching agent specs:', error)
    res.status(500).json({ error: 'Failed to fetch specs' })
  }
}

/**
 * Get a single spec by ID
 */
exports.getSpecById = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId },
      include: {
        createdBy: true
      }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }

    res.json(transformAgentTestSpec(spec))
  } catch (error) {
    console.error('Error fetching spec:', error)
    res.status(500).json({ error: 'Failed to fetch spec' })
  }
}

/**
 * Create a new agent test spec
 */
exports.createSpec = async (req, res) => {
  try {
    const {
      name,
      description,
      url,
      markdownSpec,
      tags,
      schedule,
      timeout,
      testType,
      method,
      headers,
      requestBody,
      expectedStatus,
      alertThreshold,
      teamId
    } = req.body

    // Generate unique spec ID based on test type
    const typePrefix = testType || 'functional'
    const specId = `${typePrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const spec = await prisma.agentTestSpec.create({
      data: {
        specId,
        name,
        testType: testType || 'functional',
        description,
        url: normalizeUrl(url),
        markdownSpec,
        tagsJson: stringifyJson(tags || []),
        schedule: schedule || '*/30 * * * *',
        timeout: timeout || 60000,
        status: 'draft',
        method: method || 'GET',
        headers: headers || '',
        requestBody: requestBody || '',
        expectedStatus: expectedStatus || 200,
        alertThreshold: alertThreshold || 3000,
        teamId
      }
    })

    res.status(201).json(transformAgentTestSpec(spec))
  } catch (error) {
    console.error('Error creating spec:', error)
    res.status(500).json({ error: 'Failed to create spec' })
  }
}

/**
 * Update an existing spec
 */
exports.updateSpec = async (req, res) => {
  try {
    const { name, description, url, markdownSpec, tags, schedule, timeout, enabled } = req.body

    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (url !== undefined) updateData.url = normalizeUrl(url)
    if (markdownSpec !== undefined) {
      updateData.markdownSpec = markdownSpec
      updateData.status = 'draft' // Reset status when spec changes
      updateData.generatedCode = null
      // If spec was file-backed, delete the stale file and revert to inline
      if (spec.codeStorage === 'file' && spec.codeFilePath) {
        const settings = await prisma.appSettings.findFirst()
        await deletePackFile(spec.codeFilePath, settings?.packsRootDir)
        updateData.codeStorage = 'inline'
        updateData.codeFilePath = null
      }
    }
    if (tags !== undefined) updateData.tagsJson = stringifyJson(tags)
    if (schedule !== undefined) updateData.schedule = schedule
    if (timeout !== undefined) updateData.timeout = timeout
    if (enabled !== undefined) updateData.enabled = enabled

    const updated = await prisma.agentTestSpec.update({
      where: { specId: req.params.specId },
      data: updateData
    })

    res.json(transformAgentTestSpec(updated))
  } catch (error) {
    console.error('Error updating spec:', error)
    res.status(500).json({ error: 'Failed to update spec' })
  }
}

/**
 * Delete a spec
 */
exports.deleteSpec = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: req.params.specId } })
    if (!spec) return res.status(404).json({ error: 'Spec not found' })

    // Delete on-disk file before removing the DB record
    if (spec.codeStorage === 'file' && spec.codeFilePath) {
      const settings = await prisma.appSettings.findFirst()
      await deletePackFile(spec.codeFilePath, settings?.packsRootDir)
    }

    await prisma.agentTestSpec.delete({
      where: { specId: req.params.specId }
    })

    res.json({ message: 'Spec deleted successfully' })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Spec not found' })
    }
    console.error('Error deleting spec:', error)
    res.status(500).json({ error: 'Failed to delete spec' })
  }
}

/**
 * Generate Playwright code from a spec
 */
exports.generateCode = async (req, res) => {
  const specId = req.params.specId
  try {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec) return res.status(404).json({ error: 'Spec not found' })

    // API tests don't need a probe — delegate to the template runner
    if (spec.testType === 'api') {
      await prisma.agentTestSpec.update({ where: { specId }, data: { status: 'generating' } })
      const code = await agentTestRunner.generateCode(specId)
      return res.json({ specId: spec.specId, generatedCode: code, status: 'ready' })
    }

    // Functional tests: probe the live page first, then use AI
    if (!spec.url) {
      return res.status(400).json({ error: 'No URL set on this spec. Set a URL before generating.' })
    }

    await prisma.agentTestSpec.update({ where: { specId }, data: { status: 'generating' } })

    // Probe the live page — soft-fail so generation still proceeds from markdown alone
    let liveContext = null
    try {
      const snap = await pageProbeService.ariaSnapshot(spec.url)
      liveContext = snap.context
    } catch (probeErr) {
      console.warn(`Probe failed for ${spec.url} (${probeErr.message}) — generating from markdown only`)
    }

    // Collect pack variable names so the AI uses {{NAME}} placeholders instead of guessing values
    const packLink = await prisma.testPackTest.findFirst({ where: { specId } })
    const packVarNames = packLink
      ? (await prisma.packVariable.findMany({ where: { testPackId: packLink.testPackId }, select: { name: true, description: true } }))
      : []

    const code = await ai.generateRunnableSpec(
      spec.markdownSpec,
      spec.url,
      null,
      [],
      liveContext,
      packVarNames
    )

    const { saveGeneratedCode } = require('../lib/packStorage')
    const settings = await prisma.appSettings.findFirst()
    const { codeStorage, codeFilePath, generatedCode } = await saveGeneratedCode(specId, code, settings)

    const needsValidate = ai.lastHallucinationWarning === true
    await prisma.agentTestSpec.update({
      where: { specId },
      data: { generatedCode, codeStorage, codeFilePath, status: needsValidate ? 'needs-validate' : 'ready' }
    })

    res.json({ specId: spec.specId, generatedCode: code, status: needsValidate ? 'needs-validate' : 'ready', hallucinationWarning: needsValidate })
  } catch (error) {
    console.error('Error generating code:', error)
    await prisma.agentTestSpec.update({ where: { specId }, data: { status: 'failed' } }).catch(() => {})
    res.status(500).json({ error: error.message || 'Failed to generate code' })
  }
}

/**
 * Run a single agent test spec
 */
exports.runSpec = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }
    if (spec.engine === 'selenium') {
      return res.status(410).json({ error: SELENIUM_RETIRED })
    }

    // Resolve active environment + pack variables for substitution
    const activeEnv = await prisma.testEnvironment.findFirst({ where: { isActive: true } })
    const packLink  = await prisma.testPackTest.findFirst({ where: { specId: req.params.specId } })
    const packVars  = packLink ? await resolvePackVariables(packLink.testPackId) : {}

    let envVars = {}
    if (activeEnv) {
      envVars.BASE_URL = activeEnv.baseUrl
      try { Object.assign(envVars, JSON.parse(activeEnv.variables || '{}')) } catch (_) {}
    }
    Object.assign(envVars, packVars) // pack variables override env vars

    // Terminal-generated specs have generatedCode and use the JS runner.
    // Legacy specs have only markdownSpec — use the step-by-step runner.
    const result = spec.generatedCode
        ? await agentTestRunner.runSpecByCode(req.params.specId, Object.keys(envVars).length ? envVars : null)
        : await agentTestRunner.runSpec(req.params.specId)

    // Update spec status and last run info
    // Use per-test step names so the AI heal knows exactly which test() block failed
    let failures = (result.steps || [])
      .filter(s => !s.success)
      .map(s => ({ step: s.action, error: s.error }))
    if (failures.length === 0 && result.status === 'failed') {
      failures = [{ step: spec.name, error: result.error }]
    }
    await prisma.agentTestSpec.update({
      where: { specId: spec.specId },
      data: {
        status: result.status === 'passed' ? 'passed' : 'failed',
        lastResultJson: stringifyJson({ status: result.status, failures, steps: result.steps || [], ranAt: new Date().toISOString(), failureAriaSnapshot: result.failureAriaSnapshot || null })
      }
    }).catch(() => {
      return prisma.agentTestSpec.update({
        where: { specId: spec.specId },
        data: { status: result.status === 'passed' ? 'passed' : 'failed' }
      })
    })

    await upsertBugReportForResult({
      specId: spec.id,
      packId: null,
      source: spec.isSynthetic ? 'synthetic' : 'manual',
      specName: spec.name,
      result
    })

    res.json(result)
  } catch (error) {
    console.error('Error running spec:', error)
    res.status(500).json({ error: 'Failed to run spec' })
  }
}

/**
 * Run all enabled agent test specs
 */
exports.runAllSpecs = async (req, res) => {
  try {
    // Fetch specs first so we can match results to UUIDs for bug reports
    const specs = await prisma.agentTestSpec.findMany({
      where: { enabled: true, status: { in: ['ready', 'passed', 'failed'] } }
    })

    const results = await agentTestRunner.runAllSpecs()

    // Create/update bug reports for each result
    for (const result of results) {
      const spec = specs.find(s => s.specId === result.specId)
      if (spec) {
        await upsertBugReportForResult({
          specId: spec.id,
          packId: null,
          source: spec.isSynthetic ? 'synthetic' : 'manual',
          specName: spec.name,
          result
        })
      }
    }

    res.json({
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    })
  } catch (error) {
    console.error('Error running all specs:', error)
    res.status(500).json({ error: 'Failed to run specs' })
  }
}

/**
 * Parse a markdown spec and return the parsed steps (preview)
 */
exports.parseSpec = async (req, res) => {
  try {
    const { markdownSpec } = req.body

    if (!markdownSpec) {
      return res.status(400).json({ error: 'markdownSpec is required' })
    }

    const steps = agentTestRunner.parseMarkdownSpec(markdownSpec)

    res.json({
      totalSteps: steps.length,
      steps
    })
  } catch (error) {
    console.error('Error parsing spec:', error)
    res.status(500).json({ error: 'Failed to parse spec' })
  }
}

/**
 * Parse a spec's generated code into a structured intent graph and store it.
 * POST /specs/:specId/extract-intent
 */
exports.extractIntent = async (req, res) => {
  try {
    const { specId } = req.params
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec) return res.status(404).json({ success: false, message: 'Spec not found' })

    const code = await resolvePackCode(spec)
    if (!code) return res.status(400).json({ success: false, message: 'Spec has no generated code to parse' })

    // Quick scan first (free, no AI)
    const meta = specParserService.quickScan(code)

    // Full intent extraction via Claude
    const intent = await specParserService.parseSpec(code)

    await prisma.agentTestSpec.update({
      where: { specId },
      data: { intentJson: JSON.stringify(intent) }
    })

    res.json({ success: true, intent, meta })
  } catch (error) {
    console.error('extractIntent error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Batch extract intent for all specs in a pack (or all specs if no packId).
 * POST /extract-intent-batch
 */
exports.extractIntentBatch = async (req, res) => {
  const { packId } = req.body

  try {
    let specs
    if (packId) {
      const pack = await prisma.testPack.findUnique({
        where: { packId },
        include: { tests: { include: { spec: true } } }
      })
      if (!pack) return res.status(404).json({ success: false, message: 'Pack not found' })
      specs = pack.tests.map(t => t.spec).filter(Boolean)
    } else {
      specs = await prisma.agentTestSpec.findMany({ where: { status: 'ready' } })
    }

    // Stream back results as newline-delimited JSON so the client can show progress
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Transfer-Encoding', 'chunked')

    let done = 0
    for (const spec of specs) {
      try {
        const code = await resolvePackCode(spec)
        if (!code) {
          res.write(JSON.stringify({ specId: spec.specId, status: 'skipped', reason: 'no code' }) + '\n')
          continue
        }
        const intent = await specParserService.parseSpec(code)
        await prisma.agentTestSpec.update({
          where: { specId: spec.specId },
          data: { intentJson: JSON.stringify(intent) }
        })
        res.write(JSON.stringify({ specId: spec.specId, status: 'done', stepCount: intent.steps.length }) + '\n')
      } catch (err) {
        res.write(JSON.stringify({ specId: spec.specId, status: 'error', reason: err.message }) + '\n')
      }
      done++
    }

    res.write(JSON.stringify({ status: 'complete', total: specs.length, processed: done }) + '\n')
    res.end()
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * Get example spec templates
 */
exports.getTemplates = async (req, res) => {
  const templates = [
    // ── Functional: Login ────────────────────────────────────────────
    {
      id: 'func-login',
      type: 'functional',
      name: 'Simple Login',
      description: 'Basic login flow',
      markdownSpec: `## Login Test

- Navigate to {URL}/login
- Fill "test@example.com" in the email field
- Fill "password123" in the password field
- Click the "Sign In" button
- Verify "Dashboard" is visible`
    },
    {
      id: 'func-login-logout',
      type: 'functional',
      name: 'Login & Logout Journey',
      description: 'Complete login to logout user flow',
      markdownSpec: `## Login and Logout Journey

### Login
- Navigate to {URL}/login
- Fill "test@example.com" in the email field
- Fill "password123" in the password field
- Click the "Sign In" button
- Verify "Dashboard" is visible

### Browse Site
- Click the "Profile" link
- Verify profile page loads
- Click the "Settings" link
- Verify settings page loads

### Logout
- Click the "Logout" button
- Verify "Sign In" is visible`
    },
    // ── Functional: General Browse ───────────────────────────────────
    {
      id: 'func-browse',
      type: 'functional',
      name: 'General Browse',
      description: 'Navigate and verify key pages load correctly',
      markdownSpec: `## General Browse Test

### Home Page
- Navigate to {URL}
- Verify page title is visible
- Verify main navigation is present

### Key Pages
- Click the first navigation link
- Verify page loads without errors
- Go back to home

- Click the second navigation link
- Verify page loads without errors
- Go back to home

### Basic Content Check
- Verify no error messages are visible
- Verify page footer is visible`
    },
    // ── Functional: E2E Flow ─────────────────────────────────────────
    {
      id: 'func-e2e-flow',
      type: 'functional',
      name: 'End-to-End Flow',
      description: 'Full user workflow from start to completion',
      markdownSpec: `## End-to-End User Flow

### Authentication
- Navigate to {URL}/login
- Fill "test@example.com" in the email field
- Fill "password123" in the password field
- Click the "Sign In" button
- Verify "Dashboard" is visible

### Core Workflow
- Navigate to the main feature page
- Create or initiate a new item
- Fill in required fields with test data
- Submit or save the form
- Verify success message or confirmation is visible

### Verification
- Verify the new item appears in the list
- Open the item to confirm details are correct

### Cleanup
- Delete or archive the test item
- Verify item is no longer visible
- Click the "Logout" button
- Verify "Sign In" is visible`
    },
    // ── Functional: Targeted Journey ─────────────────────────────────
    {
      id: 'func-targeted-journey',
      type: 'functional',
      name: 'Targeted Journey',
      description: 'Focused test of a specific user journey — use Probe first for best results',
      markdownSpec: `## Targeted Journey Test

URL: {URL}

Test the page at {URL} based on what is actually visible there.

- Navigate to {URL} and verify it loads successfully
- Verify the main heading (h1) is visible
- Verify the navigation is present
- Test the primary call-to-action button or link that is most prominent on the page
- Verify at least one internal navigation link works (click it, verify URL changes, go back)
- Verify the footer is present
- Verify no error messages are shown`
    },
    // ── API ──────────────────────────────────────────────────────────
    {
      id: 'api-health',
      type: 'api',
      name: 'Health Check',
      description: 'Simple API health check',
      markdownSpec: `## API Health Check

- Send GET request to {URL}
- Expect status code 200`
    },
    {
      id: 'api-post',
      type: 'api',
      name: 'POST Create',
      description: 'Test a POST endpoint',
      markdownSpec: `## POST Create Test

- Send POST request to {URL}
- Expect status code 201
- Verify response contains "id"`
    }
  ]

  res.json(templates)
}

/**
 * Heal a failing spec by re-probing the page and regenerating with AI
 */
exports.healSpec = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }
    if (spec.engine === 'selenium') return res.status(410).json({ error: SELENIUM_RETIRED })

    if (spec.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed specs can be healed' })
    }

    // Check if AI is available
    const aiAvailable = await ai.checkAvailable()
    if (!aiAvailable) {
      // Fall back to basic heal if AI not available
      const result = await agentTestRunner.healSpec(req.params.specId)
      return res.json({
        healed: result.healed,
        generatedCode: result.generatedCode,
        message: result.message
      })
    }

    // Get failure context from last run
    const lastResult = parseJson(spec.lastResultJson, {})
    const failures = lastResult.failures || []

    // Re-probe the page to get a fresh ARIA snapshot.
    // Fall back to URL embedded in markdownSpec for imported specs that have url=''
    let probeUrl = spec.url || ''
    if (!probeUrl) {
      const m = (spec.markdownSpec || '').match(/\*\*URL:\*\*\s*(\S+)/)
      if (m && m[1] !== 'TBD' && m[1] !== 'null') probeUrl = m[1]
    }
    let liveContext = null
    if (probeUrl) {
      try {
        const snap = await pageProbeService.ariaSnapshot(probeUrl)
        liveContext = snap.context
      } catch (probeErr) {
        console.warn(`Probe failed during heal for ${probeUrl}: ${probeErr.message}`)
      }
    }

    // Regenerate with AI using fresh page context and failure info
    const healedCode = await ai.generateRunnableSpec(
          spec.markdownSpec,
          probeUrl || spec.url,
          null, // probeData
          failures, // pass failures so AI knows what to fix
          liveContext,
          spec.generatedCode // pass existing code as reference
        )

    const newHealCount = (spec.healCount || 0) + 1

    // Flag repeated heal loops as hallucination signal
    if (newHealCount >= 3) {
      require('../services/hallucinationService').capture({
        promptKey: 'heal_runnable_spec',
        failureType: 'heal_loop',
        aiOutput: healedCode,
        targetUrl: spec.url,
        healAttempts: newHealCount
      })
    }

    // Update spec with healed code
    await prisma.agentTestSpec.update({
      where: { specId: spec.specId },
      data: {
        generatedCode: healedCode,
        status: 'ready',
        healCount: newHealCount
      }
    })

    // Resolve any open bug reports — tag with healId so downstream RAG aggregation
    // (featureHealthService) can distinguish "healer rewrote the code" from a genuine
    // re-run pass, and count it as passed per the failure-reporting spec's healer rule.
    await prisma.bugReport.updateMany({
      where: { specId: spec.id, status: { in: ['open', 'in-progress'] } },
      data: { status: 'resolved', resolvedAt: new Date(), healId: `heal-${Date.now()}` }
    })

    res.json({
      healed: true,
      generatedCode: healedCode,
      message: 'Spec healed with AI using fresh page scan'
    })
  } catch (error) {
    console.error('Error healing spec:', error)
    res.status(500).json({ error: 'Failed to heal spec' })
  }
}

// ============================================
// Heal with SSE streaming
// ============================================
exports.healSpecStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(type, message, extra = {}) {
    res.write(`data: ${JSON.stringify({ type, message, ...extra })}\n\n`)
  }

  try {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: req.params.specId } })
    if (!spec) { send('error', 'Spec not found'); return res.end() }
    if (spec.engine === 'selenium') { send('error', SELENIUM_RETIRED); return res.end() }
    if (spec.status !== 'failed') { send('error', 'Only failed specs can be healed'); return res.end() }

    const aiAvailable = await ai.checkAvailable()
    if (!aiAvailable) { send('error', 'AI not available — check your API key in Settings'); return res.end() }

    const lastResult = parseJson(spec.lastResultJson, {})
    const failures = lastResult.failures || []
    if (failures.length > 0) {
      send('step', `${failures.length} failing test${failures.length > 1 ? 's' : ''} to fix:`)
      for (const f of failures) {
        send('error', `"${f.step}" — ${f.error || 'failed'}`)
      }
    }

    let probeUrl = spec.url || ''
    if (!probeUrl) {
      const m = (spec.markdownSpec || '').match(/\*\*URL:\*\*\s*(\S+)/)
      if (m && m[1] !== 'TBD' && m[1] !== 'null') probeUrl = m[1]
    }

    let liveContext = null

    // Use ARIA snapshot captured at the point of failure — more useful than re-probing the
    // start URL.
    if (lastResult.failureAriaSnapshot) {
      liveContext = lastResult.failureAriaSnapshot
      send('step', 'Using page snapshot captured at point of failure')
    } else if (probeUrl) {
      send('step', `Probing ${probeUrl}...`)
      try {
        const snap = await pageProbeService.ariaSnapshot(probeUrl)
        liveContext = snap.context
        send('step', 'Page probed — ARIA snapshot captured')
      } catch (probeErr) {
        send('warn', `Probe failed: ${probeErr.message} — healing from error context only`)
      }
    } else {
      send('warn', 'No URL set — healing from spec description only')
    }

    send('step', 'Sending to AI for regeneration...')
    const healedCode = await ai.generateRunnableSpec(
          spec.markdownSpec,
          probeUrl || spec.url,
          null,
          failures,
          liveContext,
          spec.generatedCode
        )

    const newHealCountStream = (spec.healCount || 0) + 1

    if (newHealCountStream >= 3) {
      require('../services/hallucinationService').capture({
        promptKey: 'heal_runnable_spec',
        failureType: 'heal_loop',
        aiOutput: healedCode,
        targetUrl: spec.url,
        healAttempts: newHealCountStream
      })
    }

    send('step', 'Saving healed code...')
    await prisma.agentTestSpec.update({
      where: { specId: spec.specId },
      data: { generatedCode: healedCode, status: 'ready', healCount: newHealCountStream }
    })

    await prisma.bugReport.updateMany({
      where: { specId: spec.id, status: { in: ['open', 'in-progress'] } },
      data: { status: 'resolved', resolvedAt: new Date(), healId: `heal-${Date.now()}` }
    }).catch(() => {})

    send('done', `Healed (attempt ${(spec.healCount || 0) + 1}) — run the test to verify`)
  } catch (error) {
    send('error', error.message || 'Failed to heal spec')
  } finally {
    res.end()
  }
}

// ============================================
// Refactor Spec (remove hardcoded runtime values)
// ============================================

exports.refactorSpecStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(type, message, extra = {}) {
    res.write(`data: ${JSON.stringify({ type, message, ...extra })}\n\n`)
  }

  try {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: req.params.specId } })
    if (!spec) { send('error', 'Spec not found'); return res.end() }

    const { resolvePackCode, saveGeneratedCode } = require('../lib/packStorage')
    const currentCode = await resolvePackCode(spec)
    if (!currentCode) { send('error', 'No generated code to refactor — generate code first'); return res.end() }

    const aiAvailable = await ai.checkAvailable()
    if (!aiAvailable) { send('error', 'AI not available — check your API key in Settings'); return res.end() }

    send('step', 'Scanning for hardcoded runtime values...')

    // Detect specific patterns server-side — reliable, doesn't depend on AI judgment
    const hardcodedCounts = [...currentCode.matchAll(/toHaveCount\s*\(\s*(\d+)/g)]
      .map(m => `toHaveCount(${m[1]})`)
    const nthChainedWithCount = currentCode.match(/\.nth\s*\(\s*\d+\s*\)/) &&
      currentCode.match(/toHaveCount/)
    const hasNthCount = !!nthChainedWithCount

    const findings = [
      ...hardcodedCounts,
      ...(hasNthCount ? ['.nth(n) chained with toHaveCount — nth() returns a single element, toHaveCount on it is meaningless'] : [])
    ]

    if (findings.length === 0) {
      send('done', 'No hardcoded runtime values found — spec is already resilient')
      return res.end()
    }

    send('step', `Found ${findings.length} issue(s): ${hardcodedCounts.join(', ')}${hasNthCount ? ', nth+count mismatch' : ''}`)

    // Give the AI an explicit list of what to fix so it cannot miss or skip them
    const systemPrompt = promptService.get('refactor_spec')
    const userMessage = `The following hardcoded runtime values were detected and MUST be fixed:\n${findings.map(f => `- ${f}`).join('\n')}\n\nCurrent spec:\n${currentCode}`
    const refactoredCode = await ai.complete(systemPrompt, userMessage, 4000, 'Refactor')

    const cleaned = refactoredCode
      .replace(/^```(?:javascript|js)?\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    if (!cleaned || cleaned.length < 50) {
      send('error', 'AI returned an empty response — try again')
      return res.end()
    }

    send('step', 'Saving refactored code...')
    const settings = await prisma.appSettings.findFirst()
    const saved = await saveGeneratedCode(spec.specId, cleaned, settings)
    await prisma.agentTestSpec.update({
      where: { specId: spec.specId },
      data: { generatedCode: saved.generatedCode, codeStorage: saved.codeStorage, codeFilePath: saved.codeFilePath, status: 'ready' }
    })

    send('done', 'Refactored — hardcoded values replaced with dynamic equivalents. Run the test to verify.')
  } catch (error) {
    send('error', error.message || 'Refactor failed')
  } finally {
    res.end()
  }
}

// ============================================
// Synthetic Monitoring Management
// ============================================

/**
 * Get all tests promoted to synthetic monitoring
 */
exports.getSynthetics = async (req, res) => {
  try {
    const synthetics = await prisma.agentTestSpec.findMany({
      where: { isSynthetic: true },
      include: {
        createdBy: true
      },
      orderBy: { promotedToSyntheticAt: 'desc' }
    })

    res.json(synthetics.map(transformAgentTestSpec))
  } catch (error) {
    console.error('Error fetching synthetics:', error)
    res.status(500).json({ error: 'Failed to fetch synthetics' })
  }
}

/**
 * Promote a functional test to synthetic monitoring
 */
// Monitors run in Continuum: tell it when a test is marked, unmarked or retimed.
// A failure here never fails the change in Aurora; the response says what happened.
async function syncMonitorQuietly (specId) {
  try {
    return await require('../services/continuumService').syncMonitor(specId)
  } catch (e) {
    return { synced: false, reason: e.message }
  }
}

exports.promoteToSynthetic = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }

    if (spec.status !== 'ready') {
      return res.status(400).json({ error: 'Only ready tests can be promoted to synthetic' })
    }

    const { schedule, alertThreshold } = req.body

    const updated = await prisma.agentTestSpec.update({
      where: { specId: req.params.specId },
      data: {
        isSynthetic: true,
        promotedToSyntheticAt: new Date(),
        schedule: schedule || spec.schedule,
        alertThreshold: alertThreshold || spec.alertThreshold
      }
    })

    res.json({
      message: 'Test promoted to synthetic monitoring',
      spec: transformAgentTestSpec(updated),
      continuum: await syncMonitorQuietly(updated.specId)
    })
  } catch (error) {
    console.error('Error promoting to synthetic:', error)
    res.status(500).json({ error: 'Failed to promote to synthetic' })
  }
}

/**
 * Demote a test from synthetic monitoring
 */
exports.demoteFromSynthetic = async (req, res) => {
  try {
    const updated = await prisma.agentTestSpec.update({
      where: { specId: req.params.specId },
      data: {
        isSynthetic: false,
        promotedToSyntheticAt: null
      }
    })

    res.json({
      message: 'Test removed from synthetic monitoring',
      spec: transformAgentTestSpec(updated),
      continuum: await syncMonitorQuietly(updated.specId)
    })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Spec not found' })
    }
    console.error('Error demoting from synthetic:', error)
    res.status(500).json({ error: 'Failed to demote from synthetic' })
  }
}

/**
 * Update synthetic settings for a test
 */
exports.updateSyntheticSettings = async (req, res) => {
  try {
    const spec = await prisma.agentTestSpec.findUnique({
      where: { specId: req.params.specId }
    })

    if (!spec) {
      return res.status(404).json({ error: 'Spec not found' })
    }

    if (!spec.isSynthetic) {
      return res.status(400).json({ error: 'Test is not a synthetic' })
    }

    const { schedule, alertThreshold, enabled } = req.body
    const updateData = {}

    if (schedule !== undefined) updateData.schedule = schedule
    if (alertThreshold !== undefined) updateData.alertThreshold = alertThreshold
    if (enabled !== undefined) updateData.enabled = enabled

    const updated = await prisma.agentTestSpec.update({
      where: { specId: req.params.specId },
      data: updateData
    })

    res.json({
      message: 'Synthetic settings updated',
      spec: transformAgentTestSpec(updated),
      continuum: Object.keys(updateData).length ? await syncMonitorQuietly(updated.specId) : undefined
    })
  } catch (error) {
    console.error('Error updating synthetic settings:', error)
    res.status(500).json({ error: 'Failed to update synthetic settings' })
  }
}

// ============================================
// Test Pack Management
// ============================================

/**
 * Get all test packs
 */
exports.getReviewQueue = async (req, res) => {
  try {
    const packs = await prisma.testPack.findMany({
      include: {
        initiative: { select: { id: true, name: true } },
        feature: { select: { id: true, name: true } },
        tests: {
          include: { spec: true },
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const queue = packs
      .map(pack => {
        const specs = (pack.tests || [])
          .filter(Boolean)
          .map(t => ({
            specId: t.spec?.specId,
            name: t.spec?.name,
            status: t.spec?.status,
            url: t.spec?.url,
            testType: t.spec?.testType || 'functional',
            engine: t.spec?.engine || 'playwright',
            healCount: t.spec?.healCount || 0,
            hasCode: !!(t.spec?.generatedCode || t.spec?.codeFilePath),
            markdownSpec: t.spec?.markdownSpec || null,
            excluded: t.excluded || false
          }))
          .filter(s => s.specId)

        const passed = specs.filter(s => s.status === 'passed').length
        const failed = specs.filter(s => s.status === 'failed').length
        const draft  = specs.filter(s => s.status === 'draft' || s.status === 'ready').length

        return {
          packId: pack.id, packName: pack.name, specs, total: specs.length, passed, failed, draft,
          // Packs enforce a single engine across all member specs at add-time — see addTestsToPack.
          engine: specs[0]?.engine || null,
          initiativeId: pack.initiativeId || null,
          initiativeName: pack.initiative?.name || null,
          featureId: pack.featureId || null,
          featureName: pack.feature?.name || null
        }
      })
      .filter(p => p.total > 0)

    res.json(queue)
  } catch (error) {
    console.error('Error fetching review queue:', error)
    res.status(500).json({ error: 'Failed to fetch review queue' })
  }
}

exports.getPacks = async (req, res) => {
  try {
    const packs = await prisma.testPack.findMany({
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(packs.map(transformTestPack))
  } catch (error) {
    console.error('Error fetching test packs:', error)
    res.status(500).json({ error: 'Failed to fetch test packs' })
  }
}

/**
 * Create a new test pack
 */
exports.createPack = async (req, res) => {
  try {
    const { name, description, tests, schedule, teamId, initiativeId, featureId, packSetupCode, packTeardownCode } = req.body

    const pack = await prisma.testPack.create({
      data: {
        name,
        description: description || '',
        schedule,
        teamId,
        initiativeId: initiativeId || null,
        featureId: featureId || null,
        packSetupCode: packSetupCode || null,
        packTeardownCode: packTeardownCode || null,
        tests: tests && tests.length > 0 ? {
          create: tests.map(specId => ({ specId }))
        } : undefined
      },
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      }
    })

    res.status(201).json(transformTestPack(pack))
  } catch (error) {
    console.error('Error creating test pack:', error)
    res.status(500).json({ error: 'Failed to create test pack' })
  }
}

/**
 * Get a single test pack by ID
 */
exports.getPackById = async (req, res) => {
  try {
    const pack = await prisma.testPack.findUnique({
      where: { id: req.params.packId },
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      }
    })

    if (!pack) {
      return res.status(404).json({ error: 'Test pack not found' })
    }

    res.json(transformTestPack(pack))
  } catch (error) {
    console.error('Error fetching test pack:', error)
    res.status(500).json({ error: 'Failed to fetch test pack' })
  }
}

/**
 * Update a test pack
 */
exports.updatePack = async (req, res) => {
  try {
    const { name, description, schedule, isActive, initiativeId, featureId, packSetupCode, packTeardownCode } = req.body

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (schedule !== undefined) updateData.schedule = schedule
    if (isActive !== undefined) updateData.isActive = isActive
    if ('initiativeId' in req.body) updateData.initiativeId = initiativeId || null
    if ('featureId' in req.body) updateData.featureId = featureId || null
    if (packSetupCode !== undefined) updateData.packSetupCode = packSetupCode
    if (packTeardownCode !== undefined) updateData.packTeardownCode = packTeardownCode

    const pack = await prisma.testPack.update({
      where: { id: req.params.packId },
      data: updateData,
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      }
    })

    res.json(transformTestPack(pack))
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Test pack not found' })
    }
    console.error('Error updating test pack:', error)
    res.status(500).json({ error: 'Failed to update test pack' })
  }
}

/**
 * Delete a test pack
 */
exports.deletePack = async (req, res) => {
  try {
    // Collect specIds before deleting so we can clean up orphans
    const packTests = await prisma.testPackTest.findMany({
      where: { testPackId: req.params.packId },
      select: { specId: true }
    })
    const specIds = packTests.map(t => t.specId)

    await prisma.testPack.delete({
      where: { id: req.params.packId }
    })

    // Delete specs that are no longer in any pack
    if (specIds.length > 0) {
      await prisma.agentTestSpec.deleteMany({
        where: {
          specId: { in: specIds },
          testPacks: { none: {} }
        }
      })
    }

    res.json({ message: 'Test pack deleted successfully' })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Test pack not found' })
    }
    console.error('Error deleting test pack:', error)
    res.status(500).json({ error: 'Failed to delete test pack' })
  }
}

/**
 * Add tests to a pack
 */
exports.addTestsToPack = async (req, res) => {
  try {
    const { testIds } = req.body

    if (!testIds || !Array.isArray(testIds)) {
      return res.status(400).json({ error: 'testIds array is required' })
    }

    // Get existing tests in pack
    const existingTests = await prisma.testPackTest.findMany({
      where: { testPackId: req.params.packId },
      include: { spec: true }
    })
    const existingSpecIds = existingTests.map(t => t.specId)

    // Add only new tests
    const newTestIds = testIds.filter(id => !existingSpecIds.includes(id))

    if (newTestIds.length > 0) {
      // Enforce engine-homogeneity within a pack — runPackAsFile launches one Playwright
      // browser shared across every spec in the pack, so legacy Selenium specs can't join.
      const packEngine = existingTests[0]?.spec?.engine || null
      const newSpecs = await prisma.agentTestSpec.findMany({
        where: { specId: { in: newTestIds } },
        select: { specId: true, name: true, engine: true }
      })
      const referenceEngine = packEngine || newSpecs[0]?.engine || 'playwright'
      const mismatched = newSpecs.filter(s => s.engine !== referenceEngine)
      if (mismatched.length > 0) {
        return res.status(400).json({
          error: `This pack only supports "${referenceEngine}"-engine specs. Cannot add: ${mismatched.map(s => s.name).join(', ')}`
        })
      }

      await prisma.testPackTest.createMany({
        data: newTestIds.map(specId => ({
          testPackId: req.params.packId,
          specId
        }))
      })
    }

    const pack = await prisma.testPack.findUnique({
      where: { id: req.params.packId },
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      }
    })

    res.json(transformTestPack(pack))
  } catch (error) {
    console.error('Error adding tests to pack:', error)
    res.status(500).json({ error: 'Failed to add tests to pack' })
  }
}

/**
 * Remove tests from a pack
 */
exports.removeTestsFromPack = async (req, res) => {
  try {
    const { testIds } = req.body

    if (!testIds || !Array.isArray(testIds)) {
      return res.status(400).json({ error: 'testIds array is required' })
    }

    await prisma.testPackTest.deleteMany({
      where: {
        testPackId: req.params.packId,
        specId: { in: testIds }
      }
    })

    // Delete specs that are no longer in any pack
    await prisma.agentTestSpec.deleteMany({
      where: {
        specId: { in: testIds },
        testPacks: { none: {} }
      }
    })

    const pack = await prisma.testPack.findUnique({
      where: { id: req.params.packId },
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: {
            spec: true
          }
        }
      }
    })

    res.json(transformTestPack(pack))
  } catch (error) {
    console.error('Error removing tests from pack:', error)
    res.status(500).json({ error: 'Failed to remove tests from pack' })
  }
}

/**
 * Run all tests in a pack as a single Playwright file
 */
exports.runPack = async (req, res) => {
  try {
    const pack = await prisma.testPack.findUnique({
      where: { id: req.params.packId },
      include: {
        initiative: true,
        feature: { include: { initiative: true } },
        team: true,
        tests: {
          include: { spec: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    if (!pack) {
      return res.status(404).json({ error: 'Test pack not found' })
    }

    if (!pack.tests || pack.tests.length === 0) {
      return res.status(400).json({ error: 'Test pack has no tests' })
    }

    const settings = await prisma.appSettings.findFirst()
    const packsRootDir = settings?.packsRootDir || null

    // Resolve active environment for variable substitution
    const envId = req.body?.environmentId
    const activeEnv = envId
      ? await prisma.testEnvironment.findUnique({ where: { id: envId } })
      : await prisma.testEnvironment.findFirst({ where: { isActive: true } })

    // Resolve pack variables (take precedence over environment vars)
    const packVars = await resolvePackVariables(pack.id)

    function applyEnvVars(text) {
      if (!text) return text
      const vars = {}
      if (activeEnv) {
        vars.BASE_URL = activeEnv.baseUrl
        try { Object.assign(vars, JSON.parse(activeEnv.variables || '{}')) } catch (_) {}
      }
      // Pack variables override environment variables
      Object.assign(vars, packVars)
      return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{{${key}}}`)
    }

    // Include specs with inline code OR a file-backed path; skip excluded tests
    const candidateSpecs = pack.tests
      .filter(t => !t.excluded)
      .map(t => t.spec)
      .filter(s => s && (s.generatedCode || s.codeFilePath))
    if (candidateSpecs.length === 0) {
      return res.status(400).json({ error: 'No specs have generated code. Run generate on each spec first.' })
    }

    const specsWithCode = (await Promise.all(
      candidateSpecs.map(async s => {
        const code = await resolvePackCode(s, packsRootDir)
        if (!code) return null
        return {
          ...s,
          url: applyEnvVars(s.url),
          generatedCode: applyEnvVars(code)
        }
      })
    )).filter(Boolean)

    if (specsWithCode.length === 0) {
      return res.status(400).json({ error: 'No specs have readable code. Check Pack Storage settings.' })
    }

    // Resolve test data for data-driven execution
    const testDataService = require('../services/testDataService')
    const csvData = await testDataService.getDataForPack(pack).catch(() => null)
    const dataContext = {
      mode: csvData ? (pack.testDataMode || 'none') : 'none',
      rows: csvData?.rows || [],
      headers: csvData?.headers || [],
      csvAbsPath: pack.testDataFileId
        ? testDataService.resolveLocalDataFilePath(pack.testDataFileId)
        : null
    }

    const startTime = Date.now()
    const results = await agentTestRunner.runPackAsFile(pack, specsWithCode, dataContext)
    const duration = Date.now() - startTime

    for (const result of results) {
      const spec = specsWithCode.find(s => s.specId === result.specId)
      if (spec) {
        await upsertBugReportForResult({
          specId: spec.id,
          packId: pack.id,
          source: 'pack',
          specName: spec.name,
          result
        })

        // Update spec status and persist failure details so Heal has context
        // Use per-test step names so AI knows exactly which test() block to fix
        let failures = (result.steps || [])
          .filter(s => !s.success)
          .map(s => ({ step: s.action, error: s.error }))
        if (failures.length === 0 && result.status === 'failed') {
          failures = [{ step: spec.name, error: result.error }]
        }
        await prisma.agentTestSpec.update({
          where: { specId: spec.specId },
          data: {
            status: result.status === 'passed' ? 'passed' : 'failed',
            lastResultJson: stringifyJson({ status: result.status, failures, steps: result.steps || [], ranAt: new Date().toISOString() })
          }
        }).catch(e => {
          // Fallback: update just status if lastResultJson column doesn't exist yet
          console.warn('lastResultJson update failed, falling back to status-only:', e.message)
          return prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: { status: result.status === 'passed' ? 'passed' : 'failed' }
          })
        })

        // Write a TestResult row so dashboard graphs include pack runs
        await prisma.testResult.create({
          data: {
            testCaseId: spec.specId,
            testName: spec.name,
            testType: 'functional',
            suite: pack.name,
            status: result.status,
            duration: Math.round(duration / results.length),
            errorMessage: result.error || null,
            stackTrace: result.stackTrace || null,
            screenshot: result.evidenceDir ? `${result.evidenceDir}/screenshot.png` : null,
            evidenceDir: result.evidenceDir || null,
            environment: 'staging',
            teamId: pack.teamId || null,
            specId: spec.id  // FK to AgentTestSpec.id (UUID), not the string specId
          }
        })

        // Build report.html synchronously so the pack-run response has a working link
        // right away — mirrors the same hook in agentTestRunner.js's saveResult(), but
        // with pack/feature context available here that single-spec runs don't have.
        if (result.evidenceDir) {
          try {
            const evidenceReportService = require('../services/evidenceReportService')
            const evidenceStorage = require('../lib/evidenceStorage')
            const evidenceSettings = await prisma.appSettings.findFirst().catch(() => null)
            const bundleDir = evidenceStorage.resolveBundleDir(evidenceStorage.getEvidenceRoot(evidenceSettings), result.evidenceDir)
            await evidenceReportService.writeReportHtml(bundleDir, {
              testName: spec.name,
              featureName: pack.feature?.name || null,
              packName: pack.name,
              ranAt: new Date(),
              steps: result.steps || [],
              error: result.error,
              hasScreenshot: evidenceReportService.bundleHasFile(bundleDir, 'screenshot.png'),
              hasVideo: evidenceReportService.bundleHasFile(bundleDir, 'replay.webm'),
              hasTrace: evidenceReportService.bundleHasFile(bundleDir, 'trace.zip')
            })
          } catch (e) {
            console.error('[Evidence] Failed to write report.html:', e.message)
          }
        }
      }
    }

    const passed = results.filter(r => r.status === 'passed').length
    const failed = results.filter(r => r.status === 'failed').length

    await prisma.testPack.update({
      where: { id: pack.id },
      data: {
        lastRunAt: new Date(),
        lastRunResultsJson: stringifyJson({ total: results.length, passed, failed, duration })
      }
    })

    // Push to Continuum — feature name + initiative derived from feature (or legacy direct initiative)
    const continuumService = require('../services/continuumService')
    const firstUrl = specsWithCode[0]?.url || null
    const featureName = pack.feature?.name || null
    const initiativeName = pack.feature?.initiative?.name || pack.initiative?.name || null
    continuumService.pushResults({
      specName: featureName || pack.name,
      featureName,
      url: firstUrl,
      initiative: initiativeName,
      teamName: pack.team?.name || null,
      packName: pack.name,
      results: results.map(r => {
        const spec = specsWithCode.find(s => s.specId === r.specId)
        return { title: spec?.name || r.specId, ok: r.status === 'passed', error: r.error, testType: spec?.testType || 'functional' }
      })
    }).catch(err => {
      // Non-fatal for the run, but never silent: a failing push means Continuum is missing results.
      console.warn(`[Continuum] Result push for pack "${pack.name}" failed: ${err.response?.data?.message || err.message}`)
    })

    const perSpec = Math.round(duration / Math.max(results.length, 1))
    const resultsWithDuration = results.map(r => ({ ...r, duration: r.duration ?? perSpec }))
    res.json({ packId: pack.id, total: results.length, passed, failed, duration, results: resultsWithDuration })
  } catch (error) {
    console.error('Error running test pack:', error)
    res.status(500).json({ error: 'Failed to run test pack' })
  }
}

exports.generateSeedCode = async (req, res) => {
  try {
    const pack = await prisma.testPack.findUnique({ where: { id: req.params.packId } })
    if (!pack) return res.status(404).json({ error: 'Test pack not found' })

    const testDataService = require('../services/testDataService')
    const csvData = await testDataService.getDataForPack(pack)
    if (!csvData?.headers?.length) {
      return res.status(400).json({ error: 'No test data attached to this pack' })
    }

    const ai = require('../services/aiService')
    const firstUrl = req.body?.url || null
    const code = await ai.generateSeedCode(firstUrl, csvData.headers, csvData.rows.slice(0, 5))
    res.json({ success: true, code })
  } catch (error) {
    console.error('Error generating seed code:', error)
    res.status(500).json({ error: 'Failed to generate seed code' })
  }
}

/**
 * Reorder tests within a pack by updating sortOrder
 */
exports.reorderPackTests = async (req, res) => {
  try {
    const { specIds } = req.body
    if (!Array.isArray(specIds)) {
      return res.status(400).json({ error: 'specIds array is required' })
    }

    // Resolve human-readable specIds → AgentTestSpec UUID primary keys
    const specs = await prisma.agentTestSpec.findMany({
      where: { specId: { in: specIds } },
      select: { id: true, specId: true }
    })

    const specIdToUuid = {}
    for (const s of specs) { specIdToUuid[s.specId] = s.id }

    await prisma.$transaction(
      specIds
        .filter(specId => specIdToUuid[specId])
        .map((specId, index) =>
          prisma.testPackTest.updateMany({
            where: { testPackId: req.params.packId, specId: specIdToUuid[specId] },
            data: { sortOrder: index }
          })
        )
    )

    res.json({ success: true })
  } catch (error) {
    console.error('Error reordering pack tests:', error)
    res.status(500).json({ error: 'Failed to reorder pack tests' })
  }
}

exports.setTestExcluded = async (req, res) => {
  try {
    const { packId, specId } = req.params
    const { excluded } = req.body
    if (typeof excluded !== 'boolean') return res.status(400).json({ error: 'excluded must be a boolean' })

    const result = await prisma.testPackTest.updateMany({
      where: { testPackId: packId, specId },
      data: { excluded }
    })

    if (result.count === 0) return res.status(404).json({ error: 'Test not found in this pack' })
    res.json({ excluded })
  } catch (error) {
    console.error('Error updating test exclusion:', error)
    res.status(500).json({ error: 'Failed to update exclusion status' })
  }
}

/**
 * AI-generate a composite Playwright file for a test pack
 * Stores the result in pack.contextJson.generatedPackCode
 */
exports.generatePackCode = async (req, res) => {
  try {
    const pack = await prisma.testPack.findUnique({
      where: { id: req.params.packId },
      include: {
        tests: {
          include: { spec: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    })

    if (!pack) {
      return res.status(404).json({ error: 'Test pack not found' })
    }

    const specs = pack.tests.map(t => t.spec).filter(Boolean)
    if (specs.length === 0) {
      return res.status(400).json({ error: 'Test pack has no specs' })
    }

    const ai = require('../services/aiService')
    if (!ai.isAvailable()) {
      return res.status(503).json({ error: 'AI service not configured' })
    }

    const code = await ai.generatePackCode(pack, specs)
    const contextJson = stringifyJson({ generatedPackCode: code })

    await prisma.testPack.update({
      where: { id: pack.id },
      data: { contextJson }
    })

    res.json({ packId: pack.id, generatedPackCode: code })
  } catch (error) {
    console.error('Error generating pack code:', error)
    res.status(500).json({ error: 'Failed to generate pack code' })
  }
}

// ============================================
// API Discovery
// ============================================

const apiDiscoveryService = require('../services/apiDiscoveryService')

/**
 * Discover API endpoints for a domain
 */
exports.discoverAPIs = async (req, res) => {
  try {
    const { url, options } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL is required' })
    }

    const results = await apiDiscoveryService.discoverAPIs(url, options || {})

    res.json(results)
  } catch (error) {
    console.error('Error discovering APIs:', error)
    res.status(500).json({ error: 'Failed to discover APIs', message: error.message })
  }
}

/**
 * Quick API discovery - just probe most common endpoints
 */
exports.quickDiscoverAPIs = async (req, res) => {
  try {
    const { url, headers } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL is required' })
    }

    const results = await apiDiscoveryService.quickScan(url, headers || {})

    res.json(results)
  } catch (error) {
    console.error('Error in quick API discovery:', error)
    res.status(500).json({ error: 'Failed to discover APIs', message: error.message })
  }
}

/**
 * Recursively scan a directory for *.spec.js files and register each as a
 * file-backed AgentTestSpec.  If the directory also contains a fixtures.js
 * file, its path is stored on each registered spec so the pack runner can
 * require it at execution time.
 */
exports.adoptDirectory = async (req, res) => {
  try {
    const { directoryPath } = req.body
    if (!directoryPath) {
      return res.status(400).json({ error: 'directoryPath is required' })
    }

    const settings = await prisma.appSettings.findFirst()
    const packsRoot = settings?.packsRootDir || DEFAULT_PACKS_ROOT

    // Check maxPackCount gate (count only file-backed specs)
    if (settings?.maxPackCount != null) {
      const existingCount = await prisma.agentTestSpec.count({ where: { codeStorage: 'file' } })
      if (existingCount >= settings.maxPackCount) {
        return res.status(403).json({
          error: `Pack limit reached (${settings.maxPackCount}). Upgrade your plan to register more packs.`
        })
      }
    }

    // Scan the directory for spec files
    let entries
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true })
    } catch {
      return res.status(400).json({ error: `Cannot read directory: ${directoryPath}` })
    }

    const specFiles = entries.filter(e => e.isFile() && e.name.endsWith('.spec.js')).map(e => e.name)
    const hasFixtures = entries.some(e => e.isFile() && e.name === 'fixtures.js')
    const fixturesAbsPath = hasFixtures ? path.join(directoryPath, 'fixtures.js') : null

    let registered = 0
    let skipped = 0

    for (const filename of specFiles) {
      const absSpecPath = path.join(directoryPath, filename)

      // Determine storage path: copy into packsRoot if outside it
      let relPath
      if (absSpecPath.startsWith(packsRoot)) {
        relPath = path.relative(packsRoot, absSpecPath)
      } else {
        const specId = `adopted-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
        relPath = `${specId}/${filename}`
        const destPath = path.join(packsRoot, relPath)
        await fs.mkdir(path.dirname(destPath), { recursive: true })
        await fs.copyFile(absSpecPath, destPath)
      }

      const specName = filename.replace(/\.spec\.js$/, '')
      const specId = `adopted-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`

      // Skip if a spec with this codeFilePath already exists
      const existing = await prisma.agentTestSpec.findFirst({ where: { codeFilePath: relPath } })
      if (existing) {
        skipped++
        continue
      }

      await prisma.agentTestSpec.create({
        data: {
          specId,
          name: specName,
          testType: 'api',
          url: '',
          markdownSpec: '# Adopted spec\n\nRegistered from external directory.',
          generatedCode: null,
          codeStorage: 'file',
          codeFilePath: relPath,
          fixturesFilePath: fixturesAbsPath,
          status: 'ready',
          enabled: true
        }
      })
      registered++
    }

    res.json({ registered, skipped, fixturesDetected: hasFixtures })
  } catch (error) {
    console.error('Error adopting directory:', error)
    res.status(500).json({ error: 'Failed to adopt directory' })
  }
}

/**
 * Check whether all file-backed specs can resolve their code files on disk.
 * Returns { healthy, missingFiles } — used by the frontend to show a banner.
 */
exports.storageHealth = async (req, res) => {
  try {
    const settings = await prisma.appSettings.findFirst()
    const packsRootDir = settings?.packsRootDir || null

    const fileSpecs = await prisma.agentTestSpec.findMany({
      where: { codeStorage: 'file' },
      select: { specId: true, name: true, codeFilePath: true }
    })

    const missingFiles = []
    for (const spec of fileSpecs) {
      const accessible = await isPackFileAccessible(spec, packsRootDir)
      if (!accessible) missingFiles.push({ specId: spec.specId, name: spec.name, codeFilePath: spec.codeFilePath })
    }

    res.json({ healthy: missingFiles.length === 0, missingFiles })
  } catch (error) {
    console.error('Error checking storage health:', error)
    res.status(500).json({ error: 'Failed to check storage health' })
  }
}

// ============================================
// PATCH /api/agent-tests/specs/:specId/code
// Save manually-edited Playwright code
// ============================================
exports.updateSpecCode = async (req, res) => {
  try {
    const { code } = req.body
    if (typeof code !== 'string') {
      return res.status(400).json({ error: 'code must be a string' })
    }

    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: req.params.specId } })
    if (!spec) return res.status(404).json({ error: 'Spec not found' })

    const { saveGeneratedCode } = require('../lib/packStorage')
    const settings = await prisma.appSettings.findFirst()
    const { codeStorage, codeFilePath, generatedCode } = await saveGeneratedCode(spec.specId, code, settings)

    await prisma.agentTestSpec.update({
      where: { specId: req.params.specId },
      data: { generatedCode, codeStorage, codeFilePath, status: 'ready' }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating spec code:', error)
    res.status(500).json({ error: 'Failed to update code' })
  }
}

// ============================================
// POST /api/agent-tests/specs/:specId/heal-step
// AI-fixes a single broken step, with fresh probe
// ============================================
exports.healStep = async (req, res) => {
  try {
    const { stepCode, errorMessage, fullCode } = req.body
    if (!stepCode) return res.status(400).json({ error: 'stepCode is required' })

    const spec = await prisma.agentTestSpec.findUnique({ where: { specId: req.params.specId } })
    if (!spec) return res.status(404).json({ error: 'Spec not found' })
    if (spec.engine === 'selenium') return res.status(410).json({ error: SELENIUM_RETIRED })

    const aiAvailable = await ai.checkAvailable()
    if (!aiAvailable) return res.status(503).json({ error: 'AI provider not configured' })

    // Use spec.url or extract from markdownSpec (handles imported specs with empty url)
    let url = spec.url || ''
    if (!url) {
      const m = (spec.markdownSpec || '').match(/\*\*URL:\*\*\s*(\S+)/)
      if (m && m[1] !== 'TBD' && m[1] !== 'null') url = m[1]
    }

    let liveContext = null
    if (url) {
      try {
        const snap = await pageProbeService.ariaSnapshot(url)
        liveContext = snap.context
      } catch (e) {
        console.warn(`Step heal probe failed for ${url}: ${e.message}`)
      }
    }

    const fixedStep = await ai.healStep(
          stepCode,
          errorMessage || '',
          url,
          liveContext,
          fullCode || spec.generatedCode || ''
        )

    res.json({ fixedStep })
  } catch (error) {
    console.error('Error healing step:', error)
    res.status(500).json({ error: 'Failed to heal step' })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pack Variables — encrypted per-pack credentials/secrets
// ─────────────────────────────────────────────────────────────────────────────

async function getEncryptionKey() {
  let settings = await prisma.appSettings.findFirst()
  if (!settings) throw new Error('App not set up')
  if (!settings.encryptionKey) {
    const key = generateKey()
    settings = await prisma.appSettings.update({
      where: { id: settings.id },
      data: { encryptionKey: key }
    })
  }
  return settings.encryptionKey
}

function maskVariable(v) {
  return {
    id: v.id,
    name: v.name,
    value: v.sensitive ? null : v.value,
    sensitive: v.sensitive,
    description: v.description,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt
  }
}

exports.getPackVariables = async (req, res) => {
  try {
    const vars = await prisma.packVariable.findMany({
      where: { testPackId: req.params.packId },
      orderBy: { name: 'asc' }
    })
    res.json(vars.map(maskVariable))
  } catch (error) {
    console.error('Error fetching pack variables:', error)
    res.status(500).json({ error: 'Failed to fetch pack variables' })
  }
}

exports.createPackVariable = async (req, res) => {
  try {
    const { name, value, sensitive = false, description = '' } = req.body
    if (!name || !value) return res.status(400).json({ error: 'name and value are required' })
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      return res.status(400).json({ error: 'Variable name must be uppercase letters, numbers and underscores (e.g. CONTINUUM_HOST)' })
    }

    const key = await getEncryptionKey()
    const storedValue = sensitive ? encrypt(value, key) : value

    const variable = await prisma.packVariable.create({
      data: { testPackId: req.params.packId, name, value: storedValue, sensitive, description }
    })
    res.status(201).json(maskVariable(variable))
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: `Variable "${req.body.name}" already exists in this pack` })
    console.error('Error creating pack variable:', error)
    res.status(500).json({ error: 'Failed to create pack variable' })
  }
}

exports.updatePackVariable = async (req, res) => {
  try {
    const { value, sensitive, description } = req.body
    const existing = await prisma.packVariable.findUnique({ where: { id: req.params.varId } })
    if (!existing) return res.status(404).json({ error: 'Variable not found' })

    const isSensitive = sensitive !== undefined ? sensitive : existing.sensitive
    let storedValue = existing.value

    if (value !== undefined) {
      const key = await getEncryptionKey()
      storedValue = isSensitive ? encrypt(value, key) : value
    } else if (sensitive !== undefined && sensitive !== existing.sensitive) {
      // Sensitivity changed — re-encrypt or decrypt
      const key = await getEncryptionKey()
      const plaintext = existing.sensitive ? decrypt(existing.value, key) : existing.value
      storedValue = sensitive ? encrypt(plaintext, key) : plaintext
    }

    const updated = await prisma.packVariable.update({
      where: { id: req.params.varId },
      data: { value: storedValue, sensitive: isSensitive, description: description ?? existing.description }
    })
    res.json(maskVariable(updated))
  } catch (error) {
    console.error('Error updating pack variable:', error)
    res.status(500).json({ error: 'Failed to update pack variable' })
  }
}

exports.deletePackVariable = async (req, res) => {
  try {
    await prisma.packVariable.delete({ where: { id: req.params.varId } })
    res.json({ message: 'Variable deleted' })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Variable not found' })
    console.error('Error deleting pack variable:', error)
    res.status(500).json({ error: 'Failed to delete pack variable' })
  }
}

// Replace all literal occurrences of a variable's value with {{NAME}} across every spec in the pack
exports.replaceVariableInSpecs = async (req, res) => {
  try {
    const { packId, varId } = req.params
    const variable = await prisma.packVariable.findUnique({ where: { id: varId } })
    if (!variable) return res.status(404).json({ error: 'Variable not found' })

    const settings = await prisma.appSettings.findFirst()
    let value = variable.value
    if (variable.sensitive && settings?.encryptionKey) {
      const { decrypt } = require('../lib/encryption')
      try { value = decrypt(variable.value, settings.encryptionKey) } catch {
        return res.status(400).json({ error: 'Could not decrypt variable value — check encryption key' })
      }
    }
    if (!value) return res.status(400).json({ error: 'Variable has no value to replace' })
    value = value.trim()

    const placeholder = `{{${variable.name}}}`
    const packTests = await prisma.testPackTest.findMany({
      where: { testPackId: packId },
      include: { spec: true }
    })

    // Regex to match waitForURL regex literals and convert them to string form.
    // This handles the case where a URL appears as /http:\/\/host\/path/ in generated code.
    // Content pattern: any char that is not / or \, OR a backslash followed by any char.
    const waitForUrlRegexLiteral = new RegExp(
      'waitForURL\\(/((?:[^/\\\\]|\\\\[\\s\\S])*)/([gimsuy]*)',
      'g'
    )

    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    let specsUpdated = 0
    let totalReplacements = 0
    let alreadyPlaceholder = 0

    const { saveGeneratedCode } = require('../lib/packStorage')

    for (const pt of packTests) {
      const spec = pt.spec
      if (!spec) continue

      let code = spec.generatedCode || ''
      if (!code && spec.codeStorage === 'file' && spec.codeFilePath) {
        try { code = await fs.readFile(spec.codeFilePath, 'utf8') } catch { continue }
      }
      if (!code) continue

      // Check if the placeholder is already in this spec
      if (code.includes(placeholder)) { alreadyPlaceholder++; continue }

      // Pre-process: convert waitForURL(/regex/) → waitForURL('string') so the URL
      // is searchable without backslash-escape interference.
      const preprocessed = code.replace(waitForUrlRegexLiteral, (_, content, flags) => {
        const urlStr = content.replace(/\\\//g, '/').replace(/\\\./g, '.')
        return `waitForURL('${urlStr}'`
      })

      // Check for the literal value in either original or preprocessed form
      const target = preprocessed.includes(value) ? preprocessed : code
      if (!target.includes(value)) continue

      const updated = target.replace(new RegExp(escaped, 'g'), placeholder)
      const count = (target.match(new RegExp(escaped, 'g')) || []).length

      const saved = await saveGeneratedCode(spec.specId, updated, settings)
      await prisma.agentTestSpec.update({
        where: { specId: spec.specId },
        data: { generatedCode: saved.generatedCode, codeStorage: saved.codeStorage, codeFilePath: saved.codeFilePath }
      })

      specsUpdated++
      totalReplacements += count
    }

    res.json({ specsUpdated, totalReplacements, placeholder, alreadyPlaceholder })
  } catch (error) {
    console.error('Error replacing variable in specs:', error)
    res.status(500).json({ error: 'Failed to replace variable' })
  }
}

// Return placeholders referenced across all specs in a pack + which are configured
exports.getPackPlaceholders = async (req, res) => {
  try {
    const { packId } = req.params
    const packTests = await prisma.testPackTest.findMany({
      where: { testPackId: packId },
      include: { spec: { select: { generatedCode: true, codeStorage: true, codeFilePath: true } } }
    })
    const placeholderSet = new Set()
    for (const pt of packTests) {
      let code = pt.spec?.generatedCode || ''
      if (!code && pt.spec?.codeStorage === 'file' && pt.spec?.codeFilePath) {
        try { code = await fs.readFile(pt.spec.codeFilePath, 'utf8') } catch { /* skip */ }
      }
      for (const m of code.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)) placeholderSet.add(m[1])
    }
    const configured = await prisma.packVariable.findMany({
      where: { testPackId: packId },
      select: { name: true, sensitive: true }
    })
    const configuredNames = new Set(configured.map(v => v.name))
    const placeholders = [...placeholderSet].map(name => ({
      name,
      configured: configuredNames.has(name)
    }))
    const specsWithCode = packTests.filter(pt => pt.spec?.generatedCode || pt.spec?.codeFilePath).length
    res.json({ placeholders, variables: configured, specsTotal: packTests.length, specsWithCode })
  } catch (error) {
    console.error('Error fetching pack placeholders:', error)
    res.status(500).json({ error: 'Failed to fetch placeholders' })
  }
}

exports.scanPackVariables = async (req, res) => {
  try {
    const { packId } = req.params
    const packTests = await prisma.testPackTest.findMany({
      where: { testPackId: packId },
      include: { spec: { select: { generatedCode: true, codeStorage: true, codeFilePath: true } } }
    })

    const urlSet = new Set()
    const emailSet = new Set()
    let passwordDetected = false

    for (const pt of packTests) {
      let code = pt.spec?.generatedCode || ''
      if (!code && pt.spec?.codeStorage === 'file' && pt.spec?.codeFilePath) {
        try { code = await fs.readFile(pt.spec.codeFilePath, 'utf8') } catch { /* skip */ }
      }
      if (!code) continue

      // Hardcoded base URLs (scheme + host + optional port, inside quotes)
      for (const m of code.matchAll(/['"`](https?:\/\/[a-zA-Z0-9._-]+(?::\d+)?)(?:[/?#][^'"`]*)?['"`]/g)) {
        urlSet.add(m[1])
      }

      // Hardcoded email addresses inside quotes
      for (const m of code.matchAll(/['"`]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})['"`]/g)) {
        emailSet.add(m[1])
      }

      // Password field fills — any non-placeholder value in a fill on a password locator
      if (/(?:password|passwd|secret)['"` ]*\)?\.fill\(['"`][^{][^'"`]+['"`]\)/i.test(code) ||
          /\.fill\(['"`][a-zA-Z0-9_-]*['"`],\s*['"`][^{][^'"`]{4,}['"`]\)\s*(?:\/\/.*)?$/.test(code)) {
        passwordDetected = true
      }
    }

    const suggestions = []
    if (urlSet.size > 0) {
      const urls = [...urlSet]
      suggestions.push({ name: 'BASE_URL', example: urls[0], type: 'url', count: urls.length })
    }
    if (emailSet.size > 0) {
      const emails = [...emailSet]
      suggestions.push({ name: 'USERNAME', example: emails[0], type: 'email', count: emails.length })
    }
    if (passwordDetected) {
      suggestions.push({ name: 'PASSWORD', example: '', type: 'password', count: 1 })
    }

    res.json({ suggestions })
  } catch (error) {
    console.error('Error scanning pack variables:', error)
    res.status(500).json({ error: 'Failed to scan variables' })
  }
}

// Resolve pack variables to plaintext key→value map (for runner substitution)
async function resolvePackVariables(packId) {
  const vars = await prisma.packVariable.findMany({ where: { testPackId: packId } })
  if (!vars.length) return {}
  const key = await getEncryptionKey()
  const result = {}
  for (const v of vars) {
    try {
      result[v.name] = v.sensitive ? decrypt(v.value, key) : v.value
    } catch {
      result[v.name] = v.value // fallback if not actually encrypted
    }
  }
  return result
}

function substituteVariables(code, vars) {
  if (!code || !Object.keys(vars).length) return code
  let result = code
  for (const [name, value] of Object.entries(vars)) {
    result = result.split(`{{${name}}}`).join(value)
  }
  return result
}

exports.resolvePackVariables = resolvePackVariables
exports.substituteVariables  = substituteVariables

// POST /api/agent-tests/packs/:packId/validate-all
// Validate every spec in a pack sequentially in auto mode, auto-apply each one.
// Streams progress as SSE: pack-start, spec-start, step-start, step-result, screenshot, spec-complete, pack-complete, error
exports.validatePack = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(type, data = {}) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const { packId } = req.params
    const { headed = false } = req.body || {}

    const pack = await prisma.testPack.findUnique({ where: { id: packId }, include: { variables: true } })
    if (!pack) { send('error', { message: 'Pack not found' }); return res.end() }

    const packTests = await prisma.testPackTest.findMany({
      where: { testPackId: packId },
      orderBy: { sortOrder: 'asc' },
      include: { spec: true }
    })

    const specs = packTests.filter(pt => !pt.excluded).map(pt => pt.spec).filter(Boolean)
    send('pack-start', { packId, total: specs.length, packName: pack.name })

    // Resolve pack variables once
    const settings = await prisma.appSettings.findFirst()
    const encKey = settings?.encryptionKey
    const variables = {}
    for (const v of pack.variables || []) {
      try {
        const { decrypt } = require('../lib/encryption')
        variables[v.name] = v.sensitive && encKey ? decrypt(v.value, encKey) : v.value
      } catch {
        variables[v.name] = v.value
      }
    }

    const { runValidation } = require('../services/mcpAgentRunner')
    const { parseSpec }     = require('../services/specParserService')
    const { saveGeneratedCode, resolvePackCode } = require('../lib/packStorage')

    let passed = 0, failed = 0, skippedSpecs = 0

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      send('spec-start', { specIndex: i, specId: spec.specId, specName: spec.name, total: specs.length })

      try {
        const code = await resolvePackCode(spec)
        if (!code) {
          send('spec-complete', { specIndex: i, specId: spec.specId, specName: spec.name, status: 'skipped', reason: 'No generated code' })
          skippedSpecs++
          continue
        }

        let intentGraph = spec.intentJson ? JSON.parse(spec.intentJson) : null
        if (!intentGraph) {
          intentGraph = await parseSpec(code)
          await prisma.agentTestSpec.update({ where: { specId: spec.specId }, data: { intentJson: JSON.stringify(intentGraph) } })
        }

        const sessionId = `pack-val-${Date.now()}-${spec.specId.slice(-6)}`

        const specEmit = (type, data) => send(type, { specIndex: i, specId: spec.specId, sessionId, ...data })

        const result = await runValidation(spec.specId, intentGraph, {
          headed,
          variables,
          sessionId,
          autoMode: true
        }, specEmit)

        const summary = result.summary || {}
        const hasFail = (summary.fail || 0) > 0

        // Auto-apply validated code back to the spec
        if (result.validatedSpec) {
          const saved = await saveGeneratedCode(spec.specId, result.validatedSpec, settings)
          await prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: {
              generatedCode: saved.generatedCode,
              codeStorage:   saved.codeStorage,
              codeFilePath:  saved.codeFilePath,
              status: hasFail ? 'failed' : 'ready',
              healCount: 0
            }
          })
        }

        const status = hasFail ? 'partial' : 'validated'
        if (hasFail) failed++; else passed++
        send('spec-complete', {
          specIndex: i, specId: spec.specId, specName: spec.name,
          status, summary
        })
      } catch (err) {
        failed++
        send('spec-complete', {
          specIndex: i, specId: spec.specId, specName: spec.name,
          status: 'error', reason: err.message
        })
      }
    }

    send('pack-complete', { total: specs.length, passed, failed, skipped: skippedSpecs })
  } catch (err) {
    send('error', { message: err.message })
  } finally {
    res.end()
  }
}

// POST /api/agent-tests/specs/:specId/auto-validate
// Headless auto-validate a single spec immediately after generation. SSE stream.
// Resolves pack variables, runs in autoMode, auto-applies result.
exports.autoValidateSpec = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  function send(type, data = {}) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`)
  }

  try {
    const { specId } = req.params
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec) { send('error', { message: 'Spec not found' }); return res.end() }

    const { resolvePackCode, saveGeneratedCode } = require('../lib/packStorage')
    const code = await resolvePackCode(spec)
    if (!code) { send('error', { message: 'No generated code to validate' }); return res.end() }

    const { parseSpec } = require('../services/specParserService')
    let intentGraph = spec.intentJson ? JSON.parse(spec.intentJson) : null
    if (!intentGraph) {
      intentGraph = await parseSpec(code)
      await prisma.agentTestSpec.update({ where: { specId }, data: { intentJson: JSON.stringify(intentGraph) } })
    }

    // Load pack variables
    const variables = {}
    const packLink = await prisma.testPackTest.findFirst({ where: { specId }, include: { testPack: { include: { variables: true } } } })
    if (packLink?.testPack?.variables?.length) {
      const settings = await prisma.appSettings.findFirst()
      const { decrypt } = require('../lib/encryption')
      for (const v of packLink.testPack.variables) {
        try { variables[v.name] = v.sensitive && settings?.encryptionKey ? decrypt(v.value, settings.encryptionKey) : v.value } catch { variables[v.name] = v.value }
      }
    }

    const { runValidation } = require('../services/mcpAgentRunner')
    const sessionId = `auto-val-${Date.now()}-${specId.slice(-6)}`
    const result = await runValidation(specId, intentGraph, { headed: false, variables, sessionId, autoMode: true }, send)

    if (result.validatedSpec) {
      const settings = await prisma.appSettings.findFirst()
      const saved = await saveGeneratedCode(specId, result.validatedSpec, settings)
      const summary = result.summary || {}
      const hasFail = (summary.fail || 0) > 0
      await prisma.agentTestSpec.update({
        where: { specId },
        data: {
          generatedCode: saved.generatedCode,
          codeStorage:   saved.codeStorage,
          codeFilePath:  saved.codeFilePath,
          status: hasFail ? 'needs-validate' : 'ready',
          healCount: 0,
          validatedAt: hasFail ? null : new Date()
        }
      })
      send('auto-validate-complete', { specId, summary, status: hasFail ? 'needs-validate' : 'ready' })
    }
  } catch (err) {
    send('error', { message: err.message })
  } finally {
    res.end()
  }
}
