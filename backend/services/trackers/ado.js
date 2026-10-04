// ============================================
// services/trackers/ado.js
// Azure DevOps adapter (Services and Server). Personal access token over Basic auth,
// WIQL for queries, JSON Patch for work-item creation.
// ============================================
const {
  TrackerError, request, basicAuth, trimSlash, htmlToText, workItemToRequirements
} = require('./common')

const NAME = 'Azure DevOps'
const API_VERSION = '7.1'
const STORY_TYPES = ['User Story', 'Product Backlog Item', 'Requirement', 'Issue']
const AC_FIELD = 'Microsoft.VSTS.Common.AcceptanceCriteria'
const ADO_SEVERITY = { critical: '1 - Critical', high: '2 - High', medium: '3 - Medium', low: '4 - Low' }

function createAdoAdapter (config, token) {
  const orgUrl = trimSlash(config.orgUrl)
  if (!orgUrl) throw new TrackerError('Azure DevOps organisation URL is not set.', 400)
  if (!token) throw new TrackerError('Azure DevOps personal access token is not set.', 400)

  const auth = basicAuth('', token)
  const call = (path, opts = {}) => request(`${orgUrl}${path}`, { ...opts, headers: { Authorization: auth }, providerName: NAME })
  const enc = s => encodeURIComponent(s)
  const itemUrl = (project, id) => `${orgUrl}/${enc(project)}/_workitems/edit/${id}`

  return {
    provider: 'ado',
    label: NAME,

    async testConnection () {
      const data = await call(`/_apis/projects?$top=1&api-version=${API_VERSION}`)
      // connectionData names the user but is a preview API; treat it as optional.
      let user = null
      try {
        const cd = await call(`/_apis/connectionData?api-version=${API_VERSION}-preview`)
        user = cd?.authenticatedUser?.providerDisplayName || null
      } catch { /* optional */ }
      return { ok: true, user: user || `${data.count ?? 0}+ project(s) visible` }
    },

    async listProjects () {
      const data = await call(`/_apis/projects?$top=500&api-version=${API_VERSION}`)
      return (data.value || []).map(p => ({ key: p.name, name: p.name })).sort((a, b) => a.name.localeCompare(b.name))
    },

    /**
     * `query` is raw WIQL (must select [System.Id]); when empty, open story-type
     * work items in `project` are used.
     */
    async fetchRequirements ({ project, query, limit = 50 }) {
      const proj = project || config.defaultProject
      if (!proj) throw new TrackerError('Choose an Azure DevOps project.', 400)
      const max = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
      const types = STORY_TYPES.map(t => `'${t}'`).join(', ')
      const wiql = (query && query.trim()) ||
        `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
        `AND [System.WorkItemType] IN (${types}) ` +
        `AND [System.State] NOT IN ('Closed', 'Done', 'Removed', 'Resolved') ORDER BY [System.ChangedDate] DESC`

      const result = await call(`/${enc(proj)}/_apis/wit/wiql?$top=${max}&api-version=${API_VERSION}`, { method: 'POST', body: { query: wiql } })
      // Flat queries return workItems; link queries return workItemRelations.
      const refs = result.workItems || (result.workItemRelations || []).map(r => r.target).filter(Boolean)
      const ids = [...new Set(refs.map(w => w.id))].slice(0, max)
      if (!ids.length) return { items: [], sources: [] }

      const fields = ['System.Id', 'System.Title', 'System.WorkItemType', 'System.Description', AC_FIELD].join(',')
      const data = await call(`/${enc(proj)}/_apis/wit/workitems?ids=${ids.join(',')}&fields=${fields}&errorPolicy=Omit&api-version=${API_VERSION}`)
      const workItems = (data.value || []).filter(Boolean)

      const items = []
      for (const wi of workItems) {
        const f = wi.fields || {}
        items.push(...workItemToRequirements({
          reference: `#${wi.id}`,
          title: f['System.Title'],
          acceptanceText: htmlToText(f[AC_FIELD]),
          descriptionText: htmlToText(f['System.Description'])
        }))
      }
      return {
        items,
        sources: workItems.map(wi => ({ reference: `#${wi.id}`, title: wi.fields?.['System.Title'] || '', url: itemUrl(proj, wi.id) }))
      }
    },

    async createIssue ({ project, title, sections, severity = 'medium', labels = [] }) {
      const proj = project || config.defaultProject
      if (!proj) throw new TrackerError('Set a default Azure DevOps project in Settings → Issue Tracker.', 400)
      const type = config.workItemType || 'Bug'
      const html = sectionsToHtml(sections)

      const ops = [{ op: 'add', path: '/fields/System.Title', value: String(title).slice(0, 255) }]
      if (type === 'Bug') {
        // Bug is the only standard type with Repro Steps and Severity fields.
        ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.TCM.ReproSteps', value: html })
        ops.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.Severity', value: ADO_SEVERITY[severity] || ADO_SEVERITY.medium })
      } else {
        ops.push({ op: 'add', path: '/fields/System.Description', value: html })
      }
      if (labels.length) ops.push({ op: 'add', path: '/fields/System.Tags', value: labels.join('; ') })

      const created = await call(
        `/${enc(proj)}/_apis/wit/workitems/$${enc(type)}?api-version=${API_VERSION}`,
        { method: 'POST', body: ops, contentType: 'application/json-patch+json' }
      )
      return { key: String(created.id), url: itemUrl(proj, created.id) }
    }
  }
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function sectionsToHtml (sections) {
  return sections.map(s => {
    const head = s.heading ? `<h3>${esc(s.heading)}</h3>` : ''
    const body = s.code
      ? `<pre>${esc(s.text)}</pre>`
      : String(s.text).split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')
    return head + body
  }).join('')
}

module.exports = { createAdoAdapter, sectionsToHtml }
