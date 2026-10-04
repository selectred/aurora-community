'use strict'

/**
 * browserSetupService.js — downloads the Playwright browsers Aurora needs directly
 * into the user's own data dir, in-process, with no dependency on npm/npx/node being
 * present on the machine (the packaged app is a `pkg`-compiled binary and has none of
 * those). Runs at setup time (or on-demand from Settings) rather than being baked into
 * the installer — keeps the installer small and lets a future Playwright version bump
 * be resolved by re-running this instead of shipping a new build.
 *
 * Technical note: this reaches into `playwright-core/lib/coreBundle`, an internal (but
 * still `exports`-mapped, so importable) module — the same code Playwright's own `npx
 * playwright install` CLI and its npm postinstall hook call. It works identically when
 * called directly in-process, including inside a packaged pkg binary — verified: the
 * download briefly forks a helper subprocess internally, and pkg transparently handles
 * forking its own bundled scripts. Pinning the `playwright`/`playwright-core` version
 * exactly (see backend/package.json) keeps this internal surface stable between
 * deliberate upgrades.
 */

// `coreBundle.registry` is itself a namespace (Registry class, the `registry` singleton
// instance, installBrowsersForNpmInstall, etc.) — not the singleton directly.
const fs = require('fs')
const registryNamespace = require('playwright-core/lib/coreBundle').registry
const registry = registryNamespace.registry
const { installBrowsersForNpmInstall } = registryNamespace

// Matches Aurora's own actual browser usage (see tests/synthetic/config.js) — headed
// launches use "chromium", headless launches (the default) use "chromium-headless-shell".
// "ffmpeg" is needed for Playwright's video recording (see evidence capture in
// playwrightShimRunner.js).
const REQUIRED_BROWSERS = ['chromium', 'chromium-headless-shell', 'ffmpeg']

/**
 * @returns {{installed: boolean, missing: string[]}}
 */
function checkInstalled() {
  const missing = []
  for (const name of REQUIRED_BROWSERS) {
    const executable = registry.findExecutable(name)
    // executablePath() always returns a theoretical path string, whether or not the
    // file actually exists on disk — must check existence directly.
    const execPath = executable && executable.executablePath()
    if (!execPath || !fs.existsSync(execPath)) missing.push(name)
  }
  return { installed: missing.length === 0, missing }
}

/**
 * Download the required browsers, reporting best-effort progress.
 *
 * Playwright's installer doesn't expose a progress callback — it only writes
 * plain-text percentage lines to stdout (one line per 10% band, once per asset). We
 * intercept process.stdout.write for the duration of the call to parse those lines into
 * structured progress events; if the format ever changes (e.g. a future Playwright
 * version), parsing just silently stops contributing detail — onProgress keeps firing
 * with the current asset name so the UI never looks frozen.
 *
 * @param {(progress: {asset: string, assetIndex: number, totalAssets: number, pct: number|null}) => void} onProgress
 */
async function downloadBrowsers(onProgress) {
  const toInstall = REQUIRED_BROWSERS
  let assetIndex = -1
  let currentAsset = null

  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk, ...args) => {
    const line = String(chunk)

    const downloadingMatch = line.match(/^Downloading ([^(]+) \(playwright ([a-z0-9-]+) /)
    if (downloadingMatch) {
      assetIndex++
      currentAsset = downloadingMatch[1].trim()
      onProgress?.({ asset: currentAsset, assetIndex, totalAssets: toInstall.length, pct: 0 })
    }

    const pctMatch = line.match(/(\d+)%\s+of\s+([\d.]+)\s*MiB/)
    if (pctMatch && currentAsset) {
      onProgress?.({ asset: currentAsset, assetIndex, totalAssets: toInstall.length, pct: Number(pctMatch[1]) })
    }

    // Swallow Playwright's own console output — we've translated it into onProgress
    // events; the raw ASCII progress bars are meaningless in a piped/SSE context.
    return true
  }

  try {
    await installBrowsersForNpmInstall(toInstall)
  } finally {
    process.stdout.write = originalWrite
  }

  onProgress?.({ asset: 'done', assetIndex: toInstall.length, totalAssets: toInstall.length, pct: 100 })
}

module.exports = { checkInstalled, downloadBrowsers, REQUIRED_BROWSERS }
