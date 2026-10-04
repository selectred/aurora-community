// ============================================
// controllers/testCaseImportController.js
// CSV Test Cases Import Engine
// ============================================
const prisma = require('../lib/prisma')
const { parseCSV } = require('../services/testDataService')
const { stringifyJson } = require('../lib/helpers')
const ai = require('../services/aiService')
const pageProbeService = require('../services/pageProbeService')

/**
 * Build a markdown spec from a CSV row using the provided column mappings
 */
function buildMarkdownSpec(row, mappings, defaultUrl) {
  const testName = (row[mappings.testCase] || 'Untitled Test').trim()
  const stepsRaw = row[mappings.testSteps] || ''
  const expectedRaw = row[mappings.expectedResults] || ''
  const url = row[mappings.url] || defaultUrl || ''

  // Parse steps - handle numbered lists, bullet points, or newline-separated
  const steps = stepsRaw
    .split(/\n|(?:\d+\.\s+)|(?:•\s*)/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => `- ${s}`)
    .join('\n')

  // Parse expected results similarly
  const expected = expectedRaw
    .split(/\n|(?:\d+\.\s+)|(?:•\s*)/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => `- Verify: ${s}`)
    .join('\n')

  return `## ${testName}

**URL:** ${url || 'TBD'}

### Test Steps
${steps || '- (No steps provided)'}

### Expected Results
${expected || '- (No expected results provided)'}
`
}

/**
 * Auto-suggest column mappings based on common naming patterns
 */
function suggestMappings(headers) {
  const lower = headers.map(h => h.toLowerCase())

  return {
    testPack: headers.find((h, i) => /pack|suite|group|module|category/i.test(lower[i])) || null,
    testCase: headers.find((h, i) => /^test.*name|^name|title|^test$|test.*case|scenario/i.test(lower[i])) || null,
    testSteps: headers.find((h, i) => /step|action|procedure|instruction/i.test(lower[i])) || null,
    expectedResults: headers.find((h, i) => /expected|result|assert|outcome|verify/i.test(lower[i])) || null,
    url: headers.find((h, i) => /url|link|endpoint|address/i.test(lower[i])) || null,
    tags: headers.find((h, i) => /tag|label|keyword/i.test(lower[i])) || null
  }
}

/**
 * Generate a unique spec ID
 */
function generateSpecId() {
  return `functional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Sanitize a string for use in identifiers
 */
function sanitize(str) {
  return (str || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

/**
 * Preview CSV - parse and return headers + sample rows for mapping UI
 * POST /api/test-cases/preview
 */
exports.preview = async (req, res) => {
  try {
    const { csv } = req.body

    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ error: 'CSV content is required' })
    }

    // Strip BOM if present
    const cleanCsv = csv.replace(/^\uFEFF/, '')
    const { headers, rows } = parseCSV(cleanCsv)

    if (headers.length === 0) {
      return res.status(400).json({ error: 'CSV has no headers' })
    }

    // Auto-suggest column mappings
    const suggestions = suggestMappings(headers)

    res.json({
      success: true,
      headers,
      rowCount: rows.length,
      preview: rows.slice(0, 5),
      suggestions
    })
  } catch (error) {
    console.error('Error previewing CSV:', error)
    res.status(500).json({ error: 'Failed to parse CSV' })
  }
}

/**
 * Import CSV and optionally generate tests
 * POST /api/test-cases/import
 *
 * Uses Server-Sent Events (SSE) for progress streaming
 */
exports.importCSV = async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const { csv, mappings, options = {} } = req.body
    const { generateImmediately = false, teamId = null, defaultUrl = '' } = options

    // Validate required mappings
    const required = ['testPack', 'testCase', 'testSteps', 'expectedResults']
    const missing = required.filter(f => !mappings[f])
    if (missing.length > 0) {
      send({ phase: 'error', error: `Missing required mappings: ${missing.join(', ')}` })
      return res.end()
    }

    // Parse CSV
    const cleanCsv = csv.replace(/^\uFEFF/, '')
    const { headers, rows } = parseCSV(cleanCsv)

    // Validate columns exist
    for (const field of required) {
      if (!headers.includes(mappings[field])) {
        send({ phase: 'error', error: `Column not found: ${mappings[field]}` })
        return res.end()
      }
    }

    send({ phase: 'import', status: 'starting', totalRows: rows.length })

    // Group rows by test pack name
    const grouped = {}
    const skipped = []

    for (const row of rows) {
      const packName = (row[mappings.testPack] || '').trim()
      const testName = (row[mappings.testCase] || '').trim()

      // Skip rows with empty required fields
      if (!packName || !testName) {
        skipped.push({ row, reason: 'Missing pack name or test name' })
        continue
      }

      if (!grouped[packName]) {
        grouped[packName] = []
      }
      grouped[packName].push(row)
    }

    const packNames = Object.keys(grouped)
    send({ phase: 'import', status: 'grouped', packs: packNames.length, tests: rows.length - skipped.length, skipped: skipped.length })

    // Create packs and specs
    const createdPacks = []
    const createdSpecs = []

    for (const packName of packNames) {
      const packRows = grouped[packName]

      // Upsert pack (find existing or create new)
      let pack = await prisma.testPack.findFirst({
        where: { name: packName, teamId: teamId || undefined }
      })

      if (!pack) {
        pack = await prisma.testPack.create({
          data: {
            name: packName,
            description: `Imported from CSV`,
            teamId: teamId || null
          }
        })
      }

      createdPacks.push(pack)

      // Create specs for each row
      for (const row of packRows) {
        const specId = generateSpecId()
        const testName = (row[mappings.testCase] || 'Untitled Test').trim()
        const markdownSpec = buildMarkdownSpec(row, mappings, defaultUrl)
        const url = row[mappings.url] || defaultUrl || ''
        const tags = mappings.tags && row[mappings.tags]
          ? row[mappings.tags].split(',').map(t => t.trim()).filter(Boolean)
          : []

        const spec = await prisma.agentTestSpec.create({
          data: {
            specId,
            name: testName,
            description: `Imported from CSV - Pack: ${packName}`,
            url,
            markdownSpec,
            tagsJson: stringifyJson(tags),
            status: 'draft',
            testType: 'functional',
            teamId: teamId || null
          }
        })

        // Link spec to pack
        await prisma.testPackTest.create({
          data: {
            testPackId: pack.id,
            specId: spec.specId
          }
        })

        createdSpecs.push(spec)
      }

      send({
        phase: 'import',
        status: 'progress',
        currentPack: packName,
        createdPacks: createdPacks.length,
        createdSpecs: createdSpecs.length
      })
    }

    send({
      phase: 'import',
      status: 'complete',
      packs: createdPacks.length,
      specs: createdSpecs.length,
      skipped: skipped.length
    })

    // Generate tests if requested
    if (generateImmediately && createdSpecs.length > 0) {
      send({ phase: 'generation', status: 'starting', total: createdSpecs.length })

      let generated = 0
      let failed = 0

      // Cache probed URLs to avoid re-probing the same page multiple times
      const probeCache = new Map()

      for (let i = 0; i < createdSpecs.length; i++) {
        const spec = createdSpecs[i]

        send({
          phase: 'generation',
          status: 'probing',
          current: i + 1,
          total: createdSpecs.length,
          specId: spec.specId,
          specName: spec.name
        })

        try {
          // Probe the page to get live context (ARIA snapshot) for accurate selectors
          let liveContext = null
          if (spec.url) {
            // Check cache first
            if (probeCache.has(spec.url)) {
              liveContext = probeCache.get(spec.url)
            } else {
              try {
                send({
                  phase: 'generation',
                  status: 'probing',
                  current: i + 1,
                  total: createdSpecs.length,
                  specId: spec.specId,
                  specName: spec.name,
                  message: `Probing ${spec.url}...`
                })
                const snap = await pageProbeService.ariaSnapshot(spec.url)
                liveContext = snap.context
                probeCache.set(spec.url, liveContext)
              } catch (probeErr) {
                // Probe failed — skip generation for this spec, leave as draft
                console.warn(`Probe failed for ${spec.url}: ${probeErr.message}`)
                await prisma.agentTestSpec.update({
                  where: { specId: spec.specId },
                  data: { status: 'draft' }
                })
                failed++
                send({
                  phase: 'generation',
                  status: 'failed',
                  current: i + 1,
                  total: createdSpecs.length,
                  specId: spec.specId,
                  specName: spec.name,
                  error: `Cannot reach ${spec.url} — spec saved as draft. Start the target and use Generate All.`
                })
                continue
              }
            }
          }

          send({
            phase: 'generation',
            status: 'generating',
            current: i + 1,
            total: createdSpecs.length,
            specId: spec.specId,
            specName: spec.name
          })

          // Generate Playwright code using AI with live context from probe
          const code = await ai.generateRunnableSpec(
            spec.markdownSpec,
            spec.url,
            null,
            [],
            liveContext
          )

          // Update spec with generated code
          await prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: {
              generatedCode: code,
              status: 'ready'
            }
          })

          generated++
          send({
            phase: 'generation',
            status: 'ready',
            current: i + 1,
            total: createdSpecs.length,
            specId: spec.specId,
            specName: spec.name
          })
        } catch (error) {
          console.error(`Error generating spec ${spec.specId}:`, error)
          failed++

          await prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: { status: 'failed' }
          })

          send({
            phase: 'generation',
            status: 'failed',
            current: i + 1,
            total: createdSpecs.length,
            specId: spec.specId,
            specName: spec.name,
            error: error.message
          })
        }
      }

      send({
        phase: 'generation',
        status: 'complete',
        generated,
        failed
      })
    }

    // Final summary
    send({
      phase: 'complete',
      summary: {
        packs: createdPacks.length,
        specs: createdSpecs.length,
        skipped: skipped.length,
        generated: generateImmediately ? createdSpecs.filter(s => s.status === 'ready').length : 0,
        packIds: createdPacks.map(p => p.id)
      }
    })

    res.end()
  } catch (error) {
    console.error('Error importing CSV:', error)
    send({ phase: 'error', error: error.message })
    res.end()
  }
}

/**
 * Get import status for a specific import job (if tracking is needed)
 * Currently not implemented - SSE provides real-time status
 */
exports.getImportStatus = async (req, res) => {
  res.status(501).json({ error: 'Use SSE stream from /import endpoint for real-time status' })
}

/**
 * Extract test cases from freeform text using AI
 * POST /api/test-cases/extract
 */
exports.extractTestCases = async (req, res) => {
  try {
    const { text, targetUrl } = req.body

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide more detailed text to extract test cases from' })
    }

    const prompt = `You are a QA engineer extracting test cases from requirements or specifications.

Analyze the following text and extract structured test cases. For each test case, provide:
- name: A clear, concise test case name (imperative style, e.g., "Verify login with valid credentials")
- steps: The test steps to perform (natural language, one per line)
- expected: The expected results or assertions (what should happen)

Return ONLY valid JSON in this exact format:
{
  "testCases": [
    {
      "name": "Test case name",
      "steps": "Step 1\\nStep 2\\nStep 3",
      "expected": "Expected result 1\\nExpected result 2"
    }
  ]
}

TEXT TO ANALYZE:
${text}

${targetUrl ? `Target URL: ${targetUrl}` : ''}

Extract all testable scenarios. If the text describes a feature, break it into multiple test cases (happy path, edge cases, error cases). Be thorough but practical.`

    const response = await ai.sendMessage(prompt, {
      maxTokens: 4000,
      systemPrompt: 'You are a QA test case extraction assistant. Always respond with valid JSON only.'
    })

    // Parse the JSON response
    let result
    try {
      // Handle markdown code blocks if present
      let jsonText = response.trim()
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '')
      }
      result = JSON.parse(jsonText)
    } catch (parseErr) {
      console.error('Failed to parse AI response:', response)
      return res.status(500).json({ error: 'AI returned invalid format. Please try again.' })
    }

    if (!result.testCases || !Array.isArray(result.testCases)) {
      return res.status(500).json({ error: 'AI did not return test cases. Please try again with more detail.' })
    }

    res.json({
      success: true,
      testCases: result.testCases.map(tc => ({
        name: (tc.name || '').trim(),
        steps: (tc.steps || '').trim(),
        expected: (tc.expected || '').trim()
      })).filter(tc => tc.name && tc.steps)
    })
  } catch (error) {
    console.error('Error extracting test cases:', error)
    res.status(500).json({ error: 'Failed to extract test cases' })
  }
}

/**
 * Import extracted/edited test cases
 * POST /api/test-cases/import-extracted
 */
exports.importExtracted = async (req, res) => {
  try {
    const { testCases, targetUrl, packId, newPackName, generateCode = false } = req.body

    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
      return res.status(400).json({ error: 'No test cases provided' })
    }

    // Get or create pack
    let pack
    if (packId) {
      pack = await prisma.testPack.findUnique({ where: { id: packId } })
      if (!pack) {
        return res.status(404).json({ error: 'Test pack not found' })
      }
    } else {
      const packName = newPackName?.trim() || `Imported ${new Date().toLocaleDateString()}`
      pack = await prisma.testPack.create({
        data: {
          name: packName,
          description: 'Imported from AI extraction'
        }
      })
    }

    const createdSpecs = []

    for (const tc of testCases) {
      if (!tc.name?.trim() || !tc.steps?.trim()) continue

      const specId = generateSpecId()
      const markdownSpec = `## ${tc.name}

**URL:** ${targetUrl || 'TBD'}

### Test Steps
${tc.steps.split('\n').filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n') || '- (No steps provided)'}

### Expected Results
${tc.expected ? tc.expected.split('\n').filter(s => s.trim()).map(s => `- Verify: ${s.trim()}`).join('\n') : '- Test passes successfully'}
`

      const spec = await prisma.agentTestSpec.create({
        data: {
          specId,
          name: tc.name.trim(),
          description: `Imported via AI extraction`,
          url: targetUrl || '',
          markdownSpec,
          tagsJson: '[]',
          status: 'draft',
          testType: 'functional'
        }
      })

      // Link to pack
      await prisma.testPackTest.create({
        data: {
          testPackId: pack.id,
          specId: spec.specId
        }
      })

      createdSpecs.push(spec)
    }

    // Generate code if requested
    if (generateCode && createdSpecs.length > 0) {
      // Probe the target URL once for all specs (they share the same URL)
      let liveContext = null
      if (targetUrl) {
        try {
          const snap = await pageProbeService.ariaSnapshot(targetUrl)
          liveContext = snap.context
        } catch (probeErr) {
          console.warn(`Probe failed for ${targetUrl}: ${probeErr.message}`)
        }
      }

      for (const spec of createdSpecs) {
        try {
          const code = await ai.generateRunnableSpec(
            spec.markdownSpec,
            spec.url,
            null,
            [],
            liveContext
          )
          await prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: { generatedCode: code, status: 'ready' }
          })
        } catch (err) {
          console.error(`Failed to generate code for ${spec.specId}:`, err)
          await prisma.agentTestSpec.update({
            where: { specId: spec.specId },
            data: { status: 'failed' }
          })
        }
      }
    }

    res.json({
      success: true,
      pack: { id: pack.id, name: pack.name },
      specsCreated: createdSpecs.length
    })
  } catch (error) {
    console.error('Error importing extracted test cases:', error)
    res.status(500).json({ error: 'Failed to import test cases' })
  }
}
