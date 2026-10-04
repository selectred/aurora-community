<template>
  <div class="space-y-6" data-testid="page-bug-reports">
    <!-- Summary Bar -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 border border-danger/20">
        <span class="w-2 h-2 rounded-full bg-danger inline-block"></span>
        <span class="text-sm font-semibold text-danger">{{ summary.byStatus?.open ?? 0 }} Open</span>
      </div>
      <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/10 border border-warning/20">
        <span class="w-2 h-2 rounded-full bg-warning inline-block"></span>
        <span class="text-sm font-semibold text-warning">{{ summary.byStatus?.['in-progress'] ?? 0 }} In Progress</span>
      </div>
      <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-success/10 border border-success/20">
        <span class="w-2 h-2 rounded-full bg-success inline-block"></span>
        <span class="text-sm font-semibold text-success">{{ summary.byStatus?.resolved ?? 0 }} Resolved</span>
      </div>
      <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 border border-default">
        <span class="w-2 h-2 rounded-full bg-muted inline-block"></span>
        <span class="text-sm font-semibold text-muted">{{ summary.byStatus?.['wont-fix'] ?? 0 }} Won't Fix</span>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button @click="refresh" class="btn btn-secondary" :disabled="loading">
          <RefreshCw :size="16" :class="loading ? 'animate-spin' : ''" />
          Refresh
        </button>
        <button
          v-if="bugReports.length > 0"
          @click="confirmClearAll"
          class="btn btn-secondary text-danger hover:bg-danger/10 border-danger/30"
        >
          <Trash2 :size="16" />
          Clear {{ filters.status || filters.severity || filters.source ? 'Filtered' : 'All' }} ({{ bugReports.length }})
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label class="text-sm text-muted">Status</label>
        <select v-model="filters.status" @change="fetchBugReports" class="form-input py-1.5 text-sm">
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="wont-fix">Won't Fix</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-sm text-muted">Severity</label>
        <select v-model="filters.severity" @change="fetchBugReports" class="form-input py-1.5 text-sm">
          <option value="">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-sm text-muted">Source</label>
        <select v-model="filters.source" @change="fetchBugReports" class="form-input py-1.5 text-sm">
          <option value="">All</option>
          <option value="synthetic">Synthetic</option>
          <option value="pack">Pack</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <span class="text-sm text-muted ml-auto">{{ bugReports.length }} result{{ bugReports.length !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Table -->
    <div class="card">
      <div v-if="loading" class="flex items-center justify-center py-16 text-muted gap-2">
        <Loader2 :size="20" class="animate-spin" />
        <span>Loading bug reports...</span>
      </div>
      <div v-else-if="bugReports.length === 0" class="flex flex-col items-center justify-center py-16 text-muted gap-2">
        <Bug :size="36" class="opacity-30" />
        <p class="text-sm">No bug reports found</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default">
              <th class="text-left px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Title</th>
              <th class="text-left px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Severity</th>
              <th class="text-left px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Source</th>
              <th class="text-center px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Fails</th>
              <th class="text-left px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Last Failed</th>
              <th class="text-left px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Status</th>
              <th class="text-right px-4 py-3 text-label text-label-color font-semibold uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="bug in bugReports"
              :key="bug.id"
              class="border-b border-default hover:bg-surface-2 transition-colors"
            >
              <td class="px-4 py-3">
                <button @click="openDetail(bug)" class="text-left text-heading font-medium hover:text-primary transition-colors line-clamp-1">
                  {{ bug.title }}
                </button>
                <p v-if="bug.spec || bug.trackerKey" class="text-xs text-muted mt-0.5 flex items-center gap-2">
                  <span v-if="bug.spec">{{ bug.spec.name }}</span>
                  <a v-if="bug.trackerKey" :href="bug.trackerUrl" target="_blank" rel="noopener" class="badge badge-primary" :title="`Open ${bug.trackerKey} in ${tracker.label || 'the tracker'}`">{{ bug.trackerKey }}</a>
                </p>
              </td>
              <td class="px-4 py-3">
                <span :class="severityClass(bug.severity)" class="badge">{{ bug.severity }}</span>
              </td>
              <td class="px-4 py-3">
                <span :class="sourceClass(bug.source)" class="badge">{{ bug.source }}</span>
              </td>
              <td class="px-4 py-3 text-center">
                <span :class="bug.consecutiveFails > 1 ? 'text-danger font-semibold' : 'text-muted'">
                  {{ bug.consecutiveFails }}
                </span>
              </td>
              <td class="px-4 py-3 text-muted whitespace-nowrap">{{ formatDate(bug.lastFailedAt) }}</td>
              <td class="px-4 py-3">
                <select
                  :value="bug.status"
                  @change="updateStatus(bug, $event.target.value)"
                  class="form-input py-1 text-xs"
                >
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="wont-fix">Won't Fix</option>
                </select>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openDetail(bug)" class="btn btn-icon btn-secondary" title="View detail">
                    <Eye :size="15" />
                  </button>
                  <button @click="confirmDelete(bug)" class="btn btn-icon btn-secondary text-danger hover:bg-danger/10" title="Dismiss">
                    <Trash2 :size="15" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="selectedBug" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50" @click="selectedBug = null" />
        <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10">
          <div class="flex items-start justify-between p-6 border-b border-default">
            <div class="flex-1 min-w-0 pr-4">
              <h3 class="text-lg font-semibold text-heading">{{ selectedBug.title }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span :class="severityClass(selectedBug.severity)" class="badge">{{ selectedBug.severity }}</span>
                <span :class="sourceClass(selectedBug.source)" class="badge">{{ selectedBug.source }}</span>
                <span class="text-xs text-muted">{{ selectedBug.consecutiveFails }} consecutive fail{{ selectedBug.consecutiveFails !== 1 ? 's' : '' }}</span>
              </div>
            </div>
            <button @click="selectedBug = null" class="btn btn-icon btn-secondary shrink-0">
              <X :size="18" />
            </button>
          </div>

          <div class="p-6 space-y-5">
            <!-- Linked spec -->
            <div v-if="selectedBug.spec" class="flex items-center gap-2 text-sm">
              <span class="text-muted">Spec:</span>
              <span class="font-medium text-heading">{{ selectedBug.spec.name }}</span>
              <button
                v-if="selectedBug.spec && ['open', 'in-progress'].includes(selectedBug.status)"
                @click="triggerHeal(selectedBug)"
                :disabled="healing"
                class="btn btn-secondary ml-auto text-xs py-1"
              >
                <Loader2 v-if="healing" :size="13" class="animate-spin" />
                <Zap v-else :size="13" />
                {{ healing ? 'Healing...' : 'Trigger Heal' }}
              </button>
            </div>

            <!-- Issue tracker -->
            <div class="flex items-center gap-2 text-sm" data-testid="bug-tracker-row">
              <span class="text-muted">Tracker:</span>
              <a v-if="selectedBug.trackerKey" :href="selectedBug.trackerUrl" target="_blank" rel="noopener" class="font-medium text-primary inline-flex items-center gap-1">
                {{ selectedBug.trackerKey }} <ExternalLink :size="12" />
              </a>
              <template v-else-if="tracker.provider !== 'none'">
                <span class="text-muted">Not pushed</span>
                <button @click="pushToTracker(selectedBug)" :disabled="pushing" class="btn btn-secondary ml-auto text-xs py-1" data-testid="bug-push-tracker">
                  <Loader2 v-if="pushing" :size="13" class="animate-spin" />
                  <Send v-else :size="13" />
                  {{ pushing ? 'Pushing...' : `Push to ${tracker.label}` }}
                </button>
              </template>
              <span v-else class="text-muted">
                Not connected — set one up in <RouterLink to="/settings/tracker" class="text-primary underline">Settings → Issue Tracker</RouterLink>
              </span>
            </div>
            <p v-if="pushError" class="text-xs text-danger -mt-3" role="alert">{{ pushError }}</p>

            <!-- Status & Severity editors -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Status</label>
                <select v-model="detailEdit.status" class="form-input">
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="wont-fix">Won't Fix</option>
                </select>
              </div>
              <div>
                <label class="form-label">Severity</label>
                <select v-model="detailEdit.severity" class="form-input">
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <!-- Repro steps -->
            <div>
              <label class="form-label">Repro Steps</label>
              <textarea
                v-model="detailEdit.reproSteps"
                rows="3"
                class="form-input font-mono text-sm"
                placeholder="Steps to reproduce..."
              />
            </div>

            <!-- Error message -->
            <div v-if="selectedBug.errorMessage">
              <label class="form-label">Error</label>
              <div class="bg-danger/5 border border-danger/20 rounded-lg p-3 text-sm text-danger font-mono whitespace-pre-wrap break-all">{{ selectedBug.errorMessage }}</div>
            </div>

            <!-- Stack trace (collapsible) -->
            <div v-if="selectedBug.stackTrace">
              <button
                @click="stackOpen = !stackOpen"
                class="flex items-center gap-1 text-sm text-muted hover:text-heading transition-colors"
              >
                <ChevronDown :size="15" :class="stackOpen ? 'rotate-180' : ''" class="transition-transform" />
                Stack trace
              </button>
              <pre v-if="stackOpen" class="mt-2 bg-surface-2 border border-default rounded-lg p-3 text-xs overflow-x-auto text-muted font-mono whitespace-pre-wrap break-all">{{ selectedBug.stackTrace }}</pre>
            </div>

            <!-- Failure evidence (screenshot / video replay / trace / download bundle) -->
            <div v-if="selectedBug.evidenceDir">
              <label class="form-label">Failure evidence</label>
              <EvidenceLinks :evidence-dir="selectedBug.evidenceDir" />
            </div>
            <div v-else-if="selectedBug.screenshotPath">
              <label class="form-label">Screenshot</label>
              <img :src="`${apiBase}/api/evidence/${selectedBug.screenshotPath}`" class="rounded-lg border border-default max-w-full" alt="Failure screenshot" />
            </div>

            <!-- Timestamps -->
            <div class="flex items-center gap-6 text-xs text-muted pt-2 border-t border-default">
              <span>First failed: {{ formatDate(selectedBug.firstFailedAt) }}</span>
              <span>Last failed: {{ formatDate(selectedBug.lastFailedAt) }}</span>
              <span v-if="selectedBug.resolvedAt">Resolved: {{ formatDate(selectedBug.resolvedAt) }}</span>
            </div>

            <!-- Notes -->
            <div class="border-t border-default pt-4 space-y-3">
              <h4 class="text-sm font-semibold text-heading">Notes</h4>

              <!-- Existing notes — newest first -->
              <div v-if="selectedBug.notes?.length" class="space-y-2">
                <div
                  v-for="note in [...selectedBug.notes].reverse()"
                  :key="note.id"
                  class="group flex items-start gap-2 p-3 rounded-lg bg-surface-2 border border-default"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-body whitespace-pre-wrap">{{ note.text }}</p>
                    <p class="text-xs text-muted mt-1">{{ formatDate(note.createdAt) }}</p>
                  </div>
                  <button
                    @click="deleteNote(note.id)"
                    class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-icon btn-secondary text-danger hover:bg-danger/10 shrink-0"
                    title="Delete note"
                  >
                    <Trash2 :size="13" />
                  </button>
                </div>
              </div>
              <p v-else class="text-xs text-muted">No notes yet.</p>

              <!-- Add note -->
              <div class="flex gap-2 items-end">
                <textarea
                  v-model="newNote"
                  rows="2"
                  class="form-input flex-1 text-sm resize-none"
                  placeholder="Add a note..."
                  @keydown.meta.enter="addNote"
                  @keydown.ctrl.enter="addNote"
                />
                <button
                  @click="addNote"
                  :disabled="addingNote || !newNote.trim()"
                  class="btn btn-primary shrink-0"
                >
                  <Loader2 v-if="addingNote" :size="14" class="animate-spin" />
                  <span v-else>Add</span>
                </button>
              </div>
            </div>

            <!-- Change History -->
            <div v-if="selectedBug.history?.length" class="border-t border-default pt-4 space-y-2">
              <h4 class="text-sm font-semibold text-heading">Change History</h4>
              <div class="space-y-1.5">
                <div
                  v-for="(entry, i) in [...selectedBug.history].reverse()"
                  :key="i"
                  class="flex items-center gap-2 text-xs text-muted"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
                  <template v-if="entry.field === 'tracker'">
                    <span>Pushed to tracker as</span>
                    <span class="font-medium text-heading">{{ entry.to }}</span>
                  </template>
                  <template v-else>
                    <span class="capitalize font-medium text-body">{{ entry.field }}</span>
                    <span>changed from</span>
                    <span class="font-medium text-heading">{{ entry.from }}</span>
                    <span>to</span>
                    <span class="font-medium text-heading">{{ entry.to }}</span>
                  </template>
                  <span class="ml-auto">{{ formatDate(entry.at) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 px-6 py-4 border-t border-default">
            <button @click="selectedBug = null" class="btn btn-secondary">Cancel</button>
            <button @click="saveDetail" :disabled="saving" class="btn btn-primary">
              <Loader2 v-if="saving" :size="16" class="animate-spin" />
              Save
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50" @click="deleteTarget = null" />
        <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 z-10">
          <h3 class="text-lg font-semibold text-heading mb-2">Dismiss Bug Report?</h3>
          <p class="text-sm text-muted mb-6">This will permanently delete the bug report. This cannot be undone.</p>
          <div class="flex justify-end gap-3">
            <button @click="deleteTarget = null" class="btn btn-secondary">Cancel</button>
            <button @click="deleteBug" :disabled="deleting" class="btn btn-primary bg-danger hover:bg-danger/90 border-danger">
              <Loader2 v-if="deleting" :size="16" class="animate-spin" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Clear All Modal -->
    <Teleport to="body">
      <div v-if="clearAllPending" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50" @click="clearAllPending = false" />
        <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-sm p-6 z-10">
          <h3 class="text-lg font-semibold text-heading mb-2">Clear {{ bugReports.length }} Bug Reports?</h3>
          <p class="text-sm text-muted mb-6">
            This will permanently delete
            <template v-if="filters.status || filters.severity || filters.source">
              all <strong class="text-heading">{{ bugReports.length }}</strong> bug reports matching the current filter.
            </template>
            <template v-else>
              all <strong class="text-heading">{{ bugReports.length }}</strong> bug reports.
            </template>
            This cannot be undone.
          </p>
          <div class="flex justify-end gap-3">
            <button @click="clearAllPending = false" class="btn btn-secondary">Cancel</button>
            <button @click="clearAll" :disabled="clearingAll" class="btn btn-primary bg-danger hover:bg-danger/90 border-danger">
              <Loader2 v-if="clearingAll" :size="16" class="animate-spin" />
              Delete {{ bugReports.length }} Reports
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api, { getApiBaseUrl } from '@/lib/api'
import EvidenceLinks from '@/components/EvidenceLinks.vue'
import {
  Bug, RefreshCw, Loader2, Eye, Trash2, X, Zap, ChevronDown, ExternalLink, Send
} from 'lucide-vue-next'

const apiBase = getApiBaseUrl()

// ── State ─────────────────────────────────────────────────────────
const loading = ref(false)
const bugReports = ref([])
const summary = ref({ byStatus: {}, bySeverity: {} })

const filters = reactive({ status: '', severity: '', source: '' })

const selectedBug = ref(null)
const detailEdit = reactive({ status: '', severity: '', reproSteps: '' })
const stackOpen = ref(false)
const saving = ref(false)
const healing = ref(false)

// Issue tracker (Jira / Azure DevOps)
const tracker = ref({ provider: 'none', label: null })
const pushing = ref(false)
const pushError = ref('')

async function fetchTracker() {
  try {
    const { data } = await api.get('/api/tracker/config')
    tracker.value = { provider: data.provider, label: data.label }
  } catch { /* push button stays hidden */ }
}

async function pushToTracker(bug) {
  pushing.value = true
  pushError.value = ''
  try {
    await api.post(`/api/tracker/bugs/${bug.id}`)
  } catch (err) {
    // 409 means it was already pushed (e.g. from another window) — refresh shows the link.
    if (err.response?.status !== 409) {
      pushError.value = err.response?.data?.message || 'Could not create the ticket'
    }
  } finally {
    pushing.value = false
  }
  const { data } = await api.get(`/api/bug-reports/${bug.id}`)
  selectedBug.value = data.bugReport
  const idx = bugReports.value.findIndex(b => b.id === bug.id)
  if (idx !== -1) bugReports.value[idx] = { ...bugReports.value[idx], trackerKey: data.bugReport.trackerKey, trackerUrl: data.bugReport.trackerUrl }
}

const newNote = ref('')
const addingNote = ref(false)

const deleteTarget = ref(null)
const deleting = ref(false)

const clearAllPending = ref(false)
const clearingAll = ref(false)

// ── Fetch ─────────────────────────────────────────────────────────
async function fetchSummary() {
  try {
    const { data } = await api.get('/api/bug-reports/summary')
    summary.value = data.summary || { byStatus: {}, bySeverity: {} }
  } catch { /* non-fatal */ }
}

async function fetchBugReports() {
  loading.value = true
  try {
    const params = {}
    if (filters.status)   params.status   = filters.status
    if (filters.severity) params.severity = filters.severity
    if (filters.source)   params.source   = filters.source
    const { data } = await api.get('/api/bug-reports', { params })
    bugReports.value = data.bugReports || []
  } catch (err) {
    console.error('Failed to load bug reports:', err)
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await Promise.all([fetchSummary(), fetchBugReports()])
}

// ── Detail ────────────────────────────────────────────────────────
async function openDetail(bug) {
  // Fetch fresh so history/notes are up to date
  try {
    const { data } = await api.get(`/api/bug-reports/${bug.id}`)
    selectedBug.value = data.bugReport
  } catch {
    selectedBug.value = bug
  }
  detailEdit.status     = selectedBug.value.status
  detailEdit.severity   = selectedBug.value.severity
  detailEdit.reproSteps = selectedBug.value.reproSteps || ''
  stackOpen.value = false
  newNote.value = ''
  pushError.value = ''
}

async function saveDetail() {
  if (!selectedBug.value) return
  saving.value = true
  try {
    const { data } = await api.put(`/api/bug-reports/${selectedBug.value.id}`, {
      status:     detailEdit.status,
      severity:   detailEdit.severity,
      reproSteps: detailEdit.reproSteps
    })
    // Update in-list entry
    const idx = bugReports.value.findIndex(b => b.id === selectedBug.value.id)
    if (idx !== -1) bugReports.value[idx] = data.bugReport
    selectedBug.value = data.bugReport
    await fetchSummary()
  } catch (err) {
    console.error('Failed to save bug report:', err)
  } finally {
    saving.value = false
  }
}

async function addNote() {
  if (!newNote.value.trim() || !selectedBug.value) return
  addingNote.value = true
  try {
    const { data } = await api.post(`/api/bug-reports/${selectedBug.value.id}/notes`, { text: newNote.value })
    selectedBug.value = data.bugReport
    newNote.value = ''
    // Sync list entry
    const idx = bugReports.value.findIndex(b => b.id === selectedBug.value.id)
    if (idx !== -1) bugReports.value[idx] = { ...bugReports.value[idx], ...data.bugReport }
  } catch (err) {
    console.error('Failed to add note:', err)
  } finally {
    addingNote.value = false
  }
}

async function deleteNote(noteId) {
  if (!selectedBug.value) return
  try {
    const { data } = await api.delete(`/api/bug-reports/${selectedBug.value.id}/notes/${noteId}`)
    selectedBug.value = data.bugReport
  } catch (err) {
    console.error('Failed to delete note:', err)
  }
}

async function updateStatus(bug, newStatus) {
  try {
    const { data } = await api.put(`/api/bug-reports/${bug.id}`, { status: newStatus })
    const idx = bugReports.value.findIndex(b => b.id === bug.id)
    if (idx !== -1) bugReports.value[idx] = data.bugReport
    await fetchSummary()
  } catch (err) {
    console.error('Failed to update status:', err)
  }
}

// ── Heal ──────────────────────────────────────────────────────────
async function triggerHeal(bug) {
  if (!bug.spec?.specId) return
  healing.value = true
  try {
    await api.post(`/api/agent-tests/specs/${bug.spec.specId}/heal`)
    await refresh()
    selectedBug.value = null
  } catch (err) {
    console.error('Heal failed:', err)
  } finally {
    healing.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────
function confirmDelete(bug) {
  deleteTarget.value = bug
}

async function deleteBug() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await api.delete(`/api/bug-reports/${deleteTarget.value.id}`)
    bugReports.value = bugReports.value.filter(b => b.id !== deleteTarget.value.id)
    deleteTarget.value = null
    await fetchSummary()
  } catch (err) {
    console.error('Failed to delete bug report:', err)
  } finally {
    deleting.value = false
  }
}

function confirmClearAll() {
  clearAllPending.value = true
}

async function clearAll() {
  clearingAll.value = true
  try {
    const params = {}
    if (filters.status)   params.status   = filters.status
    if (filters.severity) params.severity = filters.severity
    if (filters.source)   params.source   = filters.source
    await api.delete('/api/bug-reports', { params })
    clearAllPending.value = false
    await refresh()
  } catch (err) {
    console.error('Failed to clear bug reports:', err)
  } finally {
    clearingAll.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function severityClass(severity) {
  const map = {
    critical: 'badge-danger',
    high:     'badge-warning',
    medium:   'badge-info',
    low:      'badge-success'
  }
  return map[severity] || 'badge-info'
}

function sourceClass(source) {
  const map = {
    synthetic: 'badge-primary',
    pack:      'badge-info',
    manual:    'badge-warning'
  }
  return map[source] || 'badge-info'
}

onMounted(() => { refresh(); fetchTracker() })
</script>
