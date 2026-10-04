const { chromium } = require('playwright')
const crypto = require('crypto')
const fs = require('fs')

// Use system Chrome when running as a packaged binary (same logic as agentTestRunner)
function findSystemChrome() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  }
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    win32: [
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    linux: [
      '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser', '/usr/bin/chromium',
    ],
  }
  const paths = candidates[process.platform] || []
  return paths.find(p => p && fs.existsSync(p)) || undefined
}


class BrowserSession {
  constructor(id, opts = {}) {
    this.id = id
    this.headed = opts.headed ?? false
    this.browser = null
    this.context = null
    this.page = null
    this.startedAt = Date.now()
    this.lastActivityAt = Date.now()
    this.closed = false
  }

  async start() {
    const executablePath = findSystemChrome()
    this.browser = await chromium.launch({
      headless: !this.headed,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    })
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })
    this.page = await this.context.newPage()
    this._touch()
  }

  _touch() { this.lastActivityAt = Date.now() }

  // ─── Page actions ──────────────────────────────────────────────────

  async navigate(url) {
    this._touch()
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await this._settle()
    return this.observe()
  }

  async click(locatorSpec) {
    this._touch()
    await this._build(locatorSpec).click({ timeout: 15000 })
    await this._settle()
    return this.observe()
  }

  async fill(locatorSpec, value) {
    this._touch()
    const loc = this._build(locatorSpec)
    // fill() sets value and dispatches input event (good for most Vue v-model).
    // If the field stays empty, pressSequentially simulates real keystrokes.
    await loc.fill(value, { timeout: 10000 })
    // Re-check the field got the value; if not, fall back to key-by-key typing
    const actual = await loc.inputValue().catch(() => null)
    if (actual !== null && actual !== value) {
      await loc.clear()
      await loc.pressSequentially(value, { delay: 30 })
    }
    return this.observe()
  }

  async select(locatorSpec, value, index) {
    this._touch()
    const opts = index != null ? { index } : { label: value }
    await this._build(locatorSpec).selectOption(opts, { timeout: 10000 })
    return this.observe()
  }

  async clearAuth() {
    this._touch()
    await this.page.evaluate('try { localStorage.clear() } catch(e) {}; try { sessionStorage.clear() } catch(e) {}')
    await this.context.clearCookies()
    return this.observe()
  }

  async waitForUrl(pattern, timeout = 25000) {
    this._touch()
    await this.page.waitForURL(new RegExp(pattern), { timeout })
    return this.observe()
  }

  async waitForElement(locatorSpec, timeout = 15000) {
    this._touch()
    await this._build(locatorSpec).waitFor({ state: 'visible', timeout })
    return this.observe()
  }

  async assertTitle(pattern) {
    const title = await this.page.title()
    return { pass: new RegExp(pattern, 'i').test(title), actual: title }
  }

  async assertUrl(pattern) {
    const url = this.page.url()
    return { pass: new RegExp(pattern, 'i').test(url), actual: url }
  }

  async assertVisible(locatorSpec) {
    try {
      return { pass: await this._build(locatorSpec).isVisible({ timeout: 5000 }) }
    } catch {
      return { pass: false }
    }
  }

  // ─── Observation ───────────────────────────────────────────────────

  async observe() {
    this._touch()
    const [ariaSnapshot, screenshotBuf, title] = await Promise.all([
      this.page.locator('body').ariaSnapshot().catch(() => null),
      this.page.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null),
      this.page.title().catch(() => '')
    ])
    return {
      url: this.page.url(),
      title,
      ariaText: ariaSnapshot ?? '(no ARIA snapshot available)',
      screenshot: screenshotBuf?.toString('base64') ?? null
    }
  }

  // ─── Locator builder ───────────────────────────────────────────────
  // Converts a structured locator spec (from AI JSON) to a Playwright Locator.
  // Keeps eval out of the picture — all locators are built from typed fields.

  _build(spec) {
    const p = this.page
    if (!spec || typeof spec === 'string') return p.locator(spec)

    switch (spec.type) {
      case 'role': {
        const opts = {}
        if (spec.name)  opts.name  = spec.name
        if (spec.exact !== undefined) opts.exact = spec.exact
        const loc = p.getByRole(spec.role, opts)
        if (spec.nth   != null) return loc.nth(spec.nth)
        if (spec.first)         return loc.first()
        if (spec.last)          return loc.last()
        return loc
      }
      case 'label':
        return p.getByLabel(spec.label, { exact: spec.exact ?? false })
      case 'placeholder':
        return p.getByPlaceholder(spec.placeholder)
      case 'text':
        return p.getByText(spec.text, { exact: spec.exact ?? false })
      case 'testid':
        return p.getByTestId(spec.testId)
      case 'css': {
        let loc = p.locator(spec.selector)
        if (spec.filterText) loc = loc.filter({ hasText: spec.filterText })
        if (spec.nth   != null) return loc.nth(spec.nth)
        if (spec.first)         return loc.first()
        if (spec.last)          return loc.last()
        return loc
      }
      default:
        return p.locator(spec.selector ?? String(spec))
    }
  }

  async _settle() {
    await this.page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────

  async close() {
    if (this.closed) return
    this.closed = true
    try { await this.browser?.close() } catch {}
    this.browser = null
    this.context = null
    this.page = null
  }
}

// ─── Session manager singleton ─────────────────────────────────────────────

class BrowserSessionManager {
  constructor() {
    this.sessions = new Map()
    // GC sessions idle for > 30 min
    setInterval(() => this._gc(), 5 * 60 * 1000)
  }

  async create(opts = {}) {
    const id = crypto.randomUUID()
    const session = new BrowserSession(id, opts)
    this.sessions.set(id, session)
    await session.start()
    return session
  }

  get(id) { return this.sessions.get(id) }

  async destroy(id) {
    const s = this.sessions.get(id)
    if (s) { await s.close(); this.sessions.delete(id) }
  }

  async _gc() {
    const limit = 30 * 60 * 1000
    for (const [id, s] of this.sessions) {
      if (Date.now() - s.lastActivityAt > limit) {
        console.log(`[BrowserSession] GC idle session ${id}`)
        await this.destroy(id)
      }
    }
  }
}

module.exports = new BrowserSessionManager()
