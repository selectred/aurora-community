const ai = require('./aiService')
const browserSessions = require('./browserSessionService')
const mcpStreaming = require('./mcpStreamingService')

const MAX_RETRIES = 3

const ARIA_GROUNDED_PROMPT = `You are a Playwright locator expert. You must find ONE element from a given list that best matches a test step intent.

RULES:
- You MUST only use elements from the "Available elements" list — no other names, no guesses
- If nothing in the list matches the intent, return {"action":null}
- For fill/type steps: find a textbox, input, or search field
- For click steps: find a button, link, or tab
- Return ONLY JSON — no explanation

Response format:
{"action":"click","locator":{"type":"role","role":"button","name":"EXACT NAME FROM LIST"}}
{"action":"fill","locator":{"type":"role","role":"textbox","name":"EXACT NAME FROM LIST"},"value":"VALUE"}
{"action":"fill","locator":{"type":"placeholder","placeholder":"EXACT PLACEHOLDER FROM LIST"},"value":"VALUE"}
{"action":null}`

function extractAriaElements(ariaText) {
  if (!ariaText) return []
  const elements = []
  const seen = new Set()
  // Match: - role "name" or - role "name" [attrs]
  const rolePattern = /^\s*-?\s*(link|button|textbox|checkbox|combobox|listitem|menuitem|tab|heading|img|input|select|textarea|searchbox|spinbutton|option|radio|switch)\s+"([^"]+)"/gim
  let m
  while ((m = rolePattern.exec(ariaText)) !== null) {
    const key = `${m[1]}:"${m[2]}"`
    if (!seen.has(key)) { seen.add(key); elements.push({ role: m[1], name: m[2] }) }
  }
  // Also capture placeholder attributes: placeholder="..."
  const placeholderPattern = /placeholder="([^"]+)"/gi
  while ((m = placeholderPattern.exec(ariaText)) !== null) {
    const key = `placeholder:"${m[1]}"`
    if (!seen.has(key)) { seen.add(key); elements.push({ role: 'placeholder', name: m[1] }) }
  }
  return elements.slice(0, 40)
}

const SYSTEM_PROMPT = `You are a Playwright test validator. You drive a real browser to validate and fix test steps one at a time.

For each step you receive:
- intent: what the step is trying to do
- originalCode: the code from the imported test (may use broken selectors)
- pageUrl: current browser URL
- pageAria: ARIA accessibility tree of the current page

Return ONLY a JSON object — no markdown, no explanation:

{
  "action": "navigate|fill|click|select|clear-auth|wait-url|assert-title|assert-url|assert-visible|skip|fail",

  "locator": {
    "type": "role|label|placeholder|text|testid|css",
    "role": "button|textbox|combobox|link|...",
    "name": "accessible name",
    "label": "label text",
    "placeholder": "placeholder text",
    "text": "visible text",
    "testId": "data-testid value",
    "selector": ".css .selector",
    "nth": 0,
    "first": true,
    "last": false,
    "filterText": "text to filter by",
    "exact": false
  },

  "value": "text to fill or option label to select",
  "index": 1,
  "url": "full URL for navigate/wait-url",
  "pattern": "regex pattern string for wait-url/assert-url",
  "expected": "for assert-title: expected title pattern",

  "code": "await page.locator('...').fill('...');",
  "confidence": 0.9,
  "reasoning": "why this locator was chosen"
}

Rules:
- CRITICAL: Only use accessible names you can literally see in the ARIA snapshot. NEVER guess or infer a name — if you cannot see the element's name in the snapshot, use css type instead.
- If an element appears in the ARIA tree WITHOUT a name (e.g. "- textbox" with no quoted name after it), do NOT add a name — use nth-based targeting instead.
- Prefer selectors in this order: testid → label (getByLabel) → placeholder → role+name (only if name is visible in ARIA) → nth-role → css

MODAL / DIALOG FIELDS (most important rule):
- NEVER use [role='dialog'] as a CSS attribute selector — most frameworks (Vue, React) do not set this HTML attribute and it will always time out.
- For unlabelled fields in a modal, use nth-based role targeting: { type: "role", role: "textbox", nth: 0 } for the first textbox, nth: 1 for the second, etc. These match fields within any visible dialog.
- Alternatively scope with Playwright's :has-text() pseudo-class: { type: "css", selector: ":has-text(\"Modal Heading\") input[type=\"text\"]", first: true }
- For selects in modals: { type: "css", selector: "select", first: true } (the modal is the only active UI)
- The html <dialog> element selector "dialog input" also works if the framework uses native dialog elements.

- For skip: use when the step checks something not present in the current UI
- For fail: only when the intent truly cannot be achieved on this page
- The code field must be valid Playwright await expression(s)
- For clear-auth: action is "clear-auth", no locator needed
- For navigate: action is "navigate", provide url field
- For assertions: action is "assert-title", "assert-url", or "assert-visible"`

// ─── Element picker helpers ────────────────────────────────────────────────

async function injectElementPicker(page) {
  await page.evaluate(() => {
    document.getElementById('__mcp_picker__')?.remove()
    document.getElementById('__mcp_highlight__')?.remove()
    window.__mcpPickResult__ = null

    const highlight = document.createElement('div')
    highlight.id = '__mcp_highlight__'
    highlight.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:2147483646',
      'border:2px solid #7367F0', 'background:rgba(115,103,240,0.12)',
      'border-radius:3px', 'box-shadow:0 0 0 3px rgba(115,103,240,0.25)',
      'transition:top .05s,left .05s,width .05s,height .05s', 'display:none'
    ].join(';')

    const label = document.createElement('div')
    label.id = '__mcp_label__'
    label.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'background:#7367F0',
      'color:#fff', 'font:600 11px/1 system-ui,sans-serif',
      'padding:3px 7px', 'border-radius:3px', 'pointer-events:none', 'display:none'
    ].join(';')

    const overlay = document.createElement('div')
    overlay.id = '__mcp_picker__'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair;'

    document.body.appendChild(highlight)
    document.body.appendChild(label)
    document.body.appendChild(overlay)

    overlay.addEventListener('mousemove', (e) => {
      overlay.style.pointerEvents = 'none'
      const el = document.elementFromPoint(e.clientX, e.clientY)
      overlay.style.pointerEvents = ''
      if (!el || el === overlay || el === highlight) return
      const r = el.getBoundingClientRect()
      highlight.style.display = 'block'
      highlight.style.top  = r.top  + 'px'
      highlight.style.left = r.left + 'px'
      highlight.style.width  = r.width  + 'px'
      highlight.style.height = r.height + 'px'
      label.style.display = 'block'
      label.style.top  = Math.max(0, r.top - 22) + 'px'
      label.style.left = r.left + 'px'
      label.textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    })

    overlay.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      overlay.style.pointerEvents = 'none'
      const el = document.elementFromPoint(e.clientX, e.clientY)
      overlay.style.pointerEvents = ''
      if (!el) return

      // Resolve label
      let labelText = ''
      if (el.id) {
        const lbl = document.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]')
        if (lbl) labelText = lbl.textContent?.trim() || ''
      }
      if (!labelText) {
        const closest = el.closest('label')
        if (closest) labelText = closest.textContent?.trim() || ''
      }
      if (!labelText) {
        const lblId = el.getAttribute('aria-labelledby')
        if (lblId) {
          const lbl = document.getElementById(lblId)
          if (lbl) labelText = lbl.textContent?.trim() || ''
        }
      }

      window.__mcpPickResult__ = {
        tag:         el.tagName.toLowerCase(),
        role:        el.getAttribute('role') || '',
        ariaLabel:   el.getAttribute('aria-label') || '',
        name:        (el.getAttribute('aria-label') || el.textContent?.trim() || '').slice(0, 80),
        placeholder: el.getAttribute('placeholder') || '',
        label:       labelText,
        testId:      el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
        id:          el.id || '',
        type:        el.getAttribute('type') || '',
        outerHTML:   el.outerHTML.slice(0, 200)
      }

      overlay.remove()
      highlight.remove()
      label.remove()
    })
  })
}

async function removePicker(page) {
  await page.evaluate(() => {
    document.getElementById('__mcp_picker__')?.remove()
    document.getElementById('__mcp_highlight__')?.remove()
    document.getElementById('__mcp_label__')?.remove()
    window.__mcpPickResult__ = null
  }).catch(() => {})
}

function pickedElementToLocator(picked) {
  if (picked.testId)      return { type: 'testid',      testId:      picked.testId }
  if (picked.label)       return { type: 'label',       label:       picked.label }
  if (picked.placeholder) return { type: 'placeholder', placeholder: picked.placeholder }
  if (picked.ariaLabel)   return { type: 'role',        role: picked.role || picked.tag, name: picked.ariaLabel }
  if (picked.name && picked.name !== picked.tag) return { type: 'text', text: picked.name.slice(0, 50) }
  if (picked.id)          return { type: 'css', selector: '#' + picked.id }
  return { type: 'css', selector: picked.tag }
}

function buildLocatorCode(spec) {
  if (!spec) return 'page.locator("body")'
  let base
  switch (spec.type) {
    case 'role': {
      const opts = []
      if (spec.name)  opts.push(`name: ${JSON.stringify(spec.name)}`)
      if (spec.exact !== undefined) opts.push(`exact: ${spec.exact}`)
      base = `page.getByRole(${JSON.stringify(spec.role)}${opts.length ? `, { ${opts.join(', ')} }` : ''})`
      break
    }
    case 'label':       base = `page.getByLabel(${JSON.stringify(spec.label)})`; break
    case 'placeholder': base = `page.getByPlaceholder(${JSON.stringify(spec.placeholder)})`; break
    case 'text':        base = `page.getByText(${JSON.stringify(spec.text)})`; break
    case 'testid':      base = `page.getByTestId(${JSON.stringify(spec.testId)})`; break
    default:            base = `page.locator(${JSON.stringify(spec.selector || String(spec))})`; break
  }
  if (spec.nth  != null) return `${base}.nth(${spec.nth})`
  if (spec.first)        return `${base}.first()`
  if (spec.last)         return `${base}.last()`
  return base
}

// Escape forward slashes so they don't close a regex literal early.
// Also preserves existing backslash escapes.
function toRegexLiteral(pattern) {
  return (pattern || '').replace(/\\/g, '\\\\').replace(/\//g, '\\/')
}

// Generate deterministic, correct Playwright code from the action the AI performed.
// This replaces trusting aiResponse.code, which the AI frequently gets wrong
// (e.g. `expect(page.url()).toMatch(...)` instead of `await expect(page).toHaveURL(...)`).
function generateCodeFromAction(aiResponse) {
  const { action, locator, value, url, pattern, expected } = aiResponse
  switch (action) {
    case 'navigate':
      return `await page.goto(${JSON.stringify(url || '')});`
    case 'fill': {
      const l = buildLocatorCode(locator)
      return `await ${l}.fill(${JSON.stringify(value || '')});`
    }
    case 'click': {
      const l = buildLocatorCode(locator)
      return `await ${l}.click();`
    }
    case 'check': {
      const l = buildLocatorCode(locator)
      return `await ${l}.check();`
    }
    case 'select': {
      const l = buildLocatorCode(locator)
      return `await ${l}.selectOption(${JSON.stringify(value || '')});`
    }
    case 'wait-url': {
      const pat = toRegexLiteral(pattern || url || '')
      return pat ? `await page.waitForURL(/${pat}/, { timeout: 25000 });` : '// wait-url: no pattern'
    }
    case 'assert-url': {
      const pat = toRegexLiteral(pattern || url || '')
      return pat ? `await expect(page).toHaveURL(/${pat}/);` : '// assert-url: no pattern'
    }
    case 'assert-title': {
      const pat = toRegexLiteral(expected || pattern || '')
      return pat ? `await expect(page).toHaveTitle(/${pat}/i);` : '// assert-title: no pattern'
    }
    case 'assert-visible': {
      const l = buildLocatorCode(locator)
      return `await expect(${l}).toBeVisible();`
    }
    default:
      return null // caller falls back to aiResponse.code
  }
}

function generateCodeForStep(type, locatorSpec, value) {
  const l = buildLocatorCode(locatorSpec)
  switch (type) {
    case 'fill':   return `await ${l}.fill(${JSON.stringify(value || '')});`
    case 'click':  return `await ${l}.click();`
    case 'check':  return `await ${l}.check();`
    case 'select': return `await ${l}.selectOption(${JSON.stringify(value || '')});`
    default:       return `await ${l}.click();`
  }
}

function stepTypeToAction(stepType) {
  const map = {
    navigate: 'navigate', fill: 'fill', click: 'click',
    select: 'select', assert: 'assert-visible', 'wait-url': 'wait-url',
    'clear-auth': 'clear-auth', check: 'click', custom: 'skip'
  }
  return map[stepType] || 'skip'
}

// ─── Interactive element pick (headed sessions only) ───────────────────────

async function interactivePick(session, sessionId, step, resolvedStep, variables, emit, canPick) {
  emit('step-needs-input', {
    stepId:  step.id,
    intent:  step.intent,
    type:    step.type,
    canPick  // only true when headed — controls whether browser click is offered
  })

  // In headed mode: inject the visual overlay and race against WS input
  if (canPick) {
    const pickerInjected = await injectElementPicker(session.page).then(() => true).catch(() => false)

    const pickedViaPage = pickerInjected
      ? session.page
          .waitForFunction(() => window.__mcpPickResult__, { timeout: 300000 })
          .then(h => h.jsonValue())
          .then(r => ({ source: 'pick', data: r }))
          .catch(() => new Promise(() => {}))  // absorb errors — fall through to WS
      : new Promise(() => {})  // never resolves if picker wasn't injected

    const inputViaWS = mcpStreaming
      .awaitInput(sessionId, 300000)
      .then(d => ({ source: 'ws', data: d }))

    const { source, data: inputData } = await Promise.race([pickedViaPage, inputViaWS])

    if (source === 'pick') {
      mcpStreaming.cancelInput(sessionId)
      await removePicker(session.page).catch(() => {})

      const forcedLocator = pickedElementToLocator(inputData)
      emit('pick-confirmed', { stepId: step.id, locator: forcedLocator, element: inputData })

      const aiResp = {
        action:   stepTypeToAction(step.type),
        locator:  forcedLocator,
        value:    resolvedStep.value,
        url:      resolvedStep.url,
        pattern:  resolvedStep.expected,
        expected: resolvedStep.expected
      }
      const afterState = await executeAction(session, aiResp)
      return {
        status: 'pass',
        code:   generateCodeForStep(step.type, forcedLocator, resolvedStep.value),
        notes:  'Element picked by user',
        confidence: 1.0,
        screenshot: afterState
      }
    }

    await removePicker(session.page).catch(() => {})

    if (inputData.action === 'take-over') {
      return await manualMode(session, sessionId, step, emit)
    }

    return handleWsInput(inputData, resolvedStep, step, session, variables, emit)
  }

  // Headless mode: wait for hint / skip / abort from the UI only
  const inputData = await mcpStreaming.awaitInput(sessionId, 300000)
  return handleWsInput(inputData, resolvedStep, step, session, variables, emit)
}

// Inject a floating "you have control" bar into the browser page during manual mode
async function injectManualModeBar(page, intent) {
  await page.evaluate((intentText) => {
    document.getElementById('__mcp_manual_bar__')?.remove()
    const bar = document.createElement('div')
    bar.id = '__mcp_manual_bar__'
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#00CFE8', 'color:#000', 'font:600 13px/1 system-ui,sans-serif',
      'padding:10px 16px', 'display:flex', 'align-items:center', 'gap:10px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
    ].join(';')
    bar.innerHTML = `
      <span style="font-size:16px;">🎯</span>
      <span><strong>Aurora — Manual mode:</strong> ${intentText}</span>
      <span style="margin-left:auto;font-size:11px;opacity:0.8;">Click Continue in Aurora when done</span>
    `
    document.body.prepend(bar)
    // Push page content down so bar doesn't overlap
    document.body.style.marginTop = '42px'
  }, intent).catch(() => {})
}

async function removeManualModeBar(page) {
  await page.evaluate(() => {
    document.getElementById('__mcp_manual_bar__')?.remove()
    document.body.style.marginTop = ''
  }).catch(() => {})
}

// User has taken over the browser directly — wait for them to signal done
async function manualMode(session, sessionId, step, emit) {
  emit('take-over-active', { stepId: step.id, intent: step.intent })

  // Show a visible banner in the browser so the user knows they have control
  await injectManualModeBar(session.page, step.intent)

  // Wait up to 10 minutes for the user to finish and click Done
  const doneInput = await mcpStreaming.awaitInput(sessionId, 600000)

  await removeManualModeBar(session.page)

  if (doneInput.action === 'abort') throw new Error('Aborted by user')
  if (doneInput.action === 'skip') return { status: 'skip', notes: 'Skipped by user' }

  // User clicked Done (optionally with a description of what they did)
  const afterState = await session.observe()
  const noteText = doneInput.hint ? `Completed manually: ${doneInput.hint}` : 'Completed manually by user'
  const codeComment = doneInput.hint
    ? `// TODO: ${doneInput.hint}`
    : `// TODO: manually complete — ${step.intent}`

  return {
    status:     'pass',
    code:       codeComment,
    notes:      noteText,
    confidence: 1.0,
    screenshot: afterState
  }
}

async function handleWsInput(inputData, resolvedStep, step, session, variables, emit) {
  if (inputData.action === 'skip')  return { status: 'skip', notes: 'Skipped by user' }
  if (inputData.action === 'abort') throw new Error('Aborted by user')

  if (inputData.action === 'hint') {
    const pageState = await session.observe()
    emit('screenshot', { stepId: step.id, data: pageState.screenshot, url: pageState.url })
    const aiResponse = await askAI(resolvedStep, pageState, 'hint', `User correction: ${inputData.hint}`, variables)
    emit('action', { stepId: step.id, action: aiResponse.action, reasoning: aiResponse.reasoning, confidence: aiResponse.confidence })

    if (aiResponse.action === 'skip') {
      return { status: 'skip', notes: `Skipped after hint: ${inputData.hint}` }
    }
    if (aiResponse.action === 'fail') {
      return { status: 'fail', notes: `Could not fix after hint: ${aiResponse.reasoning}` }
    }

    const afterState = await executeAction(session, aiResponse)
    if (afterState) emit('screenshot', { stepId: step.id, data: afterState.screenshot, url: afterState.url })
    return {
      status: 'pass',
      code:   aiResponse.code,
      notes:  `Fixed with hint: ${inputData.hint}`,
      confidence: aiResponse.confidence,
      screenshot: afterState
    }
  }

  return { status: 'fail', notes: 'No valid user action received' }
}

// ─── Action executor ───────────────────────────────────────────────────────

async function executeAction(session, aiResponse) {
  const { action, locator, value, index, url, pattern, expected } = aiResponse

  switch (action) {
    case 'navigate':
      return session.navigate(url)

    case 'fill':
      return session.fill(locator, value)

    case 'click':
      return session.click(locator)

    case 'select':
      return session.select(locator, value, index)

    case 'clear-auth':
      return session.clearAuth()

    case 'wait-url':
      return session.waitForUrl(pattern || url, 25000)

    case 'assert-title': {
      const result = await session.assertTitle(expected || pattern || '')
      if (!result.pass) throw new Error(`Title assertion failed. Expected /${expected}/, got "${result.actual}"`)
      return session.observe()
    }

    case 'assert-url': {
      const result = await session.assertUrl(pattern || url || '')
      if (!result.pass) throw new Error(`URL assertion failed. Expected /${pattern}/, got "${result.actual}"`)
      return session.observe()
    }

    case 'assert-visible': {
      const result = await session.assertVisible(locator)
      if (!result.pass) throw new Error(`Visibility assertion failed — element not visible`)
      return session.observe()
    }

    case 'skip':
    case 'fail':
      return null

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}

// ─── AI query ─────────────────────────────────────────────────────────────

async function askAI(step, pageState, attempt, lastError, variables) {
  const errorCtx = lastError
    ? `\nPrevious attempt failed: ${lastError}\nTry a different selector or approach.`
    : ''

  const varCtx = variables && Object.keys(variables).length
    ? `\nPack variables — use these exact values for credentials/configuration (ignore any hardcoded values in the original code):\n${
        Object.entries(variables).map(([k, v]) => `  ${k} = "${v}"`).join('\n')
      }`
    : ''

  const userMsg = `Step intent: ${step.intent}
Step type: ${step.type}
Original code: ${step.selector || step.url || '(none)'}
${step.value ? `Original value: ${step.value}` : ''}
${varCtx}
Current page URL: ${pageState.url}
Current page ARIA tree:
${pageState.ariaText}
${errorCtx}`

  const raw = await ai.complete(SYSTEM_PROMPT, userMsg, 1500, 'MCPValidate')
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(clean)
}

async function askAIAriaGrounded(step, elements, lastError) {
  const stepType = step.type || ''
  const wantsFill  = stepType === 'fill' || stepType === 'type' || stepType === 'input'
  const wantsClick = stepType === 'click' || stepType === 'navigate-click'

  const elementList = elements.map(e =>
    e.role === 'placeholder'
      ? `  - input placeholder="${e.name}"`
      : `  - ${e.role} "${e.name}"`
  ).join('\n')

  const userMsg = `Step intent: ${step.intent}
Step type: ${stepType}
${step.value ? `Value: ${step.value}` : ''}
Last error: ${lastError || 'locator not found'}
${wantsFill ? 'Looking for: a textbox, input, or field to fill' : ''}
${wantsClick ? 'Looking for: a button, link, or clickable element' : ''}

Available elements:
${elementList}`

  try {
    const raw = await ai.complete(ARIA_GROUNDED_PROMPT, userMsg, 400, 'MCPAriaFix')
    const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(clean)
    if (!result || !result.action) return null
    // Inject value from step if not provided by AI (common for fill steps)
    if (result.action === 'fill' && !result.value && step.value) result.value = step.value
    return result
  } catch {
    return null
  }
}

function resolveVars(value, variables) {
  if (!value || typeof value !== 'string' || !Object.keys(variables).length) return value
  return value.replace(/\{\{([^}]+)\}\}/g, (_, name) => variables[name] ?? `{{${name}}}`)
}

// ─── Main runner ───────────────────────────────────────────────────────────

async function runValidation(specId, intentGraph, opts = {}, emit) {
  const { headed = false, variables = {}, sessionId, autoMode = false } = opts
  const steps = intentGraph.steps || []
  const results = []
  let session = null

  try {
    emit('session-start', { specId, totalSteps: steps.length, headed })

    session = await browserSessions.create({ headed })

    for (const step of steps) {
      emit('step-start', { stepId: step.id, intent: step.intent, type: step.type })

      const stepResult = { stepId: step.id, intent: step.intent, type: step.type, status: 'pending', code: null, notes: null }

      if (step.type === 'clear-auth') {
        try {
          await session.clearAuth()
          const pageState = await session.observe()
          stepResult.status = 'pass'
          stepResult.code = `await page.evaluate('try{localStorage.clear()}catch(e){};try{sessionStorage.clear()}catch(e){}');\nawait page.context().clearCookies();`
          emit('screenshot', { stepId: step.id, data: pageState.screenshot, url: pageState.url })
        } catch (err) {
          stepResult.status = 'fail'
          stepResult.notes = err.message
        }
        results.push(stepResult)
        emit('step-result', stepResult)
        continue
      }

      const resolvedStep = {
        ...step,
        value: resolveVars(step.value, variables),
        url:   resolveVars(step.url, variables),
      }
      let lastError = null
      let succeeded = false
      let lastPageState = null

      for (let attempt = 1; attempt <= MAX_RETRIES && !succeeded; attempt++) {
        try {
          const pageState = await session.observe()
          lastPageState = pageState
          emit('screenshot', { stepId: step.id, attempt, data: pageState.screenshot, url: pageState.url })

          const aiResponse = await askAI(resolvedStep, pageState, attempt, lastError, variables)
          emit('action', { stepId: step.id, attempt, action: aiResponse.action, reasoning: aiResponse.reasoning, confidence: aiResponse.confidence })

          if (aiResponse.action === 'skip') {
            stepResult.status = 'skip'; stepResult.notes = aiResponse.reasoning; succeeded = true; break
          }
          if (aiResponse.action === 'fail') {
            throw new Error(`AI determined step cannot be completed: ${aiResponse.reasoning}`)
          }

          const afterState = await executeAction(session, aiResponse)
          if (afterState) emit('screenshot', { stepId: step.id, attempt, phase: 'after', data: afterState.screenshot, url: afterState.url })

          stepResult.status = 'pass'
          // Use deterministic code generation for known actions — AI's code field
          // frequently uses wrong Playwright APIs (e.g. expect(string).toMatch).
          stepResult.code = generateCodeFromAction(aiResponse) ?? aiResponse.code
          stepResult.notes = aiResponse.reasoning
          stepResult.confidence = aiResponse.confidence
          succeeded = true
        } catch (err) {
          lastError = err.message
          emit('retry', { stepId: step.id, attempt, error: err.message })
        }
      }

      // All AI retries exhausted — in autoMode try ARIA-grounded fix then skip, otherwise ask user
      if (!succeeded) {
        if (autoMode) {
          // Final pass: constrain AI to only elements that exist in the ARIA tree
          const ariaElements = lastPageState ? extractAriaElements(lastPageState.ariaText) : []
          if (ariaElements.length > 0) {
            emit('retry', { stepId: step.id, attempt: 'aria-fix', error: 'Trying ARIA-grounded fix…' })
            try {
              const groundedResponse = await askAIAriaGrounded(resolvedStep, ariaElements, lastError)
              if (groundedResponse && groundedResponse.action) {
                const afterState = await executeAction(session, groundedResponse)
                if (afterState) emit('screenshot', { stepId: step.id, attempt: 'aria-fix', phase: 'after', data: afterState.screenshot, url: afterState.url })
                stepResult.status = 'pass'
                stepResult.code = generateCodeFromAction(groundedResponse) ?? groundedResponse.code
                stepResult.notes = 'Fixed via ARIA-grounded element match'
                stepResult.confidence = 0.8
                succeeded = true
              }
            } catch {
              // ARIA-grounded attempt also failed — fall through to skip
            }
          }

          if (!succeeded) {
            stepResult.status = 'skip'
            stepResult.notes  = `Auto-skipped after ${MAX_RETRIES} attempts: ${lastError}`
            // Store top elements visible at failure so buildSpec can emit hints
            stepResult.ariaHints = ariaElements.slice(0, 10).map(e =>
              e.role === 'placeholder' ? `input[placeholder="${e.name}"]` : `${e.role} "${e.name}"`
            )
          }
        } else if (sessionId) {
          try {
            const interactResult = await interactivePick(session, sessionId, step, resolvedStep, variables, emit, headed)
            stepResult.status     = interactResult.status
            stepResult.code       = interactResult.code || null
            stepResult.notes      = interactResult.notes || lastError
            stepResult.confidence = interactResult.confidence || null
            if (interactResult.screenshot) {
              emit('screenshot', { stepId: step.id, data: interactResult.screenshot.screenshot, url: interactResult.screenshot.url })
            }
          } catch (interactErr) {
            if (interactErr.message === 'Aborted by user') throw interactErr
            stepResult.status = 'fail'
            stepResult.notes  = interactErr.message
          }
        } else {
          stepResult.status = 'fail'
          stepResult.notes  = `Failed after ${MAX_RETRIES} attempts. Last error: ${lastError}`
        }
      }

      results.push(stepResult)
      emit('step-result', stepResult)
    }

    const validatedSpec = buildSpec(intentGraph.title, results)
    const summary = {
      total: steps.length,
      pass:  results.filter(r => r.status === 'pass').length,
      fail:  results.filter(r => r.status === 'fail').length,
      skip:  results.filter(r => r.status === 'skip').length
    }

    emit('complete', { summary, validatedSpec })
    return { success: true, summary, validatedSpec, results }
  } catch (err) {
    emit('error', { message: err.message })
    return { success: false, error: err.message, results }
  } finally {
    if (session) await browserSessions.destroy(session.id)
  }
}

// ─── Spec builder ──────────────────────────────────────────────────────────

function buildSpec(title, results) {
  const lines = [
    `const { test, expect } = require('@playwright/test');`,
    ``,
    `test(${JSON.stringify(title || 'Validated test')}, async ({ page }) => {`
  ]
  for (const r of results) {
    if (r.status === 'skip') {
      lines.push(`  // SKIPPED: ${r.intent} — ${r.notes || 'not applicable in current UI'}`)
      if (r.ariaHints && r.ariaHints.length) {
        lines.push(`  // Page had: ${r.ariaHints.join(', ')}`)
        lines.push(`  // TODO: pick the correct element above and replace this comment with working code`)
      }
    } else if (r.status === 'fail') {
      lines.push(`  // FAILED: ${r.intent} — ${r.notes || 'could not complete'}`)
      lines.push(`  // TODO: manually fix this step`)
    } else if (r.code) {
      if (r.intent) lines.push(`  // ${r.intent}`)
      r.code.split('\n').forEach(line => lines.push(`  ${line}`))
    }
  }
  lines.push(`});`)
  return lines.join('\n')
}

module.exports = { runValidation }
