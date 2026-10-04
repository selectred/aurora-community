'use strict'
const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')
const crypto = require('crypto')

// Strip markdown link syntax from URLs that the AI embeds in code
// e.g. "https://[https://example.com](https://example.com)" → "https://example.com"
function sanitizeSpecCode(code) {
  return code
    .replace(/https?:\/\/\[[^\]]*\]\((https?:\/\/[^)'"]+)\)/g, '$1')
    .replace(/\[[^\]]*\]\((https?:\/\/[^)'"]+)\)/g, '$1')
}

// Load a spec from a uniquely-named temp file so require() never returns a cached version
function loadFreshSpec(code) {
  const specFile = path.join(os.tmpdir(), `aurora-spec-${Date.now()}-${Math.random().toString(36).slice(2)}.js`)
  fs.writeFileSync(specFile, code)
  try {
    return require(specFile)
  } finally {
    try { fs.unlinkSync(specFile) } catch {}
  }
}

// Shared expect shim — intercepts expect() calls in specs written against Playwright's
// test-runner API, so they run without the real @playwright/test package installed.
function makeShimExpect(subject) {
  const hasWaitFor = typeof subject?.waitFor === 'function'
  const hasWaitForURL = typeof subject?.waitForURL === 'function'
  const hasTitle = typeof subject?.title === 'function'
  const hasURL = typeof subject?.url === 'function'
  const hasCount = typeof subject?.count === 'function'
  return {
    toBeVisible: async (opts = {}) => {
      if (hasWaitFor) await subject.waitFor({ state: 'visible', timeout: opts?.timeout || 10000 })
    },
    toBeHidden: async (opts = {}) => {
      if (hasWaitFor) await subject.waitFor({ state: 'hidden', timeout: opts?.timeout || 5000 })
    },
    toHaveURL: async (pattern, opts = {}) => {
      if (hasWaitForURL) await subject.waitForURL(pattern, { timeout: opts?.timeout || 10000 })
    },
    toHaveTitle: async (pattern, opts = {}) => {
      if (hasTitle) {
        const title = await subject.title()
        const ok = pattern instanceof RegExp ? pattern.test(title) : title.includes(String(pattern))
        if (!ok) throw new Error(`Expected title "${title}" to match ${pattern}`)
      }
    },
    toHaveText: async () => {
      if (hasWaitFor) await subject.waitFor({ state: 'visible', timeout: 10000 })
    },
    toHaveCount: async (count, opts = {}) => {
      if (!hasCount) return
      const deadline = Date.now() + (opts?.timeout || 5000)
      while (true) {
        const actual = await subject.count()
        if (actual === count) return
        if (Date.now() >= deadline) throw new Error(`Expected count ${count}, got ${actual}`)
        await new Promise(r => setTimeout(r, 200))
      }
    },
    toBeGreaterThan: (n) => {
      if (typeof subject !== 'number') throw new Error(`toBeGreaterThan expects a number, got ${typeof subject}`)
      if (!(subject > n)) throw new Error(`Expected ${subject} to be greater than ${n}`)
    },
    toBeGreaterThanOrEqual: (n) => {
      if (typeof subject !== 'number') throw new Error(`toBeGreaterThanOrEqual expects a number, got ${typeof subject}`)
      if (!(subject >= n)) throw new Error(`Expected ${subject} to be >= ${n}`)
    },
    toBeLessThan: (n) => {
      if (typeof subject !== 'number') throw new Error(`toBeLessThan expects a number, got ${typeof subject}`)
      if (!(subject < n)) throw new Error(`Expected ${subject} to be less than ${n}`)
    },
    resolves: { toBeOk: async () => {} },
    not: {
      toBeVisible: async (opts = {}) => {
        if (hasWaitFor) await subject.waitFor({ state: 'hidden', timeout: opts?.timeout || 5000 })
      },
      toHaveURL: async (pattern) => {
        const current = hasURL ? subject.url() : ''
        const matched = pattern instanceof RegExp ? pattern.test(current) : current.includes(String(pattern))
        if (matched) throw new Error(`Expected URL not to match ${pattern}, but got ${current}`)
      },
      toHaveTitle: async (pattern) => {
        if (hasTitle) {
          const title = await subject.title()
          const ok = pattern instanceof RegExp ? pattern.test(title) : title.includes(String(pattern))
          if (ok) throw new Error(`Expected title not to match ${pattern}, but got "${title}"`)
        }
      },
      toBeEnabled: async () => {},
      toBeChecked: async () => {},
      toBeHidden: async () => {}
    }
  }
}

// Discard a per-test video recording directory — used both when a test passes (no
// artefact wanted) and when a test fails but a bundle was already captured earlier in
// this same run (see the "first failing test() block only" note below).
async function discardVideoDir(videoDir) {
  if (!videoDir) return
  try { await fsp.rm(videoDir, { recursive: true, force: true }) } catch {}
}

// Move whatever single video file Playwright wrote into videoDir into the permanent
// bundle directory as replay.webm. Playwright only exposes the final filename once the
// context has closed, so recording into a unique per-test temp dir and listing it
// afterwards is the reliable way to find it (no path-timing races with page.video()).
async function moveVideoIntoBundle(videoDir, bundleDir) {
  try {
    const files = await fsp.readdir(videoDir)
    const videoFile = files.find(f => f.endsWith('.webm'))
    if (videoFile) {
      await fsp.rename(path.join(videoDir, videoFile), path.join(bundleDir, 'replay.webm'))
    }
  } catch {
    // Non-fatal — the rest of the bundle (screenshot, trace, report) is still useful
    // without a video if this fails for any reason.
  } finally {
    await discardVideoDir(videoDir)
  }
}

// Runs LLM-generated Playwright spec code against a real browser, without the real
// @playwright/test package installed. Handles both export styles the AI produces:
//   - "module.exports = async function(browser, report) {...}" → called directly
//   - "test.describe()/test()" → require('@playwright/test') is intercepted via
//     Module._load, each registered test() is executed against a fresh context/page
// Returns a results array of { title, ok, error, errorLine, failureAriaSnapshot, evidenceDir }.
//
// `evidence` (optional): { enabled, evidenceRoot, bundleName } — when enabled, every
// test() block records video + a Playwright trace; on failure they're saved into
// <evidenceRoot>/<bundleName>/ (screenshot.png, replay.webm, trace.zip); on pass they're
// discarded (no artefacts for passing tests, per the failure-reporting design principle).
// Only the FIRST failing test() block in a run gets its evidence saved — a documented
// limitation given Aurora's one-TestResult-per-run data model (multi-test() specs are
// rare; the AI generation prompt conventionally produces one test() per spec).
// Evidence capture is NOT supported for the "new format" (exported function) branch
// below, since context creation happens inside AI-generated code Aurora has no hook into.
async function runGeneratedSpec(code, browser, { onLog, evidence } = {}) {
  const cleanCode = sanitizeSpecCode(code || '')
  const registeredTests = []

  const shimTest = (name, fn) => { registeredTests.push({ name, fn }) }
  shimTest.describe = (name, fn) => { fn() }
  shimTest.beforeEach = () => {}
  shimTest.afterEach = () => {}
  shimTest.use = () => {}
  shimTest.skip = (name) => { registeredTests.push({ name, fn: null, skip: true }) }

  const Module = require('module')
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === '@playwright/test' || request === 'playwright/test') {
      return { test: shimTest, expect: makeShimExpect }
    }
    return originalLoad.apply(this, arguments)
  }
  global.expect = makeShimExpect

  let specModule
  try {
    specModule = loadFreshSpec(cleanCode)
  } finally {
    Module._load = originalLoad
    delete global.expect
  }

  // Detect export style: module.exports = fn, exports.runTests = fn, or { default: fn }
  const testFn = typeof specModule === 'function' ? specModule
    : typeof specModule?.runTests === 'function' ? specModule.runTests
    : typeof specModule?.default === 'function' ? specModule.default
    : null

  if (testFn) {
    // New format: exported async function(browser, report) → returns results[] directly
    const raw = await testFn(browser, onLog || (() => {}))
    if (!Array.isArray(raw) && onLog) {
      onLog('[Debug] Spec returned no results array — missing "return results;"')
    }
    return Array.isArray(raw) ? raw : []
  }

  // Old format: test.describe()/test() calls registered tests in shimTest during require()
  if (onLog && registeredTests.length === 0) {
    onLog('[Debug] No tests registered — spec did not call test() or test.describe()')
  }

  const evidenceEnabled = !!evidence?.enabled
  let bundleCaptured = false // only the first failing test() block gets its evidence saved

  const results = []
  for (const { name, fn, skip } of registeredTests) {
    if (skip || !fn) { results.push({ title: name, ok: true }); continue }
    let page, context, videoDir

    try {
      const contextOpts = {}
      if (evidenceEnabled) {
        videoDir = path.join(os.tmpdir(), `aurora-video-${crypto.randomUUID()}`)
        await fsp.mkdir(videoDir, { recursive: true })
        contextOpts.recordVideo = { dir: videoDir, size: { width: 1280, height: 720 } }
      }

      context = await browser.newContext(contextOpts)
      if (evidenceEnabled) {
        try { await context.tracing.start({ screenshots: true, snapshots: true }) } catch {}
      }

      page = await context.newPage()
      if (onLog) onLog(`Running: ${name}`)
      await fn({ page, expect: makeShimExpect, browser, context })

      if (evidenceEnabled) {
        try { await context.tracing.stop() } catch {} // no path → trace discarded (test passed)
      }
      await context.close()
      if (evidenceEnabled) await discardVideoDir(videoDir)
      results.push({ title: name, ok: true })
    } catch (e) {
      // Capture ARIA snapshot and failure screenshot at the exact point of failure,
      // before closing the context (page must still be attached for both).
      let failureAriaSnapshot = null
      let evidenceDir = null
      const captureThisFailure = evidenceEnabled && !bundleCaptured

      if (page) {
        try { failureAriaSnapshot = await page.ariaSnapshot() } catch {}

        if (captureThisFailure) {
          try {
            bundleCaptured = true
            evidenceDir = evidence.bundleName
            const bundleDir = await require('../lib/evidenceStorage').ensureBundleDir(evidence.evidenceRoot, evidence.bundleName)
            try { await page.screenshot({ path: path.join(bundleDir, 'screenshot.png'), fullPage: true }) } catch {}
            try { await context.tracing.stop({ path: path.join(bundleDir, 'trace.zip') }) } catch {}
            await moveVideoIntoBundle(videoDir, bundleDir)
            videoDir = null // already handled above
          } catch {
            evidenceDir = null // bundle write failed — don't advertise a broken evidenceDir
          }
        }
      }

      if (evidenceEnabled && !captureThisFailure) {
        // A bundle was already captured by an earlier failing test() block this run —
        // discard this one's recording/trace rather than overwriting or duplicating it.
        try { await context.tracing.stop() } catch {}
      }

      if (context) try { await context.close() } catch {}
      if (evidenceEnabled) await discardVideoDir(videoDir)

      // Extract line number from the stack trace (references the temp file)
      const lineMatch = e.stack?.match(/aurora-spec-[^:]+:(\d+):\d+/)
      const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null
      results.push({ title: name, ok: false, error: e.message.split('\n')[0], errorLine, failureAriaSnapshot, evidenceDir })
    }
  }
  return results
}

module.exports = { sanitizeSpecCode, loadFreshSpec, makeShimExpect, runGeneratedSpec }
