'use strict'

/**
 * packStorage.js — Hybrid DB + Filesystem storage for generated pack code.
 *
 * Decision logic:
 *   - codeStorage = "inline"  → generatedCode column holds the code (default, existing behaviour)
 *   - codeStorage = "file"    → code written to disk under packsRootDir; generatedCode = null
 *
 * The threshold and root directory are read from AppSettings so they can be changed at
 * runtime without a code deploy.
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

const DEFAULT_THRESHOLD = 8192
const DEFAULT_PACKS_ROOT = path.join(os.homedir(), 'aurora-packs')

/**
 * Decide where to store generated code and persist it.
 *
 * @param {string} specId - The spec's specId (used as the directory name on disk)
 * @param {string} code   - The generated Playwright code string
 * @param {object} settings - AppSettings record (or plain object with packsRootDir / packFileSizeThreshold)
 * @returns {{ codeStorage: string, codeFilePath: string|null, generatedCode: string|null }}
 */
async function saveGeneratedCode(specId, code, settings) {
  const threshold = settings?.packFileSizeThreshold ?? DEFAULT_THRESHOLD
  const packsRoot = settings?.packsRootDir || null

  if (threshold > 0 && code.length > threshold && packsRoot) {
    const relPath = `${specId}/index.spec.js`
    const absPath = path.join(packsRoot, relPath)

    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, code, 'utf8')

    return {
      codeStorage: 'file',
      codeFilePath: relPath,
      generatedCode: null
    }
  }

  return {
    codeStorage: 'inline',
    codeFilePath: null,
    generatedCode: code
  }
}

/**
 * Resolve the actual code string for a spec, regardless of storage mode.
 *
 * @param {object} spec         - AgentTestSpec record (needs codeStorage, codeFilePath, generatedCode)
 * @param {string|null} packsRootDir - Configured root dir (from AppSettings)
 * @returns {Promise<string|null>}
 */
async function resolvePackCode(spec, packsRootDir) {
  if (spec.codeStorage === 'file') {
    if (!spec.codeFilePath) return null
    const root = packsRootDir || DEFAULT_PACKS_ROOT
    return await fs.readFile(path.join(root, spec.codeFilePath), 'utf8')
  }
  return spec.generatedCode || null
}

/**
 * Delete the on-disk file for a file-backed spec (silent — no error if already gone).
 *
 * @param {string|null} codeFilePath - Relative path stored on the spec
 * @param {string|null} packsRootDir - Configured root dir
 */
async function deletePackFile(codeFilePath, packsRootDir) {
  if (!codeFilePath) return
  const root = packsRootDir || DEFAULT_PACKS_ROOT
  await fs.rm(path.join(root, codeFilePath), { force: true })
}

/**
 * Check whether a file-backed spec's file is accessible on disk.
 *
 * @param {object} spec
 * @param {string|null} packsRootDir
 * @returns {Promise<boolean>}
 */
async function isPackFileAccessible(spec, packsRootDir) {
  if (spec.codeStorage !== 'file' || !spec.codeFilePath) return true
  const root = packsRootDir || DEFAULT_PACKS_ROOT
  try {
    await fs.access(path.join(root, spec.codeFilePath))
    return true
  } catch {
    return false
  }
}

module.exports = {
  saveGeneratedCode,
  resolvePackCode,
  deletePackFile,
  isPackFileAccessible,
  DEFAULT_THRESHOLD,
  DEFAULT_PACKS_ROOT
}
