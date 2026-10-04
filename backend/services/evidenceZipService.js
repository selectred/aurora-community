'use strict'

/**
 * evidenceZipService.js — zips a failure evidence bundle directory for the
 * "Download failure package" button.
 */

const fs = require('fs').promises
const path = require('path')
const JSZip = require('jszip')

const BUNDLE_FILES = ['screenshot.png', 'replay.webm', 'trace.zip', 'report.html', 'report.pdf']

/**
 * Zip whichever of the standard bundle files are actually present in the bundle dir.
 * @param {string} evidenceRoot
 * @param {string} evidenceDir - bundle folder name
 * @returns {Promise<Buffer>}
 */
async function zipBundle(evidenceRoot, evidenceDir) {
  const bundleDir = path.join(evidenceRoot, evidenceDir)
  const zip = new JSZip()
  let addedAny = false

  for (const filename of BUNDLE_FILES) {
    try {
      const content = await fs.readFile(path.join(bundleDir, filename))
      zip.file(filename, content)
      addedAny = true
    } catch {
      // File not present in this bundle (e.g. report.pdf not generated yet) — skip it
    }
  }

  if (!addedAny) {
    throw new Error(`No evidence files found for bundle "${evidenceDir}"`)
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

module.exports = { zipBundle, BUNDLE_FILES }
