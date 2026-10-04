'use strict'
// ============================================
// services/k6/harImport.js
// A HAR file (exported from browser dev tools: Network → "Save all as HAR")
// mapped onto the traffic entries recordingService captures, so the same
// converter turns it into a k6 script. Pure, no I/O.
//
// Used where the recorder can't be: a server-hosted Aurora, or traffic
// captured by someone else.
// ============================================

const KEEP_HEADER = /^(authorization|content-type|accept|x-[a-z0-9-]+|cookie)$/i
const MAX_BODY_CHARS = 256 * 1024
const MAX_ENTRIES = 2000

function headerMap (list) {
  const out = {}
  for (const h of Array.isArray(list) ? list : []) {
    const name = String(h?.name || '').toLowerCase()
    if (!name || name.startsWith(':') || !KEEP_HEADER.test(name)) continue
    out[name] = String(h.value ?? '')
  }
  return out
}

// Chrome and Edge record _resourceType; Firefox and Safari don't, so infer it.
function resourceTypeOf (entry) {
  const rt = String(entry._resourceType || '').toLowerCase()
  if (rt) return rt
  const mime = String(entry.response?.content?.mimeType || '').toLowerCase()
  const accept = (entry.request?.headers || []).find(h => /^accept$/i.test(h.name))?.value || ''
  if (mime.includes('html') || /text\/html/.test(accept)) return 'document'
  if (mime.includes('json') || mime.includes('xml') || entry.request?.method !== 'GET') return 'fetch'
  return 'other'
}

function bodyText (content) {
  if (!content || typeof content.text !== 'string') return null
  if (content.encoding === 'base64') {
    try { return Buffer.from(content.text, 'base64').toString('utf8') } catch { return null }
  }
  return content.text
}

/**
 * @param {object|string} har  parsed HAR or its JSON text
 * @returns {{ traffic, startUrl, pages, skipped }}
 */
function harToTraffic (har) {
  const doc = typeof har === 'string' ? JSON.parse(har) : har
  const log = doc?.log
  if (!log || !Array.isArray(log.entries)) {
    const e = new Error('This is not a HAR file: it has no log.entries')
    e.status = 422
    throw e
  }
  const pageUrl = new Map((log.pages || []).map(p => [p.id, p.title]))
  const entries = log.entries
    .filter(e => e?.request?.url)
    .sort((a, b) => Date.parse(a.startedDateTime) - Date.parse(b.startedDateTime))
    .slice(0, MAX_ENTRIES)

  let currentPage = ''
  const traffic = []
  entries.forEach((e, seq) => {
    const type = resourceTypeOf(e)
    if (type === 'document') currentPage = e.request.url
    const page = (e.pageref && /^https?:/.test(pageUrl.get(e.pageref) || '')) ? pageUrl.get(e.pageref) : (currentPage || e.request.url)
    if (!['document', 'xhr', 'fetch'].includes(type)) return
    const status = Number(e.response?.status) || 0
    const contentType = String(e.response?.content?.mimeType || '')
    let responseJson = null
    if (/json/i.test(contentType)) {
      const text = bodyText(e.response?.content)
      if (text && text.length <= MAX_BODY_CHARS) {
        try { responseJson = JSON.parse(text) } catch { /* not JSON after all */ }
      }
    }
    const postData = typeof e.request.postData?.text === 'string' && e.request.postData.text.length <= MAX_BODY_CHARS
      ? e.request.postData.text
      : null
    const headers = headerMap(e.request.headers)
    if (!headers['content-type'] && e.request.postData?.mimeType) headers['content-type'] = e.request.postData.mimeType
    traffic.push({
      seq,
      ts: Date.parse(e.startedDateTime) || 0,
      page,
      stepIndex: 0,
      method: String(e.request.method || 'GET').toUpperCase(),
      url: e.request.url,
      resourceType: type,
      requestHeaders: headers,
      postData,
      status: status || null,
      responseContentType: contentType,
      responseJson,
      // Chrome marks blocked/aborted requests with status 0 and an _error.
      failure: status === 0 ? (e._error || e.response?._error || 'no response') : null
    })
  })

  const startUrl = traffic.find(t => t.resourceType === 'document')?.url || traffic[0]?.url || ''
  return { traffic, startUrl, pages: (log.pages || []).length, skipped: entries.length - traffic.length }
}

module.exports = { harToTraffic, resourceTypeOf }
