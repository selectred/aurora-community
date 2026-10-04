// ============================================
// services/trackers/index.js
// One interface over Jira and Azure DevOps. Every adapter implements:
//   testConnection()                         → { ok, user }
//   listProjects()                           → [{ key, name }]
//   fetchRequirements({ project, query, limit }) → { items: [{ type, text, reference }], sources }
//   createIssue({ project, title, sections, severity, labels }) → { key, url }
// ============================================
const prisma = require('../../lib/prisma')
const { TrackerError, normaliseSeverity } = require('./common')
const { createJiraAdapter } = require('./jira')
const { createAdoAdapter } = require('./ado')

const PROVIDERS = {
  jira: { label: 'Jira', create: createJiraAdapter },
  ado: { label: 'Azure DevOps', create: createAdoAdapter }
}

// Non-secret settings each provider accepts. Anything else in a request is dropped.
const CONFIG_FIELDS = {
  jira: ['baseUrl', 'deployment', 'email', 'defaultProject', 'issueType', 'acField'],
  ado: ['orgUrl', 'defaultProject', 'workItemType']
}

function parseJson (val, fallback) {
  try { return JSON.parse(val || '') } catch { return fallback }
}

function createAdapter (provider, config, token) {
  const entry = PROVIDERS[provider]
  if (!entry) throw new TrackerError('No issue tracker is configured. Set one up in Settings → Issue Tracker.', 400)
  return entry.create(config || {}, token)
}

async function loadTrackerSettings () {
  const settings = await prisma.appSettings.findFirst()
  return {
    settings,
    provider: settings?.trackerProvider || 'none',
    config: parseJson(settings?.trackerConfigJson, {}),
    token: settings?.trackerToken || ''
  }
}

/** Adapter built from saved settings. */
async function getConfiguredAdapter () {
  const { provider, config, token } = await loadTrackerSettings()
  return createAdapter(provider, config, token)
}

function pickConfig (provider, raw = {}) {
  const out = {}
  for (const k of CONFIG_FIELDS[provider] || []) {
    if (raw[k] !== undefined && raw[k] !== null) out[k] = String(raw[k]).trim()
  }
  return out
}

/**
 * Turn an Aurora bug report into provider-neutral description sections.
 * Adapters render these as ADF (Jira Cloud), wiki text (Jira Server) or HTML (ADO).
 */
function buildBugSections (bug) {
  const sections = []
  const facts = [
    `Severity: ${normaliseSeverity(bug.severity)}`,
    `Source: ${bug.source}`,
    bug.spec?.name ? `Test: ${bug.spec.name}` : null,
    bug.spec?.url ? `Target URL: ${bug.spec.url}` : null,
    `Consecutive failures: ${bug.consecutiveFails}`,
    `First failed: ${new Date(bug.firstFailedAt).toISOString()}`,
    `Last failed: ${new Date(bug.lastFailedAt).toISOString()}`
  ].filter(Boolean)
  sections.push({ heading: 'Reported by Aurora', text: facts.join('\n') })
  if (bug.reproSteps) sections.push({ heading: 'Steps to reproduce', text: bug.reproSteps })
  if (bug.errorMessage) sections.push({ heading: 'Error', text: bug.errorMessage, code: true })
  if (bug.stackTrace) sections.push({ heading: 'Stack trace', text: String(bug.stackTrace).slice(0, 8000), code: true })
  if (bug.evidenceDir || bug.screenshotPath) {
    sections.push({
      heading: 'Evidence',
      text: `Screenshots, video and trace are stored on the tester's machine in Aurora (bundle: ${bug.evidenceDir || bug.screenshotPath}). They are not uploaded to the tracker.`
    })
  }
  return sections
}

module.exports = {
  PROVIDERS,
  CONFIG_FIELDS,
  TrackerError,
  createAdapter,
  loadTrackerSettings,
  getConfiguredAdapter,
  pickConfig,
  buildBugSections,
  parseJson
}
