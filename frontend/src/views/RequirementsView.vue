<template>
  <div class="requirements-view">

    <!-- Mode toggle header -->
    <div class="req-topbar">
      <div class="req-mode-pills">
        <button class="mode-pill" :class="{ active: mode === 'write' }" @click="mode = 'write'">
          <PenLine :size="13" />
          Write
        </button>
        <button class="mode-pill" :class="{ active: mode === 'review' }" @click="mode = 'review'">
          <FileSearch :size="13" />
          Review
        </button>
      </div>
      <p class="req-subtitle">
        {{ mode === 'write'
          ? 'Build well-formed requirements with live scoring, then send to the test generator'
          : 'Import existing requirements and check for ambiguities before generating tests'
        }}
      </p>
    </div>

    <!-- Two-pane body -->
    <div class="req-body">

      <!-- ══ WRITE MODE ══════════════════════════════════════════════════════════ -->
      <template v-if="mode === 'write'">

        <!-- Left: EARS composer -->
        <div class="req-pane req-pane--left">
          <div class="req-pane-header">EARS Composer</div>

          <div class="composer-form">
            <div class="form-group">
              <label class="form-label">Type</label>
              <select v-model="writeType" class="form-input form-input--sm">
                <option value="AC">Acceptance Criterion (AC)</option>
                <option value="User Story">User Story</option>
                <option value="DoR">Definition of Ready (DoR)</option>
                <option value="DoD">Definition of Done (DoD)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Trigger <span class="form-label-hint">When / If / While / Given…</span></label>
              <input v-model="trigger" class="form-input" placeholder="When the user submits the login form" @input="schedulePreview" />
            </div>

            <div class="form-group">
              <label class="form-label">Subject</label>
              <input v-model="subject" class="form-input" placeholder="the authentication service" @input="schedulePreview" />
            </div>

            <div class="form-group">
              <label class="form-label">Condition <span class="form-label-hint optional">optional</span></label>
              <input v-model="condition" class="form-input" placeholder="and valid credentials are entered" @input="schedulePreview" />
            </div>

            <div class="form-group">
              <label class="form-label">Response <span class="form-label-hint">shall / will / must…</span></label>
              <input v-model="response" class="form-input" placeholder="shall redirect to the dashboard within 2 seconds" @input="schedulePreview" />
            </div>

            <!-- Live preview -->
            <div v-if="composedText.trim()" class="composer-preview">
              <div class="composer-preview-header">
                <span class="text-xs text-muted font-medium" style="text-transform:uppercase;letter-spacing:.05em">Preview</span>
                <div class="score-badge" :style="{ background: scoreColor(liveScore) }">
                  <span v-if="liveAnalysing">…</span>
                  <span v-else-if="liveScore !== null">{{ liveScore }}</span>
                  <span v-else>—</span>
                </div>
              </div>
              <p class="composer-preview-text">{{ composedText }}</p>
              <ul v-if="liveSuggestions.length" class="suggestion-list">
                <li v-for="(s, i) in liveSuggestions" :key="i" class="suggestion-item">
                  <AlertCircle :size="11" class="suggestion-icon" />
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>

          <div class="composer-actions">
            <button class="btn btn-ghost btn-sm" @click="clearComposer">Clear</button>
            <button class="btn btn-primary btn-sm" :disabled="!composedText.trim()" @click="addToList">
              <Plus :size="13" />
              Add to list
            </button>
          </div>
        </div>

        <!-- Right: session list -->
        <div class="req-pane req-pane--right">
          <div class="req-pane-header">
            Session List
            <span v-if="sessionList.length" class="req-count-badge">{{ sessionList.length }}</span>
          </div>

          <div v-if="!sessionList.length" class="req-empty">
            <ClipboardCheck :size="36" class="req-empty-icon" />
            <p>No requirements yet — compose one on the left and click "Add to list"</p>
          </div>

          <div v-else class="req-table-wrap">
            <table class="req-table">
              <thead>
                <tr>
                  <th style="width:30px"><input type="checkbox" @change="toggleAllSession($event.target.checked)" :checked="allSessionChecked" /></th>
                  <th style="width:70px">Score</th>
                  <th style="width:60px">Type</th>
                  <th>Requirement</th>
                  <th style="width:90px">Flags</th>
                  <th style="width:30px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in sessionList" :key="item.id">
                  <td><input type="checkbox" v-model="item.checked" /></td>
                  <td>
                    <div class="score-bar"><div class="score-fill" :style="{ width: item.score + '%', background: scoreColor(item.score) }"></div></div>
                    <span class="score-num" :style="{ color: scoreColor(item.score) }">{{ item.score }}</span>
                  </td>
                  <td><span class="type-badge">{{ item.type }}</span></td>
                  <td class="req-text-cell" :title="item.text">{{ item.text }}</td>
                  <td>
                    <div class="flag-list">
                      <span v-for="f in item.flags" :key="f" class="flag-badge" :title="flagLabel(f)">{{ flagShort(f) }}</span>
                    </div>
                  </td>
                  <td>
                    <button class="btn-icon-sm btn btn-ghost" @click="removeFromList(item.id)" title="Remove"><X :size="12" /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="req-pane-footer">
            <span class="text-muted text-xs">{{ checkedSessionItems.length }} selected</span>
            <button class="btn btn-primary btn-sm" :disabled="!checkedSessionItems.length" @click="sendToGenerator">
              <Zap :size="13" />
              Send to Generator
            </button>
          </div>
        </div>

      </template>

      <!-- ══ REVIEW MODE ════════════════════════════════════════════════════════ -->
      <template v-else>

        <!-- Left: source -->
        <div class="req-pane req-pane--left">
          <div class="req-pane-header">Import Requirements</div>

          <div class="source-tabs">
            <button class="source-tab" :class="{ active: sourceTab === 'paste' }" @click="sourceTab = 'paste'">Paste</button>
            <button class="source-tab" :class="{ active: sourceTab === 'csv' }" @click="sourceTab = 'csv'">CSV</button>
            <button class="source-tab" :class="{ active: sourceTab === 'tracker' }" data-testid="req-source-tracker" @click="sourceTab = 'tracker'">{{ tracker.label || 'Jira / Azure DevOps' }}</button>
          </div>

          <!-- Paste tab -->
          <div v-if="sourceTab === 'paste'" class="source-body">
            <div class="form-group">
              <label class="form-label">Default type <span class="form-label-hint">applies to lines without a prefix</span></label>
              <select v-model="pasteDefaultType" class="form-input form-input--sm">
                <option value="AC">Acceptance Criterion</option>
                <option value="User Story">User Story</option>
                <option value="DoD">Definition of Done</option>
                <option value="DoR">Definition of Ready</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;display:flex;flex-direction:column;gap:4px">
              <label class="form-label">Requirements <span class="form-label-hint">one per line · prefix with [AC] [DoD] [DoR] to set type</span></label>
              <textarea
                v-model="pasteText"
                class="form-input req-paste-area"
                placeholder="[AC] When the user clicks submit, the form shall validate all required fields&#10;[DoD] Unit tests cover all public methods&#10;The login page shall load within 3 seconds"
              />
            </div>
          </div>

          <!-- CSV tab -->
          <div v-if="sourceTab === 'csv'" class="source-body">
            <p class="text-xs text-muted" style="margin-bottom:6px">Upload a CSV with columns: <code>type</code>, <code>text</code>, and optionally <code>reference</code>.</p>
            <label
              class="csv-upload-area"
              :class="{ 'csv-upload-area--active': csvDragging }"
              @dragover.prevent="csvDragging = true"
              @dragleave="csvDragging = false"
              @drop.prevent="onCsvDrop"
            >
              <input type="file" accept=".csv" class="csv-file-input" @change="onCsvFile" />
              <FileUp :size="22" style="opacity:.5" />
              <span class="text-sm text-muted">{{ csvFile ? csvFile.name : 'Drop CSV here or click to browse' }}</span>
            </label>
            <div v-if="csvItems.length" class="csv-preview">
              <p class="text-xs text-muted" style="margin-bottom:6px">{{ csvItems.length }} rows loaded</p>
              <table class="req-table req-table--sm">
                <thead><tr><th>Type</th><th>Text</th><th>Ref</th></tr></thead>
                <tbody>
                  <tr v-for="(row, i) in csvItems.slice(0, 5)" :key="i">
                    <td><span class="type-badge">{{ row.type }}</span></td>
                    <td class="req-text-cell">{{ row.text }}</td>
                    <td class="text-muted" style="font-size:11px">{{ row.reference }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="csvItems.length > 5" class="text-xs text-muted" style="margin-top:4px">…and {{ csvItems.length - 5 }} more rows</p>
            </div>
          </div>

          <!-- Tracker import (Jira / Azure DevOps) -->
          <div v-if="sourceTab === 'tracker' && tracker.provider === 'none'" class="source-body source-body--stub">
            <GitBranch :size="30" style="opacity:.3;margin-bottom:10px" />
            <p class="text-sm font-medium" style="color:var(--color-text-heading);margin-bottom:6px">Connect Jira or Azure DevOps</p>
            <p class="text-xs text-muted">Set up your tracker in <RouterLink to="/settings/tracker" class="text-primary underline">Settings → Issue Tracker</RouterLink>, then import stories and their acceptance criteria here.</p>
          </div>
          <div v-if="sourceTab === 'tracker' && tracker.provider !== 'none'" class="source-body">
            <div class="form-group">
              <label class="form-label">Project</label>
              <input v-model="trackerProject" class="form-input form-input--sm" :placeholder="tracker.provider === 'jira' ? 'e.g. PAY' : 'e.g. Shop'" />
            </div>
            <div class="form-group">
              <label class="form-label">{{ tracker.provider === 'jira' ? 'JQL' : 'WIQL' }} <span class="form-label-hint">optional · defaults to open stories in the project</span></label>
              <textarea
                v-model="trackerQuery"
                class="form-input"
                rows="3"
                :placeholder="tracker.provider === 'jira'
                  ? 'project = PAY AND sprint in openSprints()'
                  : 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.IterationPath] UNDER @CurrentIteration'"
              />
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;gap:8px">
              <div>
                <label class="form-label">Max stories</label>
                <input v-model.number="trackerLimit" type="number" min="1" max="200" class="form-input form-input--sm" style="width:90px" />
              </div>
              <button class="btn btn-secondary btn-sm" :disabled="trackerLoading || (!trackerProject && !trackerQuery.trim())" data-testid="req-tracker-fetch" @click="fetchFromTracker">
                <Loader2 v-if="trackerLoading" :size="13" class="animate-spin" />
                <RefreshCw v-else :size="13" />
                {{ trackerLoading ? 'Fetching…' : `Fetch from ${tracker.label}` }}
              </button>
            </div>
            <p v-if="trackerError" class="text-xs text-danger" role="alert">{{ trackerError }}</p>
            <div v-if="trackerItems.length" class="csv-preview">
              <p class="text-xs text-muted" style="margin-bottom:6px">{{ trackerItems.length }} requirement{{ trackerItems.length === 1 ? '' : 's' }} from {{ trackerSources.length }} stor{{ trackerSources.length === 1 ? 'y' : 'ies' }}</p>
              <table class="req-table req-table--sm">
                <thead><tr><th>Type</th><th>Text</th><th>Ref</th></tr></thead>
                <tbody>
                  <tr v-for="(row, i) in trackerItems.slice(0, 5)" :key="i">
                    <td><span class="type-badge">{{ row.type }}</span></td>
                    <td class="req-text-cell">{{ row.text }}</td>
                    <td style="font-size:11px">
                      <a v-if="sourceUrl(row.reference)" :href="sourceUrl(row.reference)" target="_blank" rel="noopener" class="text-primary">{{ row.reference }}</a>
                      <span v-else class="text-muted">{{ row.reference }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="trackerItems.length > 5" class="text-xs text-muted" style="margin-top:4px">…and {{ trackerItems.length - 5 }} more</p>
            </div>
            <p v-else-if="trackerFetched && !trackerError" class="text-xs text-muted">No matching stories found.</p>
          </div>

          <div class="composer-actions">
            <button class="btn btn-primary btn-sm" :disabled="!canAnalyse || analysing" @click="runAnalysis">
              <Search v-if="!analysing" :size="13" />
              <Loader2 v-else :size="13" class="animate-spin" />
              {{ analysing ? 'Analysing…' : 'Analyse' }}
            </button>
          </div>
        </div>

        <!-- Right: results -->
        <div class="req-pane req-pane--right">
          <template v-if="!results.length">
            <div class="req-empty">
              <FileSearch :size="36" class="req-empty-icon" />
              <p>Import requirements on the left, then click Analyse</p>
            </div>
          </template>
          <template v-else>
            <div class="req-pane-header">
              Results
              <div class="results-summary">
                <span class="summary-chip summary-chip--total">{{ results.length }} total</span>
                <span class="summary-chip" :style="{ color: '#28C76F' }">{{ goodCount }} ●</span>
                <span class="summary-chip" :style="{ color: '#FF9F43' }">{{ warnCount }} ●</span>
                <span class="summary-chip" :style="{ color: '#EA5455' }">{{ badCount }} ●</span>
              </div>
            </div>

            <div class="req-table-wrap">
              <table class="req-table">
                <thead>
                  <tr>
                    <th style="width:30px"><input type="checkbox" @change="toggleAllResults($event.target.checked)" :checked="allResultsChecked" /></th>
                    <th style="width:70px">Score</th>
                    <th style="width:60px">Type</th>
                    <th>Requirement</th>
                    <th style="width:90px">Flags</th>
                    <th style="width:30px"></th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="item in results" :key="item.id">
                    <tr :class="{ 'row-dod': item.isDoD }">
                      <td>
                        <input v-if="!item.isDoD" type="checkbox" v-model="item.checked" />
                        <span v-else class="text-muted" style="font-size:10px">ref</span>
                      </td>
                      <td>
                        <template v-if="item.isDoD">
                          <span class="text-muted" style="font-size:10px">—</span>
                        </template>
                        <template v-else>
                          <div class="score-bar"><div class="score-fill" :style="{ width: item.score + '%', background: scoreColor(item.score) }"></div></div>
                          <span class="score-num" :style="{ color: scoreColor(item.score) }">{{ item.score }}</span>
                        </template>
                      </td>
                      <td><span class="type-badge">{{ item.type }}</span></td>
                      <td class="req-text-cell" :title="item.text">{{ item.text }}</td>
                      <td>
                        <div class="flag-list">
                          <span v-for="f in item.flags" :key="f" class="flag-badge" :title="flagLabel(f)">{{ flagShort(f) }}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          class="btn btn-ghost btn-icon-sm"
                          @click="toggleExpand(item.id)"
                          :title="expandedRows.has(item.id) ? 'Collapse' : 'Edit & re-analyse'"
                        >
                          <ChevronDown :size="12" :style="{ transition: 'transform .15s', transform: expandedRows.has(item.id) ? 'rotate(180deg)' : 'none' }" />
                        </button>
                      </td>
                    </tr>
                    <tr v-if="expandedRows.has(item.id)" class="row-detail">
                      <td colspan="6">
                        <div class="row-detail-body">
                          <textarea class="form-input req-edit-area" v-model="editedTexts[item.id]" rows="3" />
                          <ul v-if="item.suggestions && item.suggestions.length" class="suggestion-list" style="margin:8px 0 0">
                            <li v-for="(s, i) in item.suggestions" :key="i" class="suggestion-item">
                              <AlertCircle :size="11" class="suggestion-icon" />
                              {{ s }}
                            </li>
                          </ul>
                          <div style="display:flex;gap:6px;margin-top:8px">
                            <button class="btn btn-secondary btn-sm" @click="reanalyseRow(item)">
                              <RefreshCw :size="12" />
                              Re-analyse
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </template>

          <div class="req-pane-footer">
            <span class="text-muted text-xs">{{ checkedResultItems.length }} selected</span>
            <button class="btn btn-primary btn-sm" :disabled="!checkedResultItems.length" @click="sendToGenerator">
              <Zap :size="13" />
              Send to Generator
            </button>
          </div>
        </div>

      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  PenLine, FileSearch, Plus, X, Zap, AlertCircle, Search,
  FileUp, GitBranch, ClipboardCheck, ChevronDown, RefreshCw, Loader2
} from 'lucide-vue-next'
import api from '@/lib/api'

const router = useRouter()

// ── Issue tracker source (Jira / Azure DevOps) ──────────────────────────────
const tracker        = ref({ provider: 'none', label: null, config: {} })
const trackerProject = ref('')
const trackerQuery   = ref('')
const trackerLimit   = ref(50)
const trackerItems   = ref([])
const trackerSources = ref([])
const trackerLoading = ref(false)
const trackerFetched = ref(false)
const trackerError   = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get('/api/tracker/config')
    tracker.value = { provider: data.provider, label: data.label, config: data.config || {} }
    trackerProject.value = data.config?.defaultProject || ''
  } catch { /* tracker tab falls back to the connect prompt */ }
})

async function fetchFromTracker () {
  trackerLoading.value = true
  trackerError.value = ''
  try {
    const { data } = await api.post('/api/tracker/requirements', {
      project: trackerProject.value.trim() || undefined,
      query: trackerQuery.value.trim() || undefined,
      limit: trackerLimit.value
    })
    trackerItems.value = data.items || []
    trackerSources.value = data.sources || []
  } catch (e) {
    trackerItems.value = []
    trackerSources.value = []
    trackerError.value = e.response?.data?.message || 'Could not fetch from the tracker'
  } finally {
    trackerLoading.value = false
    trackerFetched.value = true
  }
}

function sourceUrl (reference) {
  return trackerSources.value.find(s => s.reference === reference)?.url || null
}

// ── Mode ────────────────────────────────────────────────────────────────────
const mode = ref('write')

// ── WRITE STATE ─────────────────────────────────────────────────────────────
const writeType  = ref('AC')
const trigger    = ref('')
const subject    = ref('')
const condition  = ref('')
const response   = ref('')

const composedText = computed(() => {
  return [trigger.value, subject.value, condition.value, response.value]
    .map(s => s.trim()).filter(Boolean).join(' ')
})

const liveScore       = ref(null)
const liveSuggestions = ref([])
const liveAnalysing   = ref(false)
let debounceTimer     = null

function schedulePreview () {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => analyzeWritePreview(), 400)
}

watch(writeType, schedulePreview)

async function analyzeWritePreview () {
  const text = composedText.value.trim()
  if (!text) { liveScore.value = null; liveSuggestions.value = []; return }
  liveAnalysing.value = true
  try {
    const { data } = await api.post('/api/requirements/analyze', {
      items: [{ id: 'preview', text, type: writeType.value }]
    })
    if (data.success && data.results[0]) {
      liveScore.value       = data.results[0].score
      liveSuggestions.value = data.results[0].suggestions || []
    }
  } catch { liveScore.value = null }
  finally { liveAnalysing.value = false }
}

let sessionIdCounter = 0
const sessionList = ref([])

const checkedSessionItems = computed(() => sessionList.value.filter(i => i.checked))
const allSessionChecked   = computed(() =>
  sessionList.value.length > 0 && sessionList.value.every(i => i.checked)
)

function toggleAllSession (checked) {
  sessionList.value.forEach(i => { i.checked = checked })
}

function addToList () {
  const text = composedText.value.trim()
  if (!text) return
  sessionList.value.push({
    id:          ++sessionIdCounter,
    text,
    type:        writeType.value,
    score:       liveScore.value ?? 0,
    flags:       [],
    suggestions: liveSuggestions.value.slice(),
    checked:     false
  })
  clearComposer()
}

function clearComposer () {
  trigger.value   = ''
  subject.value   = ''
  condition.value = ''
  response.value  = ''
  liveScore.value       = null
  liveSuggestions.value = []
}

function removeFromList (id) {
  sessionList.value = sessionList.value.filter(i => i.id !== id)
}

// ── REVIEW STATE ─────────────────────────────────────────────────────────────
const sourceTab       = ref('paste')
const pasteDefaultType = ref('AC')
const pasteText       = ref('')
const csvFile         = ref(null)
const csvItems        = ref([])
const csvDragging     = ref(false)
const analysing       = ref(false)
const results         = ref([])
const expandedRows    = ref(new Set())
const editedTexts     = ref({})

const canAnalyse = computed(() => {
  if (sourceTab.value === 'paste') return !!pasteText.value.trim()
  if (sourceTab.value === 'csv')   return csvItems.value.length > 0
  if (sourceTab.value === 'tracker') return trackerItems.value.length > 0
  return false
})

const checkedResultItems = computed(() => results.value.filter(i => i.checked && !i.isDoD))
const allResultsChecked  = computed(() => {
  const scoreable = results.value.filter(i => !i.isDoD)
  return scoreable.length > 0 && scoreable.every(i => i.checked)
})

const goodCount = computed(() => results.value.filter(i => !i.isDoD && i.score >= 80).length)
const warnCount = computed(() => results.value.filter(i => !i.isDoD && i.score >= 60 && i.score < 80).length)
const badCount  = computed(() => results.value.filter(i => !i.isDoD && i.score < 60).length)

function parsePaste (text, defaultType) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      let type = defaultType
      let content = line
      const m = line.match(/^\[(AC|DoD|DoR|User Story)\]\s*/i)
      if (m) {
        const tag = m[1].toUpperCase()
        type    = tag === 'DOD' ? 'DoD' : tag === 'DOR' ? 'DoR' : tag === 'USER STORY' ? 'User Story' : 'AC'
        content = line.slice(m[0].length).trim()
      }
      return { id: i, text: content, type, reference: '' }
    })
    .filter(item => item.text)
}

function onCsvFile (event) {
  const file = event.target.files?.[0]
  if (file) loadCsvFile(file)
}

function onCsvDrop (event) {
  csvDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) loadCsvFile(file)
}

function loadCsvFile (file) {
  csvFile.value = file
  const reader = new FileReader()
  reader.onload = e => { csvItems.value = parseCsv(e.target.result) }
  reader.readAsText(file)
}

function parseCsv (text) {
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].toLowerCase().split(',').map(h => h.replace(/"/g, '').trim())
  const typeIdx = headers.indexOf('type')
  const textIdx = headers.indexOf('text')
  const refIdx  = headers.indexOf('reference')
  if (textIdx === -1) return []
  return lines.slice(1).map((line, i) => {
    const cols = splitCsvLine(line)
    return {
      id:        i,
      type:      typeIdx !== -1 ? (cols[typeIdx] || 'AC').trim() : 'AC',
      text:      (cols[textIdx] || '').trim(),
      reference: refIdx  !== -1 ? (cols[refIdx]  || '').trim() : ''
    }
  }).filter(item => item.text)
}

function splitCsvLine (line) {
  const result = []; let cur = ''; let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += ch }
  }
  result.push(cur)
  return result
}

async function runAnalysis () {
  analysing.value = true
  const items = sourceTab.value === 'paste'
    ? parsePaste(pasteText.value, pasteDefaultType.value)
    : sourceTab.value === 'tracker'
      ? trackerItems.value
      : csvItems.value
  try {
    const { data } = await api.post('/api/requirements/analyze', { items })
    if (data.success) {
      results.value = data.results.map(r => ({ ...r, checked: false }))
      const texts = {}
      data.results.forEach(r => { texts[r.id] = r.text })
      editedTexts.value = texts
      expandedRows.value = new Set()
    }
  } catch (e) {
    console.error('[requirements] Analysis failed:', e)
  } finally {
    analysing.value = false
  }
}

function toggleExpand (id) {
  const s = new Set(expandedRows.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedRows.value = s
}

async function reanalyseRow (item) {
  const newText = editedTexts.value[item.id] ?? item.text
  try {
    const { data } = await api.post('/api/requirements/analyze', {
      items: [{ id: item.id, text: newText, type: item.type }]
    })
    if (data.success && data.results[0]) {
      const idx = results.value.findIndex(r => r.id === item.id)
      if (idx !== -1) {
        results.value[idx] = { ...results.value[idx], ...data.results[0], text: newText }
      }
    }
  } catch (e) {
    console.error('[requirements] Re-analysis failed:', e)
  }
}

function toggleAllResults (checked) {
  results.value.filter(i => !i.isDoD).forEach(i => { i.checked = checked })
}

// ── Shared: Send to Generator ───────────────────────────────────────────────
async function sendToGenerator () {
  const items = mode.value === 'write' ? checkedSessionItems.value : checkedResultItems.value
  if (!items.length) return

  const description = items.length === 1
    ? items[0].text
    : items.map((item, i) => `${i + 1}. ${item.text}`).join('\n')

  localStorage.setItem('aurora_req_prefill', description)

  if (window.__TAURI__) {
    const { Window } = await import('@tauri-apps/api/window')
    const win = await Window.getByLabel('generator')
    if (win) { await win.show(); await win.setFocus() }
  } else {
    router.push({ path: '/testing/generator', query: { mode: 'generate' } })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor (score) {
  if (score === null || score === undefined) return '#9a9aaa'
  if (score >= 80) return '#28C76F'
  if (score >= 60) return '#FF9F43'
  return '#EA5455'
}

const FLAG_LABELS = {
  MISSING_EARS_SHAPE: 'Missing EARS shape — needs a trigger (When/If/While/Given) and a response word (shall/will/must)',
  DUPLICATES_DOD:     'Content substantially overlaps with a Definition of Done entry'
}

function flagLabel (flag) {
  if (FLAG_LABELS[flag]) return FLAG_LABELS[flag]
  if (flag.startsWith('VAGUE:')) return `Vague term: "${flag.slice(6).toLowerCase().replace('_', '-')}"`
  return flag
}

function flagShort (flag) {
  if (flag === 'MISSING_EARS_SHAPE') return 'EARS'
  if (flag === 'DUPLICATES_DOD')     return 'DoD↔'
  if (flag.startsWith('VAGUE:'))     return flag.slice(6).toLowerCase().replace('_', '-')
  return flag
}
</script>

<style scoped>
.requirements-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  overflow: hidden;
}

/* ── Topbar ── */
.req-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.req-mode-pills {
  display: flex;
  background: var(--color-surface-2);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.mode-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-pill.active {
  background: var(--color-card);
  color: var(--color-text-heading);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.req-subtitle {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* ── Body ── */
.req-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.req-pane {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.req-pane--left {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
}

.req-pane--right {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.req-pane-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.req-pane-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.req-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  padding: 0 4px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.req-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: center;
  padding: 40px 24px;
}

.req-empty-icon { opacity: 0.25; }

/* ── Composer ── */
.composer-form {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-input--sm {
  height: 30px;
  font-size: 12px;
  padding: 0 8px;
}

.form-label-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  font-weight: 400;
  margin-left: 4px;
}

.form-label-hint.optional { font-style: italic; }

.composer-preview {
  background: var(--color-surface-2);
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 4px;
}

.composer-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.composer-preview-text {
  font-size: 0.8125rem;
  color: var(--color-text-body);
  line-height: 1.5;
  margin: 0;
}

.score-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* ── Suggestions ── */
.suggestion-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 0.75rem;
  color: var(--color-warning);
  line-height: 1.4;
}

.suggestion-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-warning);
}

/* ── Score bar ── */
.score-bar {
  width: 48px;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}

.score-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background 0.3s ease;
}

.score-num {
  font-size: 10px;
  font-weight: 700;
}

/* ── Badges ── */
.type-badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  background: rgba(115, 103, 240, 0.15);
  color: var(--color-primary);
  white-space: nowrap;
}

.flag-list { display: flex; flex-wrap: wrap; gap: 3px; }

.flag-badge {
  display: inline-block;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  background: rgba(255, 159, 67, 0.12);
  color: var(--color-warning);
  border: 1px solid rgba(255, 159, 67, 0.25);
  cursor: default;
}

/* ── Table ── */
.req-table-wrap {
  flex: 1;
  overflow-y: auto;
}

.req-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.req-table th {
  padding: 7px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.req-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.req-table tbody tr:not(.row-detail):hover td {
  background: var(--color-surface-2);
}

.req-text-cell {
  max-width: 0;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-body);
}

.row-dod td { opacity: 0.55; }

.row-detail td { padding: 0; border-bottom: 1px solid var(--color-border); }

.row-detail-body {
  padding: 12px 14px;
  background: var(--color-surface-2);
}

.req-edit-area {
  width: 100%;
  resize: vertical;
  font-size: 0.8125rem;
  box-sizing: border-box;
}

.btn-icon-sm {
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ── Source tabs ── */
.source-tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.source-tab {
  padding: 7px 14px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-muted);
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.source-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.source-tab:hover:not(.active) { color: var(--color-text-heading); }

.source-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-body--stub {
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* ── CSV upload ── */
.csv-upload-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  padding: 24px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.csv-upload-area:hover,
.csv-upload-area--active {
  border-color: var(--color-primary);
  background: rgba(115, 103, 240, 0.05);
}

.csv-file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.csv-preview {
  background: var(--color-surface-2);
  border-radius: 6px;
  padding: 10px;
}

.req-table--sm th,
.req-table--sm td {
  padding: 4px 8px;
  font-size: 0.75rem;
}

.req-paste-area {
  flex: 1;
  min-height: 180px;
  resize: none;
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
}

/* ── Results summary ── */
.results-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.summary-chip {
  font-size: 11px;
  font-weight: 600;
}

.summary-chip--total {
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}
</style>
