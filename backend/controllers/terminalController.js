// ============================================
// controllers/terminalController.js
// Updated for Prisma + SQLite
// ============================================
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')
const prisma = require('../lib/prisma')
const {
  parseJson,
  stringifyJson,
  transformAgentTerminalSession
} = require('../lib/helpers')
const ai = require('../services/aiService')
const streamingService = require('../services/streamingService')
const agentTestRunner = require('../services/agentTestRunner')
const pageProbeService = require('../services/pageProbeService')
const continuumService = require('../services/continuumService')
const playwrightShimRunner = require('../services/playwrightShimRunner')
const SELENIUM_RETIRED = 'Selenium specs are no longer supported. Regenerate this test with Playwright.'

// Sends a keep-alive log every intervalMs so the terminal doesn't look hung during long ops.
// Returns the interval id — caller must clearInterval() when the operation finishes.
function startHeartbeat(sessionId, message, intervalMs = 18000) {
  return setInterval(() => streamingService.log(sessionId, message), intervalMs)
}

function normalizeUrl(url) {
  if (!url) return url
  if (!/^https?:\/\//i.test(url)) return 'https://' + url
  return url
}

// Create new terminal session
exports.createSession = async (req, res) => {
  try {
    const sessionId = uuidv4()

    const session = await prisma.agentTerminalSession.create({
      data: {
        sessionId,
        status: 'idle',
        messagesJson: stringifyJson([{
          type: 'system',
          content: 'Session started. Type a command or use the action buttons.',
          timestamp: new Date().toISOString()
        }])
      }
    })

    res.json({
      success: true,
      sessionId,
      status: 'idle'
    })
  } catch (error) {
    console.error('Create session error:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
}

// Get session state
exports.getSession = async (req, res) => {
  try {
    const session = await prisma.agentTerminalSession.findUnique({
      where: { sessionId: req.params.sessionId }
    })

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({ success: true, session: transformAgentTerminalSession(session) })
  } catch (error) {
    console.error('Get session error:', error)
    res.status(500).json({ error: 'Failed to get session' })
  }
}

// Probe: Visit URL and extract page structure for AI context
exports.probe = async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  try {
    const normalized = normalizeUrl(url)
    const probeData = await pageProbeService.probe(normalized)
    res.json({ success: true, probeData })
  } catch (error) {
    console.error('Probe error:', error)
    res.status(500).json({ error: `Probe failed: ${error.message}` })
  }
}

// Plan: Generate test plan from prompt (optionally enriched with probe data)
exports.plan = async (req, res) => {
  const { sessionId, prompt, probeData } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' })
  }

  try {
    const session = await prisma.agentTerminalSession.findUnique({ where: { sessionId } })
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const messages = parseJson(session.messagesJson, [])
    messages.push({ type: 'user', content: prompt, timestamp: new Date().toISOString() })

    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: { status: 'planning', messagesJson: stringifyJson(messages) }
    })

    res.json({ success: true, status: 'planning' })
    streamingService.log(sessionId, 'Planning...')
    streamingService.status(sessionId, 'planning')

    const aiAvailable = await ai.checkAvailable()

    if (!aiAvailable) {
      const fallbackPlan = generateFallbackPlan(prompt)
      const currentPlan = {
        prompt, probeData: probeData || null,
        markdown: fallbackPlan,
        testCount: (fallbackPlan.match(/## Test/g) || []).length,
        createdAt: new Date().toISOString()
      }
      messages.push({ type: 'success', content: `Plan created (${currentPlan.testCount} test scenarios)`, timestamp: new Date().toISOString() })
      await prisma.agentTerminalSession.update({
        where: { sessionId },
        data: { status: 'plan_complete', currentPlanJson: stringifyJson(currentPlan), messagesJson: stringifyJson(messages) }
      })
      streamingService.success(sessionId, `Plan created (${currentPlan.testCount} test scenarios)`)
      streamingService.status(sessionId, 'plan_complete')
      streamingService.complete(sessionId, { plan: fallbackPlan })
      return
    }

    // Build prompt enriched with real page structure when probe data is available
    const enrichedPrompt = probeData
      ? `${prompt}\n\n--- Page structure (from live probe) ---\n${pageProbeService.formatForPrompt(probeData)}`
      : prompt

    let planContent = ''
    await ai.generatePlan(enrichedPrompt, (chunk) => { planContent += chunk })

    const testCount = (planContent.match(/## Test/gi) || []).length
    const currentPlan = {
      prompt, probeData: probeData || null,
      markdown: planContent, testCount,
      createdAt: new Date().toISOString()
    }

    messages.push({ type: 'success', content: `Plan created (${testCount} test scenarios)`, timestamp: new Date().toISOString() })
    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: { status: 'plan_complete', currentPlanJson: stringifyJson(currentPlan), messagesJson: stringifyJson(messages) }
    })

    streamingService.success(sessionId, `Plan created (${testCount} test scenarios)`)
    streamingService.status(sessionId, 'plan_complete')
    streamingService.complete(sessionId, { plan: planContent })

  } catch (error) {
    console.error('Plan error:', error)
    streamingService.error(req.body.sessionId, `Planning failed: ${error.message}`)
    streamingService.status(req.body.sessionId, 'failed')
  }
}

// Generate: Create TypeScript Playwright fixtures + POM + spec from plan
exports.generate = async (req, res) => {
  const { sessionId } = req.body
  const targetUrl = normalizeUrl(req.body.targetUrl)
  const engine = 'playwright'
  // Prefer explicit name from frontend; fall back to extracting "Test: <name>" line from context
  const resolveSpecName = (prompt, explicit) => {
    if (explicit && explicit.trim()) return explicit.trim().slice(0, 100)
    const m = prompt.match(/^Test:\s*(.+)$/m)
    if (m) return m[1].trim().slice(0, 100)
    return prompt.replace(/[\r\n]+/g, ' ').slice(0, 60)
  }

  try {
    const session = await prisma.agentTerminalSession.findUnique({ where: { sessionId } })
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const currentPlan = parseJson(session.currentPlanJson, {})
    if (!currentPlan.markdown) return res.status(400).json({ error: 'No plan available. Run plan first.' })

    await prisma.agentTerminalSession.update({ where: { sessionId }, data: { status: 'generating' } })
    res.json({ success: true, status: 'generating' })

    const probeData = currentPlan.probeData || null
    const url = targetUrl || probeData?.url || 'http://localhost:3000'
    const specName = resolveSpecName(currentPlan.prompt, req.body.specName)
    const specBaseName = specName.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const aiAvailable = await ai.checkAvailable()

    streamingService.status(sessionId, 'generating')

    // Capture the live ARIA snapshot so the AI writes locators from observed DOM, not guesses
    let liveContext = null
    const scanHeartbeat = startHeartbeat(sessionId, 'Scanning page — still working...')
    try {
      streamingService.log(sessionId, `Launching browser to scan ${url}...`)
      const snap = await pageProbeService.ariaSnapshot(url)
      liveContext = snap.context
      streamingService.log(sessionId, `Accessibility tree captured: ${snap.stats.interactive} interactive elements, ${snap.stats.links} links, ${snap.stats.forms} forms`)
    } catch (snapErr) {
      streamingService.log(sessionId, `Page scan failed (${snapErr.message}) — generating from plan only`)
    } finally {
      clearInterval(scanHeartbeat)
    }

    let pomFile = '', fixtureFile = '', specFile = '', runnableJs

    if (aiAvailable) {
      const genHeartbeat = startHeartbeat(sessionId, 'AI is writing code — still working...')
      try {
        streamingService.log(sessionId, 'Generating Page Object Model...')
        pomFile = await ai.generatePageObject(probeData, url, specBaseName, liveContext)

        streamingService.log(sessionId, 'Generating fixture file...')
        fixtureFile = await ai.generateFixture(probeData, url, specBaseName, liveContext)

        streamingService.log(sessionId, 'Generating TypeScript spec...')
        specFile = await ai.generateTypeScriptSpec(currentPlan.markdown, url, specBaseName, probeData, liveContext)

        streamingService.log(sessionId, 'Generating runnable spec...')
        runnableJs = await ai.generateRunnableSpec(currentPlan.markdown, url, probeData, [], liveContext)
      } finally {
        clearInterval(genHeartbeat)
      }
    } else {
      pomFile = generateFallbackPOM(url, specBaseName)
      fixtureFile = generateFallbackFixture(specBaseName)
      specFile = generateFallbackCode(currentPlan.markdown, url)
      runnableJs = generateFallbackCode(currentPlan.markdown, url)
    }

    const lineCount = (pomFile + fixtureFile + specFile).split('\n').length

    // Save spec file as the primary runnable AgentTestSpec
    const specId = `spec_${uuidv4().slice(0, 8)}`
    await prisma.agentTestSpec.create({
      data: {
        specId,
        name: specName,
        url,
        markdownSpec: currentPlan.markdown,
        generatedCode: runnableJs,
        engine,
        status: 'ready',
        generationMetaJson: stringifyJson({
          generatedAt: new Date().toISOString(),
          method: aiAvailable ? 'ai_playwright' : 'template',
          typescript: true,
          files: {
            pom: { filename: `pages/${toPascalCase(specBaseName)}Page.ts`, content: pomFile },
            fixture: { filename: `fixtures/${specBaseName}.fixture.ts`, content: fixtureFile },
            spec: { filename: `tests/${specBaseName}.spec.ts`, content: specFile }
          }
        })
      }
    })

    const generatedSpecs = [{ specId, name: specName, status: 'generated' }]

    const messages = parseJson(session.messagesJson, [])
    messages.push({ type: 'success', content: `3 TypeScript files generated (${lineCount} lines total)`, timestamp: new Date().toISOString() })

    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: { status: 'generate_complete', generatedSpecsJson: stringifyJson(generatedSpecs), messagesJson: stringifyJson(messages) }
    })

    streamingService.success(sessionId, `3 TypeScript files generated (${lineCount} lines total)`)
    streamingService.status(sessionId, 'generate_complete')
    streamingService.complete(sessionId, {
      specId,
      files: {
        pom: { filename: `pages/${toPascalCase(specBaseName)}Page.ts`, content: pomFile },
        fixture: { filename: `fixtures/${specBaseName}.fixture.ts`, content: fixtureFile },
        spec: { filename: `tests/${specBaseName}.spec.ts`, content: specFile }
      }
    })

  } catch (error) {
    console.error('Generate error:', error)
    streamingService.error(req.body.sessionId, `Generation failed: ${error.message}`)
    streamingService.status(req.body.sessionId, 'failed')
  }
}

function toPascalCase(str) {
  return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function generateFallbackPOM(url, name) {
  const className = toPascalCase(name) + 'Page'
  return `import { Page, Locator } from '@playwright/test'

export class ${className} {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('${url}')
    await this.page.waitForLoadState('networkidle')
  }
}
`
}

function generateFallbackFixture(name) {
  const className = toPascalCase(name) + 'Page'
  const fixtureName = name.replace(/-/g, '_')
  return `import { test as base } from '@playwright/test'
import { ${className} } from '../pages/${className}'

type Fixtures = { ${fixtureName}: ${className} }

export const test = base.extend<Fixtures>({
  ${fixtureName}: async ({ page }, use) => {
    const instance = new ${className}(page)
    await instance.goto()
    await use(instance)
  }
})

export { expect } from '@playwright/test'
`
}

// Run: Execute generated tests in-process via playwrightShimRunner (not the real Playwright CLI)
exports.run = async (req, res) => {
  const { sessionId } = req.body

  try {
    const session = await prisma.agentTerminalSession.findUnique({ where: { sessionId } })
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const generatedSpecs = parseJson(session.generatedSpecsJson, [])
    if (!generatedSpecs.length) return res.status(400).json({ error: 'No tests to run. Generate tests first.' })

    const specId = generatedSpecs[0].specId
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec?.generatedCode) return res.status(400).json({ error: 'No runnable code found. Generate tests first.' })
    if (spec.engine === 'selenium') return res.status(410).json({ error: SELENIUM_RETIRED })

    await prisma.agentTerminalSession.update({ where: { sessionId }, data: { status: 'running' } })
    res.json({ success: true, status: 'running' })

    streamingService.log(sessionId, 'Running tests...')
    streamingService.status(sessionId, 'running')

    await runPlaywrightSpec(sessionId, specId, spec, generatedSpecs, session)

  } catch (error) {
    console.error('Run error:', error)
    streamingService.error(req.body.sessionId, `Run failed: ${error.message}`)
    streamingService.status(req.body.sessionId, 'failed')
    streamingService.complete(req.body.sessionId, { passed: 0, failed: 0, failures: [] })
  }
}

async function runPlaywrightSpec(sessionId, specId, spec, generatedSpecs, session) {
  const { chromium } = require('playwright')
  const browserConfig = require('../tests/synthetic/config')

  const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || browserConfig.browser.executablePath || null
  let browser

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    })

    const results = await playwrightShimRunner.runGeneratedSpec(spec.generatedCode || '', browser, {
      onLog: (msg) => streamingService.log(sessionId, msg)
    })

    await browser.close()
    browser = null

    let passed = 0, failed = 0
    const failures = []
    for (const r of (results || [])) {
      if (r.ok) {
        passed++
        streamingService.success(sessionId, `${r.title}: passed`)
      } else {
        failed++
        const err = (r.error || 'failed').split('\n')[0]
        streamingService.error(sessionId, `${r.title}: failed — ${err}`)
        failures.push({ step: r.title, error: err })
      }
    }

    const lastRun = { totalTests: passed + failed, passed, failed, failures, completedAt: new Date().toISOString() }
    generatedSpecs[0].status = failed > 0 ? 'failed' : 'passed'
    const messages = parseJson(session.messagesJson, [])
    messages.push({
      type: failed > 0 ? 'error' : 'success',
      content: failed > 0 ? `${failed} test(s) failed` : `All ${passed} tests passed`,
      timestamp: new Date().toISOString()
    })

    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: { status: 'run_complete', lastRunJson: stringifyJson(lastRun), generatedSpecsJson: stringifyJson(generatedSpecs), messagesJson: stringifyJson(messages) }
    })

    // Write TestResult rows BEFORE sending complete so debug messages arrive before buttons unlock
    let savedCount = 0
    let dbDebugMsg = null
    try {
      const dbSpec = await prisma.agentTestSpec.findUnique({ where: { specId } })
      if (!dbSpec) {
        dbDebugMsg = `[Debug] Spec "${specId}" not in DB — dashboard not updated`
      } else {
        for (const r of (results || [])) {
          await prisma.testResult.create({
            data: {
              testCaseId: specId,
              testName: r.title || dbSpec.name,
              testType: dbSpec.testType || 'functional',
              suite: dbSpec.name,
              status: r.ok ? 'passed' : 'failed',
              duration: 0,
              errorMessage: r.ok ? null : (r.error || null),
              environment: 'staging',
              specId: dbSpec.id
            }
          })
          savedCount++
        }
        dbDebugMsg = savedCount > 0
          ? `[Debug] ${savedCount} result(s) saved to Functional Tests dashboard`
          : `[Debug] 0 results saved — spec ran ${results.length} test(s) but produced no result entries`

        // Push to Continuum if configured — non-fatal
        if (savedCount > 0) {
          // A spec run on its own still traces back through the first pack it belongs to
          // that is linked to a feature, so the result lands under that feature in Continuum.
          const link = await prisma.testPackTest.findFirst({
            where: { specId, testPack: { featureId: { not: null } } },
            orderBy: { sortOrder: 'asc' },
            include: { testPack: { include: { team: true, feature: { include: { initiative: true } } } } }
          }).catch(() => null)
          const linkedPack = link?.testPack
          continuumService.pushResults({
            specName: dbSpec.name,
            url: dbSpec.url || '',
            results,
            environment: 'staging',
            testType: dbSpec.testType || 'functional',
            featureName: linkedPack?.feature?.name || null,
            initiative: linkedPack?.feature?.initiative?.name || null,
            teamName: linkedPack?.team?.name || null,
            packName: linkedPack?.name || null
          }).then(result => {
            if (result) streamingService.log(sessionId, `[Continuum] ${result.pushed} result(s) pushed to Continuum`)
          }).catch(err => {
            streamingService.log(sessionId, `[Continuum] Push failed: ${err.response?.data?.message || err.message}`)
          })
        }
      }
    } catch (dbError) {
      console.error('[TestResult] Failed to write results to DB:', dbError.message)
      dbDebugMsg = `[Debug] Dashboard save error: ${dbError.message}`
    }

    streamingService.log(sessionId, `Completed: ${passed} passed, ${failed} failed`)
    if (dbDebugMsg) streamingService.log(sessionId, dbDebugMsg)
    streamingService.status(sessionId, 'run_complete')
    streamingService.complete(sessionId, { passed, failed, failures })

  } catch (runError) {
    if (browser) { try { await browser.close() } catch {} }
    streamingService.error(sessionId, `Run failed: ${runError.message}`)
    streamingService.status(sessionId, 'failed')
    streamingService.complete(sessionId, { passed: 0, failed: 0, failures: [] })
    await prisma.agentTerminalSession.update({ where: { sessionId }, data: { status: 'failed' } })
  }
}

// Heal: Fix failing tests
exports.heal = async (req, res) => {
  const { sessionId } = req.body

  try {
    const session = await prisma.agentTerminalSession.findUnique({
      where: { sessionId }
    })

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const lastRun = parseJson(session.lastRunJson, {})

    if (lastRun.failed === 0) {
      return res.status(400).json({ error: 'No failures to heal' })
    }

    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: { status: 'healing' }
    })

    res.json({ success: true, status: 'healing' })

    streamingService.log(sessionId, 'Healing...')
    streamingService.status(sessionId, 'healing')

    const generatedSpecs = parseJson(session.generatedSpecsJson, [])
    const specId = generatedSpecs[0]?.specId

    if (!specId) {
      streamingService.error(sessionId, 'No test spec found')
      return
    }

    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    if (!spec) {
      streamingService.error(sessionId, 'Test spec not found')
      return
    }
    if (spec.engine === 'selenium') {
      streamingService.error(sessionId, SELENIUM_RETIRED)
      return
    }

    const currentPlan = parseJson(session.currentPlanJson, {})
    const failures = lastRun.failures || []
    const url = spec.url || currentPlan.probeData?.url || 'http://localhost:3000'

    // Re-scan the live page so the AI fixes selectors against the current ARIA tree.
    let liveContext = null
    const healScanHeartbeat = startHeartbeat(sessionId, 'Scanning page — still working...')
    try {
      streamingService.log(sessionId, `Launching browser to re-scan ${url}...`)
      const snap = await pageProbeService.ariaSnapshot(url)
      liveContext = snap.context
      streamingService.log(sessionId, `Accessibility tree refreshed: ${snap.stats.interactive} interactive elements, ${snap.stats.links} links, ${snap.stats.forms} forms`)
    } catch {
      streamingService.log(sessionId, 'Page scan failed — regenerating from original plan')
    } finally {
      clearInterval(healScanHeartbeat)
    }

    // Re-generate with failure context, fresh page structure, and current spec as base.
    const healGenHeartbeat = startHeartbeat(sessionId, 'AI is rewriting failing tests — still working...')
    streamingService.log(sessionId, `Fixing ${failures.length} failing test(s) — keeping ${(spec.generatedCode || '').split('try {').length - 1 - failures.length} passing test(s) unchanged...`)
    const healedCode = await ai.generateRunnableSpec(
          currentPlan.markdown || spec.markdownSpec,
          url,
          currentPlan.probeData || null,
          failures,
          liveContext,
          spec.generatedCode || null
        )
    clearInterval(healGenHeartbeat)

    const messages = parseJson(session.messagesJson, [])

    await prisma.agentTestSpec.update({
      where: { specId },
      data: { generatedCode: healedCode }
    })

    generatedSpecs[0].status = 'healed'
    messages.push({
      type: 'success',
      content: 'Spec regenerated — re-running tests...',
      timestamp: new Date().toISOString()
    })

    await prisma.agentTerminalSession.update({
      where: { sessionId },
      data: {
        status: 'heal_complete',
        generatedSpecsJson: stringifyJson(generatedSpecs),
        messagesJson: stringifyJson(messages)
      }
    })

    streamingService.success(sessionId, 'Spec healed — re-running tests...')
    streamingService.status(sessionId, 'heal_complete')

    const healedSpec = await prisma.agentTestSpec.findUnique({ where: { specId } })
    await runPlaywrightSpec(sessionId, specId, healedSpec, generatedSpecs, session)

  } catch (error) {
    console.error('Heal error:', error)
    streamingService.error(req.body.sessionId, `Healing failed: ${error.message}`)
  }
}

// Fallback plan generation (without AI)
function generateFallbackPlan(prompt) {
  const keywords = prompt.toLowerCase()

  let plan = `# Test Plan: ${prompt}\n\n`

  if (keywords.includes('login') || keywords.includes('auth')) {
    plan += `## Test 1: Successful Login
- Navigate to login page
- Fill valid email in email field
- Fill valid password in password field
- Click login button
- Verify dashboard is visible

## Test 2: Invalid Login
- Navigate to login page
- Fill invalid email in email field
- Fill invalid password in password field
- Click login button
- Verify error message is shown
`
  } else if (keywords.includes('checkout') || keywords.includes('cart')) {
    plan += `## Test 1: Add to Cart
- Navigate to products page
- Click first product
- Click add to cart button
- Verify cart count increases

## Test 2: Checkout Flow
- Navigate to cart
- Click checkout button
- Fill shipping details
- Click place order
- Verify order confirmation
`
  } else {
    plan += `## Test 1: Page Load
- Navigate to home page
- Verify page title is correct
- Verify main content is visible

## Test 2: Navigation
- Navigate to home page
- Click navigation link
- Verify new page loads correctly
`
  }

  return plan
}

// Fallback code generation (without AI)
function generateFallbackCode(planMarkdown, targetUrl) {
  const url = targetUrl || 'http://localhost:3000'
  return `module.exports = async function runTests(browser, report) {
  const results = [];
  const page = await browser.newPage();
  try {

    // --- Test 1: Page Load ---
    try {
      report('Running: Page Load');
      await page.goto('${url}', { waitUntil: 'networkidle' });
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      results.push({ title: 'Page Load', ok: true });
    } catch (e) {
      results.push({ title: 'Page Load', ok: false, error: e.message.split('\\n')[0] });
    }

    // --- Test 2: Navigation visible ---
    try {
      report('Running: Navigation visible');
      await page.locator('nav, [role="navigation"]').first().waitFor({ state: 'visible', timeout: 10000 });
      results.push({ title: 'Navigation visible', ok: true });
    } catch (e) {
      results.push({ title: 'Navigation visible', ok: false, error: e.message.split('\\n')[0] });
    }

  } finally {
    await page.close();
  }
  return results;
};
`
}
