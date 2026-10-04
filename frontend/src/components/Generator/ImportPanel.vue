<template>
  <div class="import-panel">

    <!-- Mode tabs -->
    <div class="imp-tabs">
      <button
        v-for="tab in importTabs"
        :key="tab.id"
        class="imp-tab"
        :class="{ 'imp-tab--active': importMode === tab.id }"
        @click="importMode = tab.id"
      >
        <component :is="tab.icon" :size="13" />
        {{ tab.label }}
      </button>
    </div>

    <!-- ── AI Extract ── -->
    <div v-if="importMode === 'ai'" class="imp-section">
      <label class="form-label">Source Text</label>
      <textarea
        v-model="aiInput.text"
        rows="8"
        class="form-input imp-mono"
        placeholder="Paste requirements, user stories, or acceptance criteria..."
      />

      <div class="imp-row">
        <div class="flex-1">
          <label class="form-label">Target URL (optional)</label>
          <input v-model="aiInput.targetUrl" type="url" class="form-input" placeholder="https://example.com" />
        </div>
        <div class="flex-1">
          <label class="form-label">Add to Pack</label>
          <select v-model="aiInput.packId" class="form-select">
            <option value="">Create new pack</option>
            <option v-for="p in packs" :key="p.id || p.packId" :value="p.id || p.packId">{{ p.name || p.packName }}</option>
          </select>
        </div>
      </div>

      <div v-if="aiInput.packId === ''" class="imp-indent">
        <label class="form-label">New Pack Name</label>
        <input v-model="aiInput.newPackName" type="text" class="form-input" placeholder="e.g. Login Tests" />
      </div>

      <label class="imp-check-row">
        <input type="checkbox" v-model="aiInput.generateCode" class="form-checkbox" />
        <span class="text-sm text-body">Generate Playwright code after extraction</span>
      </label>

      <p v-if="aiError" class="text-danger text-sm">{{ aiError }}</p>

      <div class="imp-actions">
        <button class="btn btn-primary btn-sm" :disabled="!aiInput.text.trim() || aiExtracting" @click="extractWithAI">
          <Loader2 v-if="aiExtracting" :size="13" class="animate-spin" />
          <Bot v-else :size="13" />
          {{ aiExtracting ? 'Extracting...' : 'Extract Test Cases' }}
        </button>
      </div>

      <!-- AI results -->
      <template v-if="aiResults.length">
        <div class="imp-divider" />
        <div class="imp-result-header">
          <span class="text-sm font-medium text-heading">{{ aiResults.length }} extracted — review before importing</span>
          <button class="icon-btn text-muted hover:text-danger" @click="aiResults = []"><X :size="13" /></button>
        </div>
        <div class="imp-ai-list">
          <div v-for="(tc, idx) in aiResults" :key="idx" class="imp-ai-item">
            <input v-model="tc.name" class="form-input imp-ai-name" placeholder="Test case name" />
            <textarea v-model="tc.steps" rows="2" class="form-input imp-mono-sm" placeholder="Steps" />
            <textarea v-model="tc.expected" rows="2" class="form-input imp-mono-sm" placeholder="Expected results" />
            <button class="icon-btn text-muted hover:text-danger imp-ai-del" @click="aiResults.splice(idx,1)"><Trash2 :size="11" /></button>
          </div>
          <button class="btn btn-sm btn-secondary w-full" @click="aiResults.push({name:'',steps:'',expected:''})">
            <Plus :size="13" /> Add Test Case
          </button>
        </div>
        <p v-if="aiError" class="text-danger text-sm">{{ aiError }}</p>
        <div class="imp-actions">
          <button class="btn btn-primary btn-sm" :disabled="!aiResults.length || aiImporting" @click="importAIResults">
            <Loader2 v-if="aiImporting" :size="13" class="animate-spin" />
            <Package v-else :size="13" />
            {{ aiImporting ? 'Importing...' : `Import ${aiResults.length} Test Cases` }}
          </button>
        </div>
      </template>
    </div>

    <!-- ── Paste ── -->
    <div v-else-if="importMode === 'paste'" class="imp-section">
      <label class="form-label">Paste from Excel / Google Sheets</label>
      <textarea
        v-model="pasteText"
        rows="8"
        class="form-input imp-mono"
        placeholder="Copy cells from spreadsheet (Ctrl/Cmd+C) then paste here..."
      />
      <p class="text-xs text-muted">Headers must be in the first row. Tab or comma delimited.</p>

      <template v-if="pastePreview.headers.length">
        <div class="imp-table-wrap">
          <table class="imp-table">
            <thead>
              <tr><th v-for="h in pastePreview.headers" :key="h">{{ h }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in pastePreview.rows.slice(0,4)" :key="i">
                <td v-for="h in pastePreview.headers" :key="h">{{ row[h] }}</td>
              </tr>
              <tr v-if="pastePreview.rows.length > 4">
                <td :colspan="pastePreview.headers.length" class="imp-table-more">+{{ pastePreview.rows.length - 4 }} more rows</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="imp-row">
          <div class="flex-1">
            <label class="form-label">Import As</label>
            <select v-model="pasteAs" class="form-select">
              <option value="testCases">Test Cases (creates specs)</option>
              <option value="testData">Test Data (for injection)</option>
            </select>
          </div>
          <div v-if="pasteAs === 'testData'" class="flex-1">
            <label class="form-label">Dataset Name</label>
            <input v-model="pasteDatasetName" type="text" class="form-input" placeholder="Test Users" />
          </div>
        </div>

        <div v-if="pasteAs === 'testCases'" class="imp-grid">
          <div>
            <label class="form-label">Test Name Column *</label>
            <select v-model="pasteMappings.name" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Steps Column *</label>
            <select v-model="pasteMappings.steps" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Expected Results</label>
            <select v-model="pasteMappings.expected" class="form-select">
              <option value="">None</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Add to Pack</label>
            <select v-model="pastePackId" class="form-select">
              <option value="">Create new pack</option>
              <option v-for="p in packs" :key="p.id || p.packId" :value="p.id || p.packId">{{ p.name || p.packName }}</option>
            </select>
          </div>
        </div>

        <p v-if="pasteError" class="text-danger text-sm">{{ pasteError }}</p>
        <div class="imp-actions">
          <button class="btn btn-primary btn-sm" :disabled="pastePreview.rows.length === 0 || pasteImporting" @click="importPasted">
            <Loader2 v-if="pasteImporting" :size="13" class="animate-spin" />
            <Database v-else :size="13" />
            {{ pasteImporting ? 'Importing...' : `Import ${pastePreview.rows.length} Rows` }}
          </button>
        </div>
      </template>
    </div>

    <!-- ── CSV File ── -->
    <div v-else class="imp-section">

      <!-- Step 1: Upload -->
      <template v-if="csvStep === 1">
        <div
          class="imp-dropzone"
          :class="{ 'imp-dropzone--over': dragOver }"
          @dragenter.prevent="dragOver = true"
          @dragover.prevent="dragOver = true"
          @dragleave.self="dragOver = false"
          @drop.prevent="handleDrop"
          @click="$refs.fileInput.click()"
        >
          <Upload :size="28" class="text-muted mb-2" />
          <p class="text-sm text-heading font-medium">Drop CSV file here or click to browse</p>
          <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="handleFileSelect" />
        </div>
        <div v-if="csvFileName" class="imp-file-badge">
          <FileText :size="14" class="text-primary" />
          <span class="text-sm font-medium">{{ csvFileName }}</span>
          <span class="text-xs text-muted ml-auto">{{ csvRowCount }} rows</span>
        </div>
        <p v-if="uploadError" class="text-danger text-sm">{{ uploadError }}</p>
        <div class="imp-actions">
          <button class="btn btn-primary btn-sm" :disabled="!csvContent || previewing" @click="previewCsv">
            {{ previewing ? 'Parsing...' : 'Next: Map Columns' }}
            <ChevronRight :size="13" />
          </button>
        </div>
      </template>

      <!-- Step 2: Map columns -->
      <template v-else-if="csvStep === 2">
        <div class="imp-table-wrap">
          <table class="imp-table">
            <thead><tr><th v-for="h in csvHeaders" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, i) in csvPreview" :key="i">
                <td v-for="h in csvHeaders" :key="h">{{ row[h] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="imp-grid">
          <div>
            <label class="form-label">Test Pack Column *</label>
            <select v-model="csvMappings.testPack" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Test Case Name *</label>
            <select v-model="csvMappings.testCase" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Test Steps *</label>
            <select v-model="csvMappings.testSteps" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Expected Results *</label>
            <select v-model="csvMappings.expectedResults" class="form-select">
              <option value="">Select...</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">URL (optional)</label>
            <select v-model="csvMappings.url" class="form-select">
              <option value="">None</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Tags (optional)</label>
            <select v-model="csvMappings.tags" class="form-select">
              <option value="">None</option>
              <option v-for="h in csvHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>
        <p v-if="mappingError" class="text-danger text-sm">{{ mappingError }}</p>
        <div class="imp-actions imp-actions--spread">
          <button class="btn btn-sm btn-secondary" @click="csvStep = 1"><ArrowLeft :size="13" /> Back</button>
          <button class="btn btn-sm btn-primary" :disabled="!csvMappingsComplete" @click="validateMappings">
            Next: Review <ChevronRight :size="13" />
          </button>
        </div>
      </template>

      <!-- Step 3: Review -->
      <template v-else-if="csvStep === 3">
        <p class="text-sm text-muted mb-2">{{ Object.keys(groupedTests).length }} packs · {{ totalTests }} tests</p>
        <div class="imp-review-list">
          <div v-for="(tests, packName) in groupedTests" :key="packName" class="imp-review-pack">
            <div class="imp-review-pack-header">
              <Package :size="13" class="text-primary" />
              <span class="text-sm font-medium">{{ packName }}</span>
              <span class="text-xs text-muted ml-auto">{{ tests.length }}</span>
            </div>
            <div class="imp-review-tests">
              <div v-for="(t, i) in tests.slice(0,3)" :key="i" class="text-xs text-body py-1 border-b border-border last:border-0">{{ t.name }}</div>
              <div v-if="tests.length > 3" class="text-xs text-muted py-1">+{{ tests.length - 3 }} more</div>
            </div>
          </div>
        </div>

        <div class="imp-options">
          <label class="form-label">Default URL (optional)</label>
          <input v-model="csvOptions.defaultUrl" type="url" class="form-input" placeholder="https://example.com" />
          <p class="text-xs text-muted mt-1">Applied to tests with no URL column value</p>
          <label class="imp-check-row mt-2">
            <input type="checkbox" v-model="csvOptions.generateImmediately" class="form-checkbox" />
            <span class="text-sm text-body">Generate code during import</span>
          </label>
          <p class="text-xs text-muted pl-5">Not recommended — use Generate All after import instead</p>
        </div>

        <div class="imp-actions imp-actions--spread">
          <button class="btn btn-sm btn-secondary" @click="csvStep = 2"><ArrowLeft :size="13" /> Back</button>
          <button class="btn btn-sm btn-primary" @click="startImport">
            <Sparkles :size="13" />
            {{ csvOptions.generateImmediately ? 'Import & Generate' : 'Import Tests' }}
          </button>
        </div>
      </template>

      <!-- Step 4: Progress -->
      <template v-else-if="csvStep === 4">
        <div v-if="!importComplete" class="imp-progress">
          <div class="imp-progress-bar">
            <div class="imp-progress-fill" :style="{ width: progressPercent + '%' }" />
          </div>
          <span class="text-xs text-muted">{{ progressPhase }} · {{ progressCurrent }}/{{ progressTotal }}</span>
        </div>

        <div class="imp-log">
          <div v-for="(ev, i) in progressEvents" :key="i" class="imp-log-row">
            <CheckCircle v-if="ev.status === 'ready' || ev.status === 'complete'" :size="12" class="text-success flex-shrink-0" />
            <XCircle v-else-if="ev.status === 'failed'" :size="12" class="text-danger flex-shrink-0" />
            <Loader2 v-else-if="ev.status === 'generating'" :size="12" class="animate-spin text-primary flex-shrink-0" />
            <span v-else class="imp-log-dot" />
            <span class="text-xs text-body">{{ ev.message }}</span>
          </div>
        </div>

        <div v-if="importComplete" class="imp-summary">
          <CheckCircle :size="16" class="text-success" />
          <div>
            <p class="text-sm font-medium text-success">Import complete</p>
            <p class="text-xs text-muted">{{ summary.packs }} packs · {{ summary.specs }} tests{{ summary.generated ? ` · ${summary.generated} generated` : '' }}</p>
          </div>
          <button class="btn btn-sm btn-primary ml-auto" @click="resetAndRefresh">
            <RefreshCw :size="13" />
            Done
          </button>
        </div>
      </template>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import {
  FileText, ClipboardPaste, Sparkles, Upload, ChevronRight, ArrowLeft,
  CheckCircle, XCircle, Loader2, Bot, Package, Database, Trash2, Plus,
  X, RefreshCw, AlertCircle
} from 'lucide-vue-next'
import api, { getApiBaseUrl } from '@/lib/api'

const emit = defineEmits(['refresh'])

const importTabs = [
  { id: 'csv',   label: 'CSV File',  icon: FileText },
  { id: 'paste', label: 'Paste',     icon: ClipboardPaste },
  { id: 'ai',    label: 'AI Extract', icon: Sparkles }
]
const importMode = ref('csv')
const packs = ref([])

onMounted(async () => {
  try {
    const { data } = await api.get('/api/agent-tests/packs')
    packs.value = data.packs || data || []
  } catch { packs.value = [] }
})

// ── AI mode ───────────────────────────────────────────────────────────────────
const aiInput = reactive({ text: '', targetUrl: '', packId: '', newPackName: '', generateCode: false })
const aiExtracting = ref(false)
const aiError = ref('')
const aiResults = ref([])
const aiImporting = ref(false)

async function extractWithAI() {
  aiExtracting.value = true
  aiError.value = ''
  aiResults.value = []
  try {
    const { data } = await api.post('/api/test-cases/extract', { text: aiInput.text, targetUrl: aiInput.targetUrl || null })
    aiResults.value = data.testCases || []
    if (!aiResults.value.length) aiError.value = 'No test cases extracted — try adding more detail'
  } catch (e) {
    aiError.value = e.response?.data?.error || 'Extraction failed'
  } finally { aiExtracting.value = false }
}

async function importAIResults() {
  aiImporting.value = true
  aiError.value = ''
  try {
    await api.post('/api/test-cases/import-extracted', {
      testCases: aiResults.value.filter(tc => tc.name.trim() && tc.steps.trim()),
      targetUrl: aiInput.targetUrl || null,
      packId: aiInput.packId || null,
      newPackName: aiInput.newPackName || null,
      generateCode: aiInput.generateCode
    })
    aiResults.value = []
    aiInput.text = ''
    emit('refresh')
  } catch (e) {
    aiError.value = e.response?.data?.error || 'Import failed'
  } finally { aiImporting.value = false }
}

// ── Paste mode ────────────────────────────────────────────────────────────────
const pasteText = ref('')
const pasteAs = ref('testCases')
const pasteDatasetName = ref('')
const pastePackId = ref('')
const pasteMappings = reactive({ name: '', steps: '', expected: '' })
const pastePreview = reactive({ headers: [], rows: [] })
const pasteError = ref('')
const pasteImporting = ref(false)

watch(pasteText, text => {
  if (!text.trim()) { pastePreview.headers = []; pastePreview.rows = []; return }
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) return
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delim).map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const vals = line.split(delim)
    const row = {}
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
    return row
  })
  pastePreview.headers = headers
  pastePreview.rows = rows
  if (!pasteDatasetName.value && headers[0]) pasteDatasetName.value = headers[0]
})

async function importPasted() {
  pasteImporting.value = true
  pasteError.value = ''
  try {
    if (pasteAs.value === 'testData') {
      const csvText = [
        pastePreview.headers.join(','),
        ...pastePreview.rows.map(row =>
          pastePreview.headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n')
      await api.post(`/api/test-data?filename=${encodeURIComponent(pasteDatasetName.value || 'Pasted Data')}.csv`, csvText, {
        headers: { 'Content-Type': 'text/plain' }
      })
    } else {
      if (!pasteMappings.name || !pasteMappings.steps) {
        pasteError.value = 'Select Name and Steps columns'
        pasteImporting.value = false
        return
      }
      const testCases = pastePreview.rows
        .filter(row => row[pasteMappings.name]?.trim())
        .map(row => ({
          name: row[pasteMappings.name] || '',
          steps: row[pasteMappings.steps] || '',
          expected: pasteMappings.expected ? (row[pasteMappings.expected] || '') : ''
        }))
      await api.post('/api/test-cases/import-extracted', { testCases, packId: pastePackId.value || null, generateCode: false })
    }
    pasteText.value = ''
    emit('refresh')
  } catch (e) {
    pasteError.value = e.response?.data?.error || 'Import failed'
  } finally { pasteImporting.value = false }
}

// ── CSV mode ──────────────────────────────────────────────────────────────────
const csvStep = ref(1)
const dragOver = ref(false)
const csvFileName = ref('')
const csvContent = ref('')
const csvRowCount = ref(0)
const uploadError = ref('')
const previewing = ref(false)
const csvHeaders = ref([])
const csvPreview = ref([])
const csvMappings = reactive({ testPack: '', testCase: '', testSteps: '', expectedResults: '', url: '', tags: '' })
const mappingError = ref('')
const groupedTests = ref({})
const totalTests = ref(0)
const csvOptions = reactive({ generateImmediately: false, defaultUrl: '' })
const progressPhase = ref('')
const progressCurrent = ref(0)
const progressTotal = ref(0)
const progressEvents = ref([])
const importComplete = ref(false)
const summary = ref({})

const csvMappingsComplete = computed(() =>
  csvMappings.testPack && csvMappings.testCase && csvMappings.testSteps && csvMappings.expectedResults
)
const progressPercent = computed(() =>
  progressTotal.value === 0 ? 0 : Math.round(progressCurrent.value / progressTotal.value * 100)
)

function handleFileSelect(e) { const f = e.target.files[0]; if (f) processFile(f) }
function handleDrop(e) { dragOver.value = false; const f = e.dataTransfer.files[0]; if (f) processFile(f) }

function processFile(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    uploadError.value = 'Please upload a CSV file'
    return
  }
  uploadError.value = ''
  csvFileName.value = file.name
  const reader = new FileReader()
  reader.onload = e => {
    csvContent.value = e.target.result
    csvRowCount.value = Math.max(0, csvContent.value.split('\n').filter(l => l.trim()).length - 1)
  }
  reader.readAsText(file)
}

async function previewCsv() {
  previewing.value = true
  uploadError.value = ''
  try {
    const { data } = await api.post('/api/test-cases/preview', { csv: csvContent.value })
    csvHeaders.value = data.headers
    csvPreview.value = data.preview
    csvRowCount.value = data.rowCount
    if (data.suggestions) {
      Object.assign(csvMappings, {
        testPack: data.suggestions.testPack || '',
        testCase: data.suggestions.testCase || '',
        testSteps: data.suggestions.testSteps || '',
        expectedResults: data.suggestions.expectedResults || '',
        url: data.suggestions.url || '',
        tags: data.suggestions.tags || ''
      })
    }
    csvStep.value = 2
  } catch (e) {
    uploadError.value = e.response?.data?.error || 'Failed to parse CSV'
  } finally { previewing.value = false }
}

function parseCSVLocal(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  function parseLine(line) {
    const fields = []; let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++; let val = ''
        while (i < line.length) {
          if (line[i] === '"' && line[i+1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else val += line[i++]
        }
        fields.push(val); if (line[i] === ',') i++
      } else {
        let val = ''
        while (i < line.length && line[i] !== ',') val += line[i++]
        fields.push(val.trim()); if (line[i] === ',') i++
      }
    }
    return fields
  }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const vals = parseLine(line); const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] !== undefined ? vals[idx] : '' })
    return row
  })
  return { headers, rows }
}

function validateMappings() {
  mappingError.value = ''
  const missing = ['testPack','testCase','testSteps','expectedResults'].filter(f => !csvMappings[f])
  if (missing.length) { mappingError.value = `Missing: ${missing.join(', ')}`; return }
  const { rows } = parseCSVLocal(csvContent.value)
  const grouped = {}
  for (const row of rows) {
    const packName = (row[csvMappings.testPack] || '').trim()
    const testName = (row[csvMappings.testCase] || '').trim()
    if (!packName || !testName) continue
    if (!grouped[packName]) grouped[packName] = []
    grouped[packName].push({ name: testName })
  }
  groupedTests.value = grouped
  totalTests.value = Object.values(grouped).flat().length
  csvStep.value = 3
}

async function startImport() {
  csvStep.value = 4
  progressEvents.value = []
  importComplete.value = false
  progressPhase.value = 'Starting...'
  progressCurrent.value = 0
  progressTotal.value = totalTests.value

  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/test-cases/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: csvContent.value,
        mappings: { ...csvMappings },
        options: { generateImmediately: csvOptions.generateImmediately, defaultUrl: csvOptions.defaultUrl, teamId: null }
      })
    })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { handleProgressEvent(JSON.parse(line.slice(6))) } catch { /* skip */ }
        }
      }
    }
  } catch (e) {
    progressEvents.value.push({ status: 'failed', message: e.message })
  }
}

function handleProgressEvent(event) {
  if (event.phase === 'import') {
    progressPhase.value = 'Importing...'
    if (event.status === 'starting') {
      progressTotal.value = event.totalRows || totalTests.value
      progressEvents.value.push({ status: 'info', message: `Importing ${event.totalRows} rows...` })
    } else if (event.status === 'progress') {
      progressCurrent.value = event.createdSpecs || 0
    } else if (event.status === 'complete') {
      progressEvents.value.push({ status: 'complete', message: `Created ${event.packs} packs · ${event.specs} tests` })
      if (event.skipped) progressEvents.value.push({ status: 'info', message: `Skipped ${event.skipped} incomplete rows` })
    }
  } else if (event.phase === 'generation') {
    progressPhase.value = 'Generating...'
    if (event.status === 'starting') { progressTotal.value = event.total; progressCurrent.value = 0 }
    else if (event.status === 'generating') progressCurrent.value = event.current
    else if (event.status === 'ready') {
      progressEvents.value.push({ status: 'ready', message: `Generated: ${event.specName}` })
      progressCurrent.value = event.current
    } else if (event.status === 'failed') {
      progressEvents.value.push({ status: 'failed', message: `Failed: ${event.specName}` })
      progressCurrent.value = event.current
    }
  } else if (event.phase === 'complete') {
    summary.value = event.summary || {}
    importComplete.value = true
    progressPhase.value = 'Done'
  } else if (event.phase === 'error') {
    progressEvents.value.push({ status: 'failed', message: event.error })
  }
}

function resetAndRefresh() {
  csvStep.value = 1
  csvFileName.value = ''
  csvContent.value = ''
  csvRowCount.value = 0
  progressEvents.value = []
  importComplete.value = false
  summary.value = {}
  emit('refresh')
}
</script>

<style scoped>
.import-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.imp-tabs {
  display: flex;
  gap: 2px;
  padding: 10px 14px 0;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.imp-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-muted);
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s;
}
.imp-tab:hover { color: var(--color-heading); }
.imp-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

.imp-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  flex: 1;
}

.imp-mono { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 11px; }
.imp-mono-sm { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 11px; width: 100%; resize: none; }

.imp-row { display: flex; gap: 10px; }
.imp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.imp-indent { padding-left: 12px; border-left: 2px solid var(--color-primary); }

.imp-check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.imp-actions { display: flex; justify-content: flex-end; }
.imp-actions--spread { display: flex; justify-content: space-between; }

.imp-divider { border-top: 1px solid var(--color-border); }

.imp-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.imp-ai-list { display: flex; flex-direction: column; gap: 10px; }
.imp-ai-item {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 6px;
  position: relative;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.imp-ai-name { grid-column: 1 / -1; }
.imp-ai-del { position: absolute; top: 6px; right: 6px; }

.imp-dropzone {
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.imp-dropzone:hover { border-color: var(--color-primary); }
.imp-dropzone--over { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 6%, transparent); }

.imp-file-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, #28C76F 10%, transparent);
  border-radius: 6px;
}

.imp-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.imp-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.imp-table th {
  padding: 5px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--color-muted);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}
.imp-table td {
  padding: 4px 10px;
  color: var(--color-body);
  border-bottom: 1px solid var(--color-border);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.imp-table-more { text-align: center; color: var(--color-muted); }

.imp-review-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.imp-review-pack { border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; }
.imp-review-pack-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  background: var(--color-surface);
}
.imp-review-tests { padding: 4px 10px; }

.imp-options { display: flex; flex-direction: column; gap: 4px; }

.imp-progress { display: flex; flex-direction: column; gap: 4px; }
.imp-progress-bar {
  height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden;
}
.imp-progress-fill {
  height: 100%; background: var(--color-primary); border-radius: 3px; transition: width 0.3s;
}

.imp-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.imp-log-row { display: flex; align-items: flex-start; gap: 6px; }
.imp-log-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-border); flex-shrink: 0; margin-top: 3px; }

.imp-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: color-mix(in srgb, #28C76F 10%, transparent);
  border-radius: 8px;
}

.icon-btn {
  background: none; border: none; cursor: pointer;
  display: flex; padding: 3px; border-radius: 3px; transition: color 0.15s;
}
</style>
