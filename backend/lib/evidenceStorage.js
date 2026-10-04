'use strict'

/**
 * evidenceStorage.js — Durable, filesystem-backed storage for failure evidence bundles
 * (video/screenshot/trace/report.html/report.pdf).
 *
 * Mirrors packStorage.js's settings-driven-root pattern. The root resolves, in order:
 *   1. AppSettings.evidenceRootDir (explicit override)
 *   2. AURORA_DATA_DIR/evidence     (desktop app data dir — the durable default)
 *   3. ~/aurora-evidence            (dev/non-desktop fallback)
 *
 * This replaces the old hardcoded '/tmp/synthetic-screenshots' path used by the legacy
 * runSpec() code path — /tmp is ephemeral and wrong for a desktop app that needs these
 * artefacts to survive a reboot.
 *
 * Bundle layout (fixed naming convention — no per-file DB columns needed):
 *   <evidenceRoot>/<evidenceDir>/
 *     screenshot.png
 *     replay.webm
 *     trace.zip
 *     report.html
 *     report.pdf   (generated lazily, may not exist yet)
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

const DEFAULT_EVIDENCE_ROOT = path.join(os.homedir(), 'aurora-evidence')

/**
 * Resolve the evidence root directory from AppSettings + environment.
 * @param {object} settings - AppSettings record (or plain object with evidenceRootDir)
 * @returns {string}
 */
function getEvidenceRoot(settings) {
  if (settings?.evidenceRootDir) return settings.evidenceRootDir
  if (process.env.AURORA_DATA_DIR) return path.join(process.env.AURORA_DATA_DIR, 'evidence')
  return DEFAULT_EVIDENCE_ROOT
}

/**
 * Build a bundle folder name: failure-<slug>-<YYYYMMDD-HHmmss>
 * @param {string} testName
 * @param {Date} [date]
 */
function buildBundleName(testName, date = new Date()) {
  const slug = (testName || 'test')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'test'

  const pad = n => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`

  return `failure-${slug}-${stamp}`
}

/**
 * Ensure a bundle's directory exists on disk, returns the absolute path.
 * @param {string} evidenceRoot
 * @param {string} bundleName
 */
async function ensureBundleDir(evidenceRoot, bundleName) {
  const absPath = path.join(evidenceRoot, bundleName)
  await fs.mkdir(absPath, { recursive: true })
  return absPath
}

/**
 * Resolve a bundle's absolute directory path without creating it.
 * @param {string} evidenceRoot
 * @param {string} bundleName
 */
function resolveBundleDir(evidenceRoot, bundleName) {
  return path.join(evidenceRoot, bundleName)
}

/**
 * Delete a bundle directory and everything in it (used when a test that was failing
 * gets re-run and passes, or during retention cleanup). Silent if already gone.
 * @param {string} evidenceRoot
 * @param {string} bundleName
 */
async function deleteBundle(evidenceRoot, bundleName) {
  if (!bundleName) return
  await fs.rm(path.join(evidenceRoot, bundleName), { recursive: true, force: true })
}

/**
 * Walk the evidence root and delete any bundle directory older than retentionDays.
 * Returns the list of deleted bundle names (folder names only) so callers can null out
 * dangling DB references.
 * @param {string} evidenceRoot
 * @param {number} retentionDays
 * @returns {Promise<string[]>}
 */
async function pruneOldBundles(evidenceRoot, retentionDays) {
  if (!retentionDays || retentionDays <= 0) return []

  let entries
  try {
    entries = await fs.readdir(evidenceRoot, { withFileTypes: true })
  } catch {
    return [] // evidence root doesn't exist yet — nothing to prune
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const deleted = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const absPath = path.join(evidenceRoot, entry.name)
    try {
      const stat = await fs.stat(absPath)
      if (stat.mtimeMs < cutoffMs) {
        await fs.rm(absPath, { recursive: true, force: true })
        deleted.push(entry.name)
      }
    } catch {
      // Skip entries we can't stat/delete rather than aborting the whole sweep
    }
  }

  return deleted
}

module.exports = {
  getEvidenceRoot,
  buildBundleName,
  ensureBundleDir,
  resolveBundleDir,
  deleteBundle,
  pruneOldBundles,
  DEFAULT_EVIDENCE_ROOT
}
