// ============================================
// services/trackers/jira.js
// Jira adapter. Supports Jira Cloud (email + API token, REST v3, ADF rich text)
// and Jira Server / Data Center (personal access token, REST v2, wiki text).
// ============================================
const {
  TrackerError, request, basicAuth, trimSlash, adfToText, workItemToRequirements
} = require('./common')

const NAME = 'Jira'

function createJiraAdapter (config, token) {
  const baseUrl = trimSlash(config.baseUrl)
  const deployment = config.deployment === 'server' ? 'server' : 'cloud'
  const api = deployment === 'cloud' ? `${baseUrl}/rest/api/3` : `${baseUrl}/rest/api/2`

  if (!baseUrl) throw new TrackerError('Jira site URL is not set.', 400)
  if (!token) throw new TrackerError('Jira API token is not set.', 400)
  if (deployment === 'cloud' && !config.email) throw new TrackerError('Jira Cloud needs the account email that owns the API token.', 400)

  const auth = deployment === 'cloud' ? basicAuth(config.email, token) : `Bearer ${token}`
  const call = (path, opts = {}) => request(`${api}${path}`, { ...opts, headers: { Authorization: auth }, providerName: NAME })

  const issueUrl = key => `${baseUrl}/browse/${key}`
  const richToText = v => (v && typeof v === 'object' ? adfToText(v) : String(v || ''))

  return {
    provider: 'jira',
    label: NAME,

    async testConnection () {
      const me = await call('/myself')
      return { ok: true, user: me.displayName || me.name || me.emailAddress || 'unknown user' }
    },

    async listProjects () {
      if (deployment === 'cloud') {
        const out = []
        let startAt = 0
        // project/search is paginated; cap at 500 projects.
        for (let page = 0; page < 5; page++) {
          const data = await call(`/project/search?maxResults=100&startAt=${startAt}&orderBy=name`)
          out.push(...(data.values || []))
          if (data.isLast || !(data.values || []).length) break
          startAt += data.values.length
        }
        return out.map(p => ({ key: p.key, name: p.name }))
      }
      const data = await call('/project')
      return (data || []).map(p => ({ key: p.key, name: p.name }))
    },

    /**
     * Fetch stories and turn their acceptance criteria into requirement items.
     * `query` is raw JQL; when empty, open stories in `project` are used.
     */
    async fetchRequirements ({ project, query, limit = 50 }) {
      const jql = (query && query.trim()) ||
        (project
          ? `project = "${String(project).replace(/"/g, '')}" AND issuetype in (Story, Task) AND statusCategory != Done ORDER BY updated DESC`
          : null)
      if (!jql) throw new TrackerError('Choose a project or enter a JQL query.', 400)

      const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
      const fields = ['summary', 'description', 'issuetype']
      if (config.acField) fields.push(config.acField)
      const qs = `jql=${encodeURIComponent(jql)}&maxResults=${max}&fields=${fields.join(',')}`

      // Cloud retired GET /search in favour of /search/jql; Server/DC still uses /search.
      const data = await call(deployment === 'cloud' ? `/search/jql?${qs}` : `/search?${qs}`)
      const issues = data.issues || []

      const items = []
      for (const issue of issues) {
        const f = issue.fields || {}
        items.push(...workItemToRequirements({
          reference: issue.key,
          title: f.summary,
          acceptanceText: config.acField ? richToText(f[config.acField]) : '',
          descriptionText: richToText(f.description)
        }))
      }
      return {
        items,
        sources: issues.map(i => ({ reference: i.key, title: i.fields?.summary || '', url: issueUrl(i.key) }))
      }
    },

    /** Create a ticket for an Aurora bug report. `sections` come from buildBugSections(). */
    async createIssue ({ project, title, sections, labels = [] }) {
      const projectKey = project || config.defaultProject
      if (!projectKey) throw new TrackerError('Set a default Jira project in Settings → Issue Tracker.', 400)

      const description = deployment === 'cloud' ? sectionsToAdf(sections) : sectionsToWiki(sections)
      const body = {
        fields: {
          project: { key: projectKey },
          summary: String(title).slice(0, 250),
          issuetype: { name: config.issueType || 'Bug' },
          description,
          labels: labels.map(l => String(l).replace(/\s+/g, '-'))
        }
      }
      const created = await call('/issue', { method: 'POST', body })
      return { key: created.key, url: issueUrl(created.key) }
    }
  }
}

// ── Description builders ───────────────────────────────────────────────────

function sectionsToAdf (sections) {
  const content = []
  for (const s of sections) {
    if (s.heading) content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: s.heading }] })
    if (s.code) {
      content.push({ type: 'codeBlock', content: [{ type: 'text', text: s.text }] })
    } else {
      for (const para of String(s.text).split('\n').filter(Boolean)) {
        content.push({ type: 'paragraph', content: [{ type: 'text', text: para }] })
      }
    }
  }
  return { type: 'doc', version: 1, content }
}

function sectionsToWiki (sections) {
  return sections.map(s => {
    const head = s.heading ? `h3. ${s.heading}\n` : ''
    return head + (s.code ? `{noformat}\n${s.text}\n{noformat}` : s.text)
  }).join('\n\n')
}

module.exports = { createJiraAdapter, sectionsToAdf, sectionsToWiki }
