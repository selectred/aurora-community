'use strict'
const fs = require('fs')
const path = require('path')

const CONFIG_DIR = process.env.AURORA_CONFIG_DIR || path.join(__dirname, '../config')
const PROMPTS_PATH = path.join(CONFIG_DIR, 'prompts.json')

// Bump this integer any time DEFAULTS content changes. On next load, keys that haven't been
// customized via the Settings UI (tracked per-key against _defaultsSnapshot in the persisted
// file — see _load()) adopt the new default text automatically. Keys the user has edited are
// preserved indefinitely across bumps, so editable prompts survive future prompt tweaks.
const DEFAULTS_VERSION = 10

// Keys that get base_playwright_rules prepended before being sent to AI.
// Planning and utility prompts are excluded — they don't generate code.
const CODE_GEN_KEYS = new Set([
  'generate_code', 'generate_runnable_spec', 'heal', 'heal_runnable_spec',
  'page_object', 'fixture', 'typescript_spec', 'generate_seed_code',
  'data_per_row_spec', 'data_loop_spec', 'refactor_spec'
])

// DEFAULTS — source of truth for Reset to Default
const DEFAULTS = {

  // ---------------------------------------------------------------------------
  // base_playwright_rules — prepended to every code-generation prompt.
  // Fix a rule here once and it propagates to all generation stages automatically.
  // ---------------------------------------------------------------------------
  base_playwright_rules: `UNIVERSAL PLAYWRIGHT RULES — applied to every piece of generated code:

ASSERTIONS — use ONLY Playwright forms, never Jest:
- await expect(locator).toBeVisible({ timeout: 10000 })
- await expect(page).toHaveURL(/pattern/)
- await expect(page).toHaveTitle(/pattern/i)
- await expect(locator).toHaveText(/pattern/)
- await expect(locator).toHaveCount(n)
NEVER use: expect(page.url()).toMatch(), expect(string).toBe(), expect(string).toEqual(), expect(page.title()), or any other non-Playwright assertion form.
NEVER use locator.count() inside expect() — use toHaveCount() instead.
Timeout belongs on the expect, not the locator: await expect(locator).toBeVisible({ timeout: 10000 })

SELECTORS — semantic selectors only:
- Prefer: getByRole(), getByLabel(), getByPlaceholder(), getByText()
- NEVER use CSS class selectors or XPath
- NEVER put { nth: 0 } inside getByRole options — chain .nth(0) after the locator instead
- When the same text appears in nav, footer, and body — scope it:
    page.getByRole('navigation').getByRole('link', { name: 'X' }).first()
- When in doubt, add .first() to avoid strict mode violations
- NEVER invent selectors — only use elements visible in the provided page snapshot

NAVIGATION:
- waitForURL must use a STRING GLOB, never a regex literal:
  ✓ await page.waitForURL('**/dashboard**', { timeout: 15000 })
  ✗ await page.waitForURL(/http:\\/\\/host\\/dashboard/, { timeout: 15000 })
- String globs work with variable substitution; regex literals do not

AUTH / STATE CLEARING:
- NEVER use page.context().storageState({ clear: true }) — it saves state, not clears it
- To clear auth: navigate to the target URL first, THEN:
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();
- NEVER call page.evaluate() before page.goto() — throws SecurityError: page is still about:blank

PERFORMANCE METRICS — add this block as the LAST step in every test() that uses page.goto() (browser tests only — do NOT add to API tests, Page Object files, fixture files, or seed code):
  // Capture web performance metrics
  const perfMetrics = await page.evaluate(() => {
    const t = performance.timing;
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find(e => e.name === 'first-contentful-paint');
    return {
      ttfb: t.responseStart - t.navigationStart,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      tti: t.domInteractive - t.navigationStart,
      domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
      fullPageLoad: t.loadEventEnd - t.navigationStart
    };
  });
  console.log('Performance metrics:', JSON.stringify(perfMetrics));`,

  // ---------------------------------------------------------------------------
  // Planning prompts — not code generators, do not receive base_playwright_rules
  // ---------------------------------------------------------------------------

  plan_with_probe: `You are a senior Playwright test engineer planning test scenarios.
You have been given real page structure extracted from a live probe of the target site.
Use the ACTUAL element text, link labels, heading text and form field names visible in the page structure.
Do NOT use generic placeholders like "first navigation link" or "main content" — use the real names.

Output format:
# Test Plan: [Descriptive Title]

## Test 1: [Specific Test Name]
- Navigate to [exact url]
- Click link "[exact link text from nav]"
- Expect page URL to contain "[path]"
- Expect heading "[exact heading text]" to be visible

## Test 2: [Specific Test Name]
...

STRICT RULES — violating these produces untestable plans:
- ONLY reference elements that appear in the probe data. Never invent elements.
- If the probe says "Forms: NONE FOUND" — do NOT include any steps that fill, submit, or interact with a form or input field.
- If the probe says "Buttons / CTAs: NONE FOUND" — do NOT include CTA click tests.
- For buttons/CTAs: if the href is shown in probe data, use it; otherwise only assert the element is visible — do NOT assert navigation.
- Links marked "(external)" in probe data open in a new tab — note this in the plan step.
- Links NOT marked "(external)" navigate the current page — use standard URL assertion after clicking.
- After clicking an internal nav link, ONLY assert the URL changed — do NOT assert specific heading or body text on destination pages (probe data is only for the home page).
- Include 2-5 focused test scenarios based strictly on what the probe found.`,

  plan_no_probe: `You are a test planning expert. Generate a concise Markdown test plan for Playwright browser tests.

Output format:
# Test Plan: [Brief Title]

## Test 1: [Test Name]
- Navigate to [url]
- Expect page title to contain "[text]"
- Click link "[link text]"
- Expect page URL to contain "[pattern]"
- Expect h1 heading to be visible

## Test 2: [Test Name]
...

Rules:
- Use Playwright-idiomatic language: Expect, Click link, Fill field, Navigate to
- Include 2-5 relevant test scenarios
- Focus on the user flow described
- After clicking a link to a different page, ONLY assert that the URL changed — do NOT assert specific heading or body text on the destination page (you don't have probe data for those pages)`,

  // ---------------------------------------------------------------------------
  // Code generation prompts — each receives base_playwright_rules automatically.
  // Only include what is UNIQUE to this stage; universal rules live above.
  // ---------------------------------------------------------------------------

  generate_code: `You are a Playwright test code generator. Convert the test plan into executable Playwright test code.

Output ONLY valid JavaScript. No explanations. No markdown fences.

Use this format:
const { test, expect } = require('@playwright/test');

test.describe('Test Suite Name', () => {
  test('test name', async ({ page }) => {
    await page.goto('TARGET_URL', { waitUntil: 'domcontentloaded' });
    // ... test steps
  });
});

VARIABLE PLACEHOLDERS:
- Variables are always passed as quoted strings: await page.fill('selector', '{{USERNAME}}')
- NEVER write {{PLACEHOLDER}} without quotes — it is invalid JavaScript
- Correct:   await page.fill('input[type="email"]', '{{ADMIN_EMAIL}}')
- WRONG:     await page.fill('input[type="email"]', {{ADMIN_EMAIL}})
- CRITICAL: If pack variables are listed below, you MUST use them for matching fields:
  - Password field → use a VARIABLE whose name contains PASSWORD
  - Email/username field → use a VARIABLE whose name contains EMAIL or USERNAME
  - Base URL / page.goto() → use a VARIABLE whose name contains URL, HOST, or BASE
  - NEVER substitute placeholder text like 'your-password-here', 'test-user', 'enter-value' etc.
  - If a variable exists for the field type, USE IT — guessing a placeholder is ALWAYS WRONG`,

  generate_runnable_spec: `You are a Playwright test engineer. Generate a single self-contained JavaScript Playwright spec file.

Rules:
- Import ONLY: const { test, expect } = require('@playwright/test');
- No other imports. No Page Object Models. No fixtures. Everything inline.
- Use test.describe() to group, each test is async ({ page }) => {}
- Always navigate to the full URL at the start of each test with waitForLoadState('networkidle')

STRICT MODE — every locator must resolve to exactly ONE element:
- Never use bare page.getByRole('link', { name: 'X' }) when that text appears in nav AND footer AND body
- For nav links:    getByRole('navigation').getByRole('link', { name: 'X' }).first()
- For footer links: getByRole('contentinfo').getByRole('link', { name: 'X' }).first()
- For body links:   getByRole('main').getByRole('link', { name: 'X' }).first()

POST-SNAPSHOT PAGES (e.g. post-login views you have no snapshot data for):
- Assert URL changed with page.waitForURL() and that an h1 exists — do NOT assert specific text
- Never assert specific text on a page you do not have snapshot data for

Output ONLY the JavaScript file. No markdown fences. No explanation.`,

  heal: `You are a Playwright test debugger. Analyze the failing test and provide a fix.

Return a JSON object (no markdown):
{
  "diagnosis": "Brief explanation of the issue",
  "fixedSelector": "The corrected selector or code",
  "confidence": 0.9
}

Common fixes:
- Element not found: Try alternative selectors (getByRole, getByText, getByTestId)
- Timeout: Add waitForSelector or increase timeout
- Assertion failed: Check expected values
- If an ARIA snapshot is provided, prefer role-based selectors derived from it (most stable)`,

  heal_runnable_spec: `HEALING MODE — the previous run had failures. Regenerate the COMPLETE spec file fixing every failing step.

Rules for fixing failures — read the error category carefully:

[LOCALSTORAGE SECURITY ERROR — page.evaluate called before navigation]:
- FIX: Move the localStorage/sessionStorage clear AFTER the first page.goto() call:
    await page.goto('TARGET_URL', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.context().clearCookies();

[NEW TAB WAIT TIMEOUT — used context.waitForEvent but link navigates same tab]:
- The test used context.waitForEvent('page') but the link does NOT open a new tab — it navigates the same tab.
- Look at the page structure data. If the link is listed under "Internal links (same domain, same tab)" or "External links (different domain, same tab)", remove the waitForEvent block entirely.
- For internal links: replace with await linkEl.click(); await page.waitForURL(/domain/, { timeout: 15000 });
- For external same-tab links: replace with await linkEl.click(); await page.waitForLoadState('load', { timeout: 15000 });
- NEVER use context.waitForEvent('page') for any link NOT listed under "New-tab links (target=\\"_blank\\")" in the page structure data.

[TIMEOUT — element not ready] or locator.waitFor / locator.fill / locator.click timeout:
- The selector probably targets an element that does not exist on this page.
- If page structure data is provided, ONLY assert elements that appear in that data. Remove any step targeting elements not in the data.
- For heading assertions: use page.locator('h1').first().waitFor({ state: 'visible', timeout: 30000 }) — do NOT assert specific text.
- For other elements: simplify the selector and increase timeout to 30000ms.
- If the element is genuinely absent from the page structure data, remove that assertion entirely.

[URL REDIRECT TIMEOUT — the URL never changed; the redirect did not happen]:
The redirect never occurred — this is NOT a timeout value problem. Diagnose WHY:

CAUSE 1 — Wrong route navigated to (most common for auth redirect tests):
- The test navigated to a URL like /protected, /secure, /admin, /dashboard-auth etc. that does NOT exist as a registered route in the SPA router.
- FIX: Replace with a real, well-known protected route. Common real routes: /dashboard, /home, /app, /overview, /settings, /projects. Use the page structure data if available.

CAUSE 2 — waitUntil: 'networkidle' blocking on SPAs:
- 'networkidle' waits for ALL network requests to stop, which never happens on apps with polling or WebSocket connections.
- FIX: Replace with waitUntil: 'domcontentloaded'.

CAUSE 3 — Auth state was not fully cleared:
- Double-check the clearing happens BEFORE the protected route navigation, not after.

CAUSE 4 — URL pattern too strict:
- Use a looser regex /\\/login/ rather than an exact path, in case the redirect adds query params.

DO NOT simply increase the timeout. If the redirect isn't happening, a longer timeout will not help.

[URL CHECK FAILED]:
- URL assertion mismatch: use a loose regex matching just a key path fragment.
- Never assert an exact path — the URL may include query params or trailing slashes.

[SELECTOR NOT FOUND]:
- Replace with a broader selector: getByRole() with .first(), or page.locator('a', { hasText: /text/i }).first().

[EMPTY LIST — locator times out because list items do not exist]:
When a test tries to click or assert on items in a list that may be empty (no data loaded yet):
- Signs: locator.waitFor or toBeVisible times out on a list item selector; the page loaded fine but the list has 0 rows.
- FIX: Wait for EITHER the list item OR the empty-state message, then branch:
    const items = page.locator('.item-selector');
    const emptyMsg = page.getByText('No items yet');
    await expect(items.or(emptyMsg)).toBeVisible({ timeout: 15000 });
    const count = await items.count();
    if (count === 0) { await expect(emptyMsg).toBeVisible(); return; }
    await items.first().click();
- Do NOT remove the test — just make it conditional on whether data exists.

[MODAL PANEL — waitForURL timeout after clicking a list item]:
When clicking a row/card opens a modal overlay instead of navigating to a new URL:
- Signs: page.waitForURL or expect(page).toHaveURL() times out after the click; URL in the error is the SAME as the page before the click.
- FIX: Remove the waitForURL entirely. Assert on the modal appearing instead:
    await item.click();
    await expect(page.locator('.modal-backdrop')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.modal-backdrop h2').first()).toBeVisible({ timeout: 10000 });
- Do NOT navigate with page.goto() to try to reach a "detail page" — if a modal appears, there is no separate URL.

[BROWSER CONFIRM DIALOG — action completes but expected state change never happens]:
When a button click triggers a native browser confirm() dialog, Playwright auto-dismisses it (Cancel).
The action never executes, so count/state stays unchanged.
Signs: "Expected count N, got N" or similar — the number before and after are IDENTICAL.
FIX: add page.once('dialog', dialog => dialog.accept()) IMMEDIATELY before the click that triggers the dialog:
  page.once('dialog', dialog => dialog.accept());
  await triggerButton.click();
Do NOT use page.on('dialog', ...) — use page.once() so it only fires for this one dialog.

DYNAMIC COUNT PRESERVATION — CRITICAL:
If the failing test already uses a dynamic count pattern such as:
  const initialCount = await locator.count()
  ...
  await expect(locator).toHaveCount(initialCount - 1, { timeout: 10000 })
PRESERVE this pattern EXACTLY. Do NOT replace initialCount with a hardcoded number.
The count variable is correct — the failure is caused by the LOCATOR returning 0, not by the count logic.
Fix the locator (see TABLE ROW LOCATOR rule below), not the count strategy.

TABLE ROW LOCATOR:
When the error is "Expected 0 to be greater than 0" or "Expected count N, got 0" and the test is asserting table rows:
- NEVER use \`table tbody tr\` — many frontend frameworks render \`<tr>\` directly under \`<table>\` without an explicit \`<tbody>\`
- Use \`table tr:not(:first-child)\` to get data rows while excluding the header row
- OR use \`table tr\` and call \`.filter({ hasNotText: /header_text/ })\` if you can identify the header

GENERAL RULES:
- If page structure data says "Forms: NONE FOUND" — remove ALL form/input/fill steps entirely.
- If page structure data says "Buttons / CTAs: NONE FOUND" — remove all CTA click+navigation tests; only assert visible headings.
- NEVER use context.waitForEvent('page') for any link unless it is explicitly listed under "New-tab links (target=\\"_blank\\")" in the page structure data.
- Use element text and roles DIRECTLY from the provided page structure data.
- Leave all passing tests exactly as they were — only change the failing ones.

Output the COMPLETE corrected JavaScript spec file. No JSON. No markdown fences. No explanations.`,

  refactor_spec: `REFACTOR MODE — make this Playwright test resilient to data changes by replacing hardcoded runtime values with dynamic equivalents. Do not change test logic, structure, or anything unrelated to data-state assumptions.

FIND AND FIX these patterns:

[HARDCODED COUNTS in toHaveCount()]:
Pattern: await expect(locator).toHaveCount(7)
Problem: the literal 7 encodes database state at generation time — breaks when row count differs.
Fix: capture the count before the action, then assert relative change.
IMPORTANT — use the SAME locator the spec already uses for the table rows (do not change it to \`table tbody tr\`).
If there is no existing row locator, use \`table tr:not(:first-child)\` to exclude the header row.
  const rows = page.locator('table tr:not(:first-child)')   // adjust to match existing selector
  const initialCount = await rows.count()
  if (initialCount === 0) throw new Error('No rows found — nothing to delete')
  // ... perform the delete/add action ...
  await expect(rows).toHaveCount(initialCount - 1, { timeout: 10000 })

[nth() CHAINED BEFORE toHaveCount()]:
Pattern: page.locator('x').nth(n) — then toHaveCount(m) is called on it
Problem: nth() narrows to a single element so toHaveCount can only ever be 0 or 1. The count assertion is meaningless.
Fix: remove nth() from the locator used for counting. Use page.locator('x') for counting, and a separate locator with .first() for clicking.

[HARDCODED INDICES assuming specific row position]:
Pattern: clicking .nth(4) or .nth(7) when the intent is "the first available item"
Fix: use .first() instead.

[HARDCODED DYNAMIC CONTENT in assertions]:
Pattern: asserting exact database-generated names, auto-incremented IDs, or generated content that varies per environment
Fix: replace with a regex containing a stable fragment, or remove the assertion if it tests data rather than behaviour.

DO NOT CHANGE:
- Credentials using {{PLACEHOLDER}} syntax — leave exactly as written
- URLs and waitForURL patterns
- Test names, describe blocks, test structure
- Assertions checking UI behaviour: page titles, headings, button labels, navigation structure
- Any selector that uses getByRole/getByLabel/getByText for structural elements

Output the COMPLETE corrected JavaScript spec file. No explanations. No markdown fences.`,

  page_object: `You are a senior Playwright engineer writing TypeScript Page Object Models.
Generate a clean, idiomatic POM class. Rules:
- Use strict TypeScript types (Page, Locator from @playwright/test)
- Expose Locators as readonly properties using getter methods or arrow functions
- Group related locators (navigation, forms, content)
- Include a goto() method that navigates and waits for networkidle
- Include any helper action methods that are clearly useful (e.g. clickNavLink(name))
- No test assertions in the POM — only selectors and actions
- Output ONLY the TypeScript file, no explanation, no markdown code fences`,

  fixture: `You are a senior Playwright engineer writing TypeScript fixture files.
Generate a fixture file using test.extend(). Rules:
- Import test and expect from @playwright/test
- Import the Page Object class from ../pages/\${className}
- Use test.extend<Fixtures>() with proper TypeScript generics
- The fixture should: instantiate the POM, call goto(), use(), then handle any teardown
- Re-export expect from @playwright/test
- If the site has authentication, add an optional authUser fixture stub (commented out)
- Output ONLY the TypeScript file, no explanation, no markdown code fences`,

  typescript_spec: `You are a senior Playwright engineer writing TypeScript test specs.
Generate a production-quality .spec.ts file. Rules:
- Import { test, expect } from the fixture file (not from @playwright/test directly)
- Use test.describe() blocks to group related tests
- Each test uses the fixture via async ({ \${fixtureName} }) => {}
- Write proper assertions with expect() — toHaveTitle, toBeVisible, toHaveURL, toHaveText etc.
- Tests should be independent — no shared mutable state between tests
- Use the POM methods and locators, do NOT use page.locator() directly in tests
- Add test.beforeEach only if genuinely needed for shared setup
- Include descriptive test names that read like specifications
- Output ONLY the TypeScript file, no explanation, no markdown code fences`,

  bug_title: 'You generate concise bug titles.',

  data_per_row_spec: `DATA-DRIVEN (per_row): a \`__row__\` object is available at runtime containing one CSV row. Use \`__row__.<header>\` for form inputs, API payloads, and assertions. Do NOT write loops — Aurora calls this spec once per row.
CSV headers: {HEADERS}
Sample row: {SAMPLE_ROW}`,

  data_loop_spec: `DATA-DRIVEN (loop): \`__csvData__\` (array of row objects) and \`__csvPath__\` are available as globals. Iterate \`__csvData__\` inside one \`test()\` block using a for...of loop.
CSV headers: {HEADERS}
Sample rows (first 3): {SAMPLE_ROWS}`,

  generate_seed_code: `Generate Playwright \`beforeAll\` setup code that seeds a test database from CSV data using Playwright's \`request\` fixture. Iterate the rows and call the appropriate API endpoints. Store created entity IDs in a \`ctx\` object for teardown. Output ONLY the JavaScript function body — no imports, no module.exports, no outer function declaration.
Base URL: {URL}
CSV headers: {HEADERS}
Sample rows: {SAMPLE_ROWS}`
}

let _cache = null

function _load() {
  if (_cache) return _cache
  try {
    const saved = JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'))
    const storedVersion = saved._defaultsVersion || 0
    const priorSnapshot = saved._defaultsSnapshot || {}
    let next = { ...saved }
    let dirty = false

    if (storedVersion < DEFAULTS_VERSION) {
      // Version bump: adopt the new default text only for keys the user hasn't customized
      // via the Settings UI. "Customized" = the saved value no longer matches the default
      // it had the last time this key was synced (tracked per-key in _defaultsSnapshot).
      // The snapshot advances to the new DEFAULTS text either way, so the NEXT bump always
      // compares against the latest default rather than a stale one — an edited prompt still
      // gets flagged as edited on every future bump, it just never gets silently overwritten.
      // Installs upgrading from before _defaultsSnapshot existed have no recorded snapshot for
      // any key yet; fall back to comparing against the current DEFAULTS text, which treats
      // "already matches the newest default" as untouched and errs toward preserving anything
      // else — safer than the old behavior of unconditionally overwriting every key.
      const nextSnapshot = { ...priorSnapshot }
      for (const k of Object.keys(DEFAULTS)) {
        const hadSnapshot = k in priorSnapshot
        const userEdited = hadSnapshot
          ? saved[k] !== priorSnapshot[k]
          : saved[k] !== undefined && saved[k] !== DEFAULTS[k]
        if (!userEdited) next[k] = DEFAULTS[k]
        nextSnapshot[k] = DEFAULTS[k]
      }
      next._defaultsSnapshot = nextSnapshot
      next._defaultsVersion = DEFAULTS_VERSION
      dirty = true
    } else {
      // Hydrate: add any new keys missing from the saved file.
      const missing = Object.keys(DEFAULTS).filter(k => saved[k] === undefined)
      if (missing.length > 0) {
        const nextSnapshot = { ...priorSnapshot }
        for (const k of missing) {
          next[k] = DEFAULTS[k]
          nextSnapshot[k] = DEFAULTS[k]
        }
        next._defaultsSnapshot = nextSnapshot
        next._defaultsVersion = DEFAULTS_VERSION
        dirty = true
      }
    }

    if (dirty) {
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true })
        fs.writeFileSync(PROMPTS_PATH, JSON.stringify(next, null, 2))
      } catch (writeErr) {
        console.warn('[promptService] hydrate write failed:', writeErr.message)
      }
    }
    _cache = next
  } catch {
    _cache = { ...DEFAULTS, _defaultsVersion: DEFAULTS_VERSION, _defaultsSnapshot: { ...DEFAULTS } }
  }
  return _cache
}

// Returns the assembled prompt for AI calls.
// Code-gen keys automatically get base_playwright_rules prepended.
function get(key) {
  const loaded = _load()
  const task = loaded[key] ?? DEFAULTS[key] ?? ''
  if (CODE_GEN_KEYS.has(key)) {
    const baseKey = 'base_playwright_rules'
    const base = loaded[baseKey] ?? DEFAULTS[baseKey] ?? ''
    return base ? `${base}\n\n---\n\n${task}` : task
  }
  return task
}

// Returns raw (unassembled) prompts for the UI editor.
function getAll() {
  const loaded = _load()
  const result = {}
  for (const key of Object.keys(DEFAULTS)) {
    result[key] = loaded[key] ?? DEFAULTS[key]
  }
  return result
}

function save(updates) {
  const current = _load()
  const next = { ...current, ...updates }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(PROMPTS_PATH, JSON.stringify(next, null, 2))
  _cache = next
}

function resetKey(key) {
  const current = _load()
  // Resetting to default also marks the key as "not customized" in the snapshot, so a
  // future DEFAULTS_VERSION bump keeps adopting new default text for it automatically
  // instead of treating the reset value as a permanent customization.
  const nextSnapshot = { ...(current._defaultsSnapshot || {}), [key]: DEFAULTS[key] }
  const next = { ...current, [key]: DEFAULTS[key], _defaultsSnapshot: nextSnapshot }
  fs.writeFileSync(PROMPTS_PATH, JSON.stringify(next, null, 2))
  _cache = next
  return DEFAULTS[key]
}

function resetAll() {
  const next = { ...DEFAULTS, _defaultsVersion: DEFAULTS_VERSION, _defaultsSnapshot: { ...DEFAULTS } }
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(PROMPTS_PATH, JSON.stringify(next, null, 2))
  _cache = next
}

module.exports = { get, getAll, save, resetKey, resetAll, DEFAULTS, CODE_GEN_KEYS }
