'use strict'

/**
 * evidenceReportService.js — builds the self-contained HTML/PDF reports that live
 * inside a failure evidence bundle, plus the consolidated Feature/Initiative report.
 *
 * No templating engine is used — plain JS template strings, matching the rest of the
 * codebase (nothing else in Aurora uses one either). PDF rendering reuses Aurora's own
 * bundled Chromium (see tests/synthetic/config.js's executablePath/args resolution,
 * which transparently picks up PLAYWRIGHT_BROWSERS_PATH/AURORA_RESOURCE_DIR) — no new
 * dependency needed.
 */

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const config = require('../tests/synthetic/config')

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Shared inline CSS — self-contained, no external assets, works offline in any browser.
const BASE_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; margin: 0; padding: 32px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 32px 0 12px; border-bottom: 1px solid #e5e5ef; padding-bottom: 8px; }
  .meta { color: #6b6b80; font-size: 13px; margin-bottom: 24px; }
  .status-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .status-passed, .status-green { background: #e3f9ee; color: #0f9d58; }
  .status-failed, .status-red { background: #fde8e8; color: #d93025; }
  .status-amber { background: #fff4e0; color: #b26a00; }
  .status-gray { background: #f0f0f5; color: #6b6b80; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e5ef; font-size: 13px; }
  th { color: #6b6b80; font-weight: 600; font-size: 12px; text-transform: uppercase; }
  .step-list { list-style: none; padding: 0; margin: 12px 0; }
  .step-list li { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f5; }
  .step-ok::before { content: "✓ "; color: #0f9d58; font-weight: 700; }
  .step-fail::before { content: "✗ "; color: #d93025; font-weight: 700; }
  .error-box { background: #fde8e8; color: #7a1f1f; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin: 12px 0; white-space: pre-wrap; }
  .evidence-media { margin: 16px 0; }
  .evidence-media img { max-width: 100%; border: 1px solid #e5e5ef; border-radius: 8px; display: block; }
  .evidence-media video { max-width: 100%; border-radius: 8px; display: block; }
  .evidence-links { margin: 8px 0 24px; font-size: 13px; }
  .evidence-links a { color: #6c5ce7; text-decoration: none; margin-right: 16px; }
  .test-detail { border: 1px solid #e5e5ef; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
  .test-detail h3 { margin: 0 0 4px; font-size: 15px; }
  .healed-note { color: #6b6b80; font-size: 13px; font-style: italic; margin: 8px 0; }
`

/**
 * Build a self-contained per-test report.html for a single failure evidence bundle.
 *
 * @param {object} opts
 * @param {string} opts.testName
 * @param {string} [opts.featureName]
 * @param {string} [opts.packName]
 * @param {Date|string} [opts.ranAt]
 * @param {{action:string, success:boolean, error?:string}[]} [opts.steps] - coarse step log
 * @param {string} [opts.error] - plain-language failure reason
 * @param {boolean} [opts.hasScreenshot]
 * @param {boolean} [opts.hasVideo]
 * @param {boolean} [opts.hasTrace]
 * @returns {string} HTML document
 */
function buildReportHtml({ testName, featureName, packName, ranAt, steps = [], error, hasScreenshot, hasVideo, hasTrace }) {
  const when = ranAt ? new Date(ranAt).toLocaleString() : new Date().toLocaleString()
  const stepsHtml = steps.length
    ? `<ul class="step-list">${steps.map(s =>
        `<li class="${s.success ? 'step-ok' : 'step-fail'}">${escapeHtml(s.action)}${s.error ? ` — ${escapeHtml(s.error)}` : ''}</li>`
      ).join('')}</ul>`
    : '<p class="meta">No step log captured for this run.</p>'

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(testName)} — Failure Evidence</title>
<style>${BASE_STYLE}</style></head>
<body>
  <h1>${escapeHtml(testName)}</h1>
  <div class="meta">
    ${featureName ? `Feature: ${escapeHtml(featureName)} &middot; ` : ''}${packName ? `Pack: ${escapeHtml(packName)} &middot; ` : ''}Run at ${escapeHtml(when)}
    &middot; <span class="status-pill status-failed">FAILED</span>
  </div>

  ${error ? `<div class="error-box"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}

  ${hasScreenshot || hasVideo ? `<div class="evidence-media">
    ${hasVideo ? `<video controls src="replay.webm" poster="${hasScreenshot ? 'screenshot.png' : ''}"></video>`
               : (hasScreenshot ? `<img src="screenshot.png" alt="Failure screenshot">` : '')}
  </div>` : ''}

  <div class="evidence-links">
    ${hasVideo ? `<a href="replay.webm">Open video replay</a>` : ''}
    ${hasTrace ? `<a href="trace.zip">Download full Playwright trace</a>` : ''}
  </div>

  <h2>Step log</h2>
  ${stepsHtml}
</body></html>`
}

/**
 * Build the consolidated Feature/Initiative report: a headline RAG table followed by
 * one detail section per failing test across every Test Pack in scope. Video is
 * represented as a poster-frame screenshot with a link to open the actual replay file
 * — PDF rendering (see renderPdf) cannot embed truly playable video.
 *
 * @param {object} opts
 * @param {string} opts.scopeName - Feature or Initiative name
 * @param {string} opts.scopeType - "Feature" | "Initiative"
 * @param {{name:string, status:string, passed:number, total:number, healedCount:number}[]} opts.ragRows
 * @param {{testName:string, packName:string, featureName?:string, error:string, steps:object[], evidenceDir?:string, hasScreenshot:boolean, hasVideo:boolean, hasTrace:boolean}[]} opts.failingTests
 * @returns {string} HTML document
 */
function buildFeatureOrInitiativeReportHtml({ scopeName, scopeType, ragRows = [], failingTests = [] }) {
  const generatedAt = new Date().toLocaleString()

  const ragTableRows = ragRows.map(f => `
    <tr>
      <td>${escapeHtml(f.name)}</td>
      <td><span class="status-pill status-${f.status.toLowerCase()}">${escapeHtml(f.status)}</span></td>
      <td>${f.total > 0 ? `${f.passed}/${f.total}` : '—'}</td>
      ${f.healedCount ? `<td class="meta">${f.healedCount} auto-healed</td>` : '<td></td>'}
    </tr>`).join('')

  const detailSections = failingTests.map(t => `
    <div class="test-detail">
      <h3>${escapeHtml(t.testName)}</h3>
      <div class="meta">${t.featureName ? `${escapeHtml(t.featureName)} &middot; ` : ''}Pack: ${escapeHtml(t.packName || '—')}</div>
      ${t.error ? `<div class="error-box">${escapeHtml(t.error)}</div>` : ''}
      ${t.hasScreenshot ? `<div class="evidence-media"><img src="${escapeHtml(t.evidenceDir)}/screenshot.png" alt="Failure screenshot for ${escapeHtml(t.testName)}"></div>` : ''}
      <div class="evidence-links">
        ${t.hasVideo ? `<a href="${escapeHtml(t.evidenceDir)}/replay.webm">Open video replay</a>` : ''}
        ${t.hasTrace ? `<a href="${escapeHtml(t.evidenceDir)}/trace.zip">Download full trace</a>` : ''}
      </div>
      ${(t.steps || []).length ? `<ul class="step-list">${t.steps.map(s =>
        `<li class="${s.success ? 'step-ok' : 'step-fail'}">${escapeHtml(s.action)}${s.error ? ` — ${escapeHtml(s.error)}` : ''}</li>`
      ).join('')}</ul>` : ''}
    </div>`).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(scopeName)} — Test Health Report</title>
<style>${BASE_STYLE}</style></head>
<body>
  <h1>${escapeHtml(scopeName)}</h1>
  <div class="meta">${escapeHtml(scopeType)} test health report &middot; generated ${escapeHtml(generatedAt)}</div>

  <h2>Summary</h2>
  <table>
    <thead><tr><th>Feature</th><th>Status</th><th>Tests</th><th></th></tr></thead>
    <tbody>${ragTableRows || '<tr><td colspan="4" class="meta">No test packs found in scope.</td></tr>'}</tbody>
  </table>

  ${failingTests.length ? `<h2>Failure detail</h2>${detailSections}` : '<p class="healed-note">No unresolved failures — every failing test in scope has since passed or been healer-resolved.</p>'}
</body></html>`
}

/**
 * Render an HTML file to PDF using Aurora's own bundled Chromium.
 * @param {string} htmlAbsPath - absolute path to a local .html file
 * @param {string} outPdfAbsPath - absolute path to write the .pdf to
 */
async function renderPdf(htmlAbsPath, outPdfAbsPath) {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({
    headless: true,
    executablePath: config.browser.executablePath || undefined,
    args: config.browser.args
  })
  try {
    const page = await browser.newPage()
    await page.goto(`file://${htmlAbsPath}`)
    await page.pdf({ path: outPdfAbsPath, format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } })
  } finally {
    await browser.close().catch(() => {})
  }
}

/**
 * Write buildReportHtml()'s output into a bundle directory as report.html.
 * @param {string} bundleDir - absolute bundle directory path
 * @param {object} htmlOpts - passed through to buildReportHtml()
 */
async function writeReportHtml(bundleDir, htmlOpts) {
  const html = buildReportHtml(htmlOpts)
  const outPath = path.join(bundleDir, 'report.html')
  await fs.writeFile(outPath, html, 'utf8')
  return outPath
}

function bundleHasFile(bundleDir, filename) {
  try { return fsSync.existsSync(path.join(bundleDir, filename)) } catch { return false }
}

module.exports = {
  buildReportHtml,
  buildFeatureOrInitiativeReportHtml,
  renderPdf,
  writeReportHtml,
  bundleHasFile,
  escapeHtml
}
