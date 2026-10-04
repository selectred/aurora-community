// Formatting and small helpers shared by the performance pages.
import api, { getApiBaseUrl } from '@/lib/api'

export const MAX_LOCAL_VUS = 20

export function ms (v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
}

export function pct (v, digits = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

export function num (v, digits = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function when (d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function seconds (s) {
  if (typeof s !== 'number' || !Number.isFinite(s)) return '—'
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return r ? `${m}m ${r}s` : `${m}m`
}

export function runLength (run) {
  if (!run?.startedAt) return '—'
  const end = run.finishedAt ? new Date(run.finishedAt) : new Date()
  return seconds((end - new Date(run.startedAt)) / 1000)
}

export function apiError (e, fallback) {
  return e?.response?.data?.message || e?.message || fallback
}

export const STATUS = {
  queued: { label: 'Queued', cls: 'badge-info' },
  running: { label: 'Running', cls: 'badge-primary' },
  passed: { label: 'Passed', cls: 'badge-success' },
  failed: { label: 'Failed', cls: 'badge-danger' },
  error: { label: 'Error', cls: 'badge-warning' },
  cancelled: { label: 'Cancelled', cls: 'badge-info' }
}

export const LOAD_TYPES = [
  { id: 'ramping-vus', label: 'Ramp in stages', hint: 'Users ramp up and down through stages. The usual shape for a load test.' },
  { id: 'constant-vus', label: 'Steady users', hint: 'A fixed number of users loop the journey for the whole duration.' },
  { id: 'constant-arrival-rate', label: 'Steady arrival rate', hint: 'Start journeys at a fixed rate, whatever the response times. Users are allocated as needed, up to the cap.' }
]

export function loadSummary (load) {
  if (!load?.executor) return '—'
  if (load.executor === 'ramping-vus') return `Ramp to ${Math.max(load.startVUs || 0, ...load.stages.map(s => s.target))} users over ${load.stages.length} stage${load.stages.length === 1 ? '' : 's'}`
  if (load.executor === 'constant-vus') return `${load.vus} users for ${load.duration}`
  return `${load.rate} per ${load.timeUnit || '1s'} for ${load.duration} (up to ${load.maxVUs || load.preAllocatedVUs} users)`
}

/** Download k6 through the backend's server-sent events stream. onProgress(pct). */
export async function installK6 (onProgress = () => {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/k6/install`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let error = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()
    for (const chunk of events) {
      const line = chunk.replace(/^data: /, '')
      if (!line.trim()) continue
      const ev = JSON.parse(line)
      if (ev.type === 'progress') onProgress(ev.pct, ev.stage)
      else if (ev.type === 'error') error = ev.message
    }
  }
  if (error) throw new Error(error)
}

export async function k6Status () {
  try { return (await api.get('/api/k6/status')).data } catch { return { installed: false } }
}

export function downloadText (text, filename, type = 'text/javascript') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function slug (s) {
  return String(s || 'load-test').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'load-test'
}
