// ============================================
// services/trackers/common.js
// Shared plumbing for issue-tracker adapters (Jira, Azure DevOps):
// HTTP with timeouts and readable errors, rich-text → plain-text conversion,
// and splitting acceptance-criteria text into individual requirement items.
// ============================================

const REQUEST_TIMEOUT_MS = 20000

class TrackerError extends Error {
  constructor (message, status = 502) {
    super(message)
    this.name = 'TrackerError'
    this.status = status
  }
}

function explainStatus (status, providerName) {
  if (status === 401) return `${providerName} rejected the credentials. Check the email/username and token.`
  if (status === 403) return `${providerName} denied access. The token may lack permission for this project.`
  if (status === 404) return `${providerName} returned "not found". Check the URL and project.`
  if (status === 429) return `${providerName} is rate-limiting requests. Try again in a minute.`
  return null
}

/**
 * fetch() wrapper: JSON in/out, timeout, and errors that tell the user what to fix.
 * Returns parsed JSON (or null for empty bodies).
 */
async function request (url, { method = 'GET', headers = {}, body, providerName = 'The tracker', contentType = 'application/json' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': contentType } : {}),
        ...headers
      },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: controller.signal,
      redirect: 'follow'
    })
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timed out' : (err.cause?.code || err.message)
    throw new TrackerError(`Could not reach ${providerName} at ${new URL(url).origin} (${reason}).`, 502)
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }

  if (!res.ok) {
    const detail = extractErrorDetail(data) || (text && !data ? text.slice(0, 200) : '')
    const hint = explainStatus(res.status, providerName)
    const message = [hint || `${providerName} returned HTTP ${res.status}.`, detail].filter(Boolean).join(' ')
    // Surface auth problems as 400 to the UI (the user must fix settings), keep others as 502.
    throw new TrackerError(message, [401, 403, 404].includes(res.status) ? 400 : 502)
  }
  // A login page instead of JSON usually means the URL points at the web UI, not the API.
  if (text && data === null) {
    throw new TrackerError(`${providerName} did not return JSON. Check the base URL.`, 400)
  }
  return data
}

function extractErrorDetail (data) {
  if (!data || typeof data !== 'object') return ''
  if (Array.isArray(data.errorMessages) && data.errorMessages.length) return data.errorMessages.join('; ')
  if (data.errors && typeof data.errors === 'object') {
    const vals = Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`)
    if (vals.length) return vals.join('; ')
  }
  if (typeof data.message === 'string') return data.message
  return ''
}

function basicAuth (user, secret) {
  return 'Basic ' + Buffer.from(`${user}:${secret}`).toString('base64')
}

function trimSlash (url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

// ── Rich text → plain text ─────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }

/** Azure DevOps stores descriptions and acceptance criteria as HTML. */
function htmlToText (html) {
  if (!html) return ''
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|tr|ul|ol)\s*>/gi, '\n')
    .replace(/<\s*h([1-6])[^>]*>/gi, '\n# ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(parseInt(e.slice(1), 10)) : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Jira Cloud (API v3) returns rich text as Atlassian Document Format; Server returns wiki text. */
function adfToText (node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const walk = (n) => {
    if (!n) return ''
    if (n.type === 'text') return n.text || ''
    if (n.type === 'hardBreak') return '\n'
    const inner = (n.content || []).map(walk).join('')
    switch (n.type) {
      case 'heading': return `\n# ${inner}\n`
      case 'paragraph': return `${inner}\n`
      case 'listItem': return `- ${inner.trim()}\n`
      case 'bulletList':
      case 'orderedList': return `${inner}\n`
      case 'codeBlock': return `${inner}\n`
      default: return inner
    }
  }
  return walk(node).replace(/\n{3,}/g, '\n\n').trim()
}

// ── Plain text → requirement items ─────────────────────────────────────────

const GHERKIN_START = /^(given|when|then|and|but)\b/i
const AC_HEADING = /^(#+\s*|h\d\.\s*|\*+)?\s*acceptance\s+criteria\s*:?\s*\**\s*$/i
const ANY_HEADING = /^(#+\s+|h\d\.\s+)\S/i

/**
 * Pull the "Acceptance Criteria" section out of a free-text description:
 * everything after a line that says "Acceptance criteria" until the next heading.
 * Returns '' when the description has no such section.
 */
function extractAcSection (text) {
  const lines = String(text || '').split('\n')
  const start = lines.findIndex(l => AC_HEADING.test(l.trim()))
  if (start === -1) return ''
  const out = []
  for (const line of lines.slice(start + 1)) {
    if (ANY_HEADING.test(line.trim())) break
    out.push(line)
  }
  return out.join('\n').trim()
}

/**
 * Split acceptance-criteria text into one item per criterion.
 * Bullets and numbered lines become separate items; consecutive Given/When/Then/And
 * lines are kept together as one scenario so the EARS check sees trigger + response.
 */
function splitCriteria (text) {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim()
      .replace(/^[-*•·]\s+/, '')
      .replace(/^\(?\d+[.)]\s+/, '')
      .replace(/^AC\s*\d*\s*[:.-]\s*/i, '')
      .replace(/^scenario( outline)?\s*:\s*/i, '')
      .trim())
    .filter(Boolean)

  const items = []
  let scenario = []
  const flush = () => { if (scenario.length) { items.push(scenario.join(' ')); scenario = [] } }
  for (const line of lines) {
    if (GHERKIN_START.test(line)) {
      // A new "Given" starts a new scenario; When/Then/And continue the current one.
      if (/^given\b/i.test(line)) flush()
      scenario.push(line)
    } else {
      flush()
      items.push(line)
    }
  }
  flush()
  return items
}

/**
 * Turn one tracker work item into requirement items for the ambiguity gate.
 * Stories with acceptance criteria yield one AC item per criterion. Stories without
 * any yield a single "User Story" item, which the gate will score low — a story with
 * no acceptance criteria is exactly what the gate should surface.
 */
function workItemToRequirements ({ reference, title, acceptanceText, descriptionText }) {
  const acText = acceptanceText || extractAcSection(descriptionText)
  const criteria = splitCriteria(acText)
  if (criteria.length) {
    return criteria.map(text => ({ type: 'AC', text, reference }))
  }
  const summary = [title, (descriptionText || '').split('\n').filter(Boolean).slice(0, 3).join(' ')]
    .filter(Boolean).join(' — ').slice(0, 600)
  return [{ type: 'User Story', text: summary || title || reference, reference }]
}

const SEVERITIES = ['critical', 'high', 'medium', 'low']

function normaliseSeverity (s) {
  return SEVERITIES.includes(String(s).toLowerCase()) ? String(s).toLowerCase() : 'medium'
}

module.exports = {
  TrackerError,
  request,
  basicAuth,
  trimSlash,
  htmlToText,
  adfToText,
  extractAcSection,
  splitCriteria,
  workItemToRequirements,
  normaliseSeverity
}
