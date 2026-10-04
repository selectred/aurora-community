<template>
  <div class="space-y-6" data-testid="page-data-backup">
    <!-- Export Card -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <Download :size="20" class="text-primary" />
          Export Data
        </h2>
        <p class="text-sm text-muted mt-1">Download all your Aurora data as a portable JSON file</p>
      </div>
      <div class="card-body">
        <!-- Summary counts -->
        <div v-if="exportSummary" class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          <div v-for="item in exportSummaryItems" :key="item.label"
            class="bg-surface-2 rounded-lg p-3 text-center border border-default">
            <div class="text-xl font-bold text-heading">{{ item.count }}</div>
            <div class="text-xs text-muted mt-0.5">{{ item.label }}</div>
          </div>
        </div>
        <div v-else-if="summaryLoading" class="flex items-center gap-2 text-muted text-sm mb-5">
          <Loader2 :size="16" class="animate-spin" />
          Loading summary...
        </div>

        <button
          @click="exportData"
          :disabled="exporting"
          class="btn btn-primary"
          aria-label="Export all data"
        >
          <Download v-if="!exporting" :size="16" />
          <Loader2 v-else :size="16" class="animate-spin" />
          {{ exporting ? 'Preparing export...' : 'Export all data' }}
        </button>
        <p class="text-xs text-muted mt-2">
          API keys are never included in the export file.
        </p>
      </div>
    </div>

    <!-- Import Card -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <Upload :size="20" class="text-primary" />
          Import Data
        </h2>
        <p class="text-sm text-muted mt-1">Restore data from a previous Aurora export. Existing records are never overwritten.</p>
      </div>
      <div class="card-body space-y-4">
        <!-- File picker -->
        <div>
          <label class="form-label">Select export file</label>
          <div
            class="border-2 border-dashed border-default rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
            :class="{ 'border-primary bg-primary/5': dragOver }"
            @click="triggerFilePicker"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="handleFileDrop"
          >
            <FileJson :size="32" class="mx-auto mb-2 text-muted" />
            <p class="text-sm text-heading font-medium">
              {{ selectedFile ? selectedFile.name : 'Click to select or drag & drop' }}
            </p>
            <p class="text-xs text-muted mt-1">aurora-export-YYYY-MM-DD.json</p>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".json"
            class="hidden"
            @change="handleFileSelect"
          />
        </div>

        <!-- File parse error -->
        <div v-if="fileError" class="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20">
          <AlertCircle :size="16" class="text-danger mt-0.5 shrink-0" />
          <p class="text-sm text-danger">{{ fileError }}</p>
        </div>

        <!-- Preview counts -->
        <div v-if="importPreview" class="rounded-lg border border-default overflow-hidden">
          <div class="px-4 py-3 bg-surface-2 border-b border-default flex items-center justify-between">
            <span class="text-sm font-medium text-heading">File Preview</span>
            <span class="text-xs text-muted">
              Exported {{ formatDate(importPreview.exportedAt) }} · Aurora v{{ importPreview.auroraVersion }}
            </span>
          </div>
          <div class="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div v-for="item in previewItems" :key="item.label"
              class="bg-surface-2 rounded-lg p-3 text-center border border-default">
              <div class="text-xl font-bold text-heading">{{ item.count }}</div>
              <div class="text-xs text-muted mt-0.5">{{ item.label }}</div>
            </div>
          </div>
        </div>

        <!-- Import button -->
        <div class="flex items-center gap-3">
          <button
            @click="showConfirmModal = true"
            :disabled="!importPreview || importing"
            class="btn btn-primary"
            aria-label="Import"
          >
            <Upload :size="16" />
            Import
          </button>
          <button
            v-if="selectedFile"
            @click="clearFile"
            class="btn btn-secondary"
            aria-label="Clear selected file"
          >
            Clear
          </button>
        </div>

        <!-- Import result -->
        <div v-if="importResult" class="rounded-lg border border-success/30 bg-success/5 p-4">
          <div class="flex items-center gap-2 mb-3">
            <CheckCircle2 :size="18" class="text-success" />
            <span class="font-medium text-success">Import complete</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div v-for="item in importResultItems" :key="item.label" class="text-center">
              <div class="text-sm font-semibold text-heading">
                +{{ item.imported }}
                <span v-if="item.skipped > 0" class="text-muted font-normal text-xs">({{ item.skipped }} skipped)</span>
              </div>
              <div class="text-xs text-muted">{{ item.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Load Sample Data Card -->
    <div class="card border-primary/30">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <Database :size="20" class="text-primary" />
          Sample Data
        </h2>
        <p class="text-sm text-muted mt-1">Load demonstration data to explore Aurora with pre-populated teams, test results, and initiatives.</p>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted mb-4">Creates 2 demo teams, 5 members, 6 test specs, and several months of test results. Only works on an empty database — clear existing data first if needed.</p>
        <button
          @click="loadSampleData"
          :disabled="loadingSample"
          class="btn btn-primary"
          aria-label="Load sample data"
        >
          <Database v-if="!loadingSample" :size="16" />
          <Loader2 v-else :size="16" class="animate-spin" />
          {{ loadingSample ? 'Loading...' : 'Load Sample Data' }}
        </button>
        <p v-if="loadSampleSuccess" class="text-sm text-success mt-3 flex items-center gap-2">
          <CheckCircle2 :size="14" />
          Sample data loaded — explore the dashboards to see it in action.
        </p>
        <p v-if="loadSampleError" class="text-sm text-danger mt-3">{{ loadSampleError }}</p>
      </div>
    </div>

    <!-- Clear Sample Data Card -->
    <div class="card border-danger/30">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <Trash2 :size="20" class="text-danger" />
          Clear Sample Data
        </h2>
        <p class="text-sm text-muted mt-1">Remove all demo teams, test results, synthetic monitors and initiatives so you can start fresh with your own data.</p>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted mb-4">Your profile, API keys and license are not affected. This cannot be undone.</p>
        <button
          @click="showClearModal = true"
          :disabled="clearing"
          class="btn btn-danger"
          aria-label="Clear sample data"
        >
          <Trash2 v-if="!clearing" :size="16" />
          <Loader2 v-else :size="16" class="animate-spin" />
          {{ clearing ? 'Clearing...' : 'Clear Sample Data' }}
        </button>
        <p v-if="clearSuccess" class="text-sm text-success mt-3 flex items-center gap-2">
          <CheckCircle2 :size="14" />
          Sample data cleared — ready for your own data.
        </p>
      </div>
    </div>

    <!-- Confirm Clear Modal -->
    <Teleport to="body">
      <div v-if="showClearModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50" @click="showClearModal = false" />
        <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-md p-6 z-10">
          <h3 class="text-lg font-semibold text-heading mb-2">Clear all sample data?</h3>
          <p class="text-sm text-muted mb-6">
            This will permanently delete all demo teams, members, test results, synthetic monitors, test packs and initiatives.
            Your profile, API keys and license will not be affected.
          </p>
          <div class="flex gap-3 justify-end">
            <button @click="showClearModal = false" class="btn btn-secondary" aria-label="Cancel">Cancel</button>
            <button @click="clearSampleData" class="btn btn-danger" aria-label="Confirm clear">
              Yes, clear everything
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Import Modal -->
    <Teleport to="body">
      <div v-if="showConfirmModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/50" @click="showConfirmModal = false" />
        <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-md p-6 z-10">
          <h3 class="text-lg font-semibold text-heading mb-2">Confirm Import</h3>
          <p class="text-sm text-muted mb-4">
            This will add the following records. Existing records with matching IDs will be skipped — nothing is overwritten.
          </p>
          <div v-if="importPreview" class="grid grid-cols-2 gap-2 mb-5">
            <div v-for="item in previewItems" :key="item.label"
              class="flex justify-between items-center px-3 py-2 bg-surface-2 rounded-lg border border-default text-sm">
              <span class="text-muted">{{ item.label }}</span>
              <span class="font-semibold text-heading">{{ item.count }}</span>
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <button @click="showConfirmModal = false" class="btn btn-secondary" aria-label="Cancel import">Cancel</button>
            <button @click="runImport" :disabled="importing" class="btn btn-primary" aria-label="Confirm Import">
              <Loader2 v-if="importing" :size="16" class="animate-spin" />
              {{ importing ? 'Importing...' : 'Confirm Import' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/lib/api'
import {
  Download,
  Upload,
  FileJson,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Database
} from 'lucide-vue-next'

// ── State ─────────────────────────────────────────────────────────
const exportSummary = ref(null)
const summaryLoading = ref(false)
const exporting = ref(false)

const fileInput = ref(null)
const selectedFile = ref(null)
const dragOver = ref(false)
const fileError = ref(null)
const importPreview = ref(null)
const parsedPayload = ref(null)

const showConfirmModal = ref(false)
const importing = ref(false)
const importResult = ref(null)

const showClearModal = ref(false)
const clearing = ref(false)
const clearSuccess = ref(false)

const loadingSample = ref(false)
const loadSampleSuccess = ref(false)
const loadSampleError = ref(null)

// ── Computed ──────────────────────────────────────────────────────
const exportSummaryItems = computed(() => {
  if (!exportSummary.value) return []
  const s = exportSummary.value
  return [
    { label: 'Test Results', count: s.testResults },
    { label: 'Agent Specs', count: s.agentSpecs },
    { label: 'Teams', count: s.teams },
    { label: 'Members', count: s.teamMembers },
    { label: 'Initiatives', count: s.initiatives }
  ]
})

const previewItems = computed(() => {
  if (!importPreview.value?.data) return []
  const d = importPreview.value.data
  return [
    { label: 'Test Results', count: d.testResults?.length ?? 0 },
    { label: 'Agent Specs', count: d.agentSpecs?.length ?? 0 },
    { label: 'Teams', count: d.teams?.length ?? 0 },
    { label: 'Members', count: d.teamMembers?.length ?? 0 },
    { label: 'Initiatives', count: d.initiatives?.length ?? 0 }
  ]
})

const importResultItems = computed(() => {
  if (!importResult.value) return []
  const { imported, skipped } = importResult.value
  return [
    { label: 'Test Results', imported: imported.testResults ?? 0, skipped: skipped.testResults ?? 0 },
    { label: 'Agent Specs', imported: imported.agentSpecs ?? 0, skipped: skipped.agentSpecs ?? 0 },
    { label: 'Teams', imported: imported.teams ?? 0, skipped: skipped.teams ?? 0 },
    { label: 'Members', imported: imported.teamMembers ?? 0, skipped: skipped.teamMembers ?? 0 },
    { label: 'Initiatives', imported: imported.initiatives ?? 0, skipped: skipped.initiatives ?? 0 }
  ]
})

// ── Export ────────────────────────────────────────────────────────
async function loadExportSummary() {
  summaryLoading.value = true
  try {
    const { data } = await api.get('/api/data/export/summary')
    exportSummary.value = data.summary
  } catch {
    // non-fatal
  } finally {
    summaryLoading.value = false
  }
}

async function exportData() {
  exporting.value = true
  try {
    const response = await api.get('/api/data/export', { responseType: 'blob' })
    const date = new Date().toISOString().split('T')[0]
    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `aurora-export-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // ignore
  } finally {
    exporting.value = false
  }
}

// ── Import ────────────────────────────────────────────────────────
function triggerFilePicker() {
  fileInput.value?.click()
}

function handleFileDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer.files[0]
  if (file) processFile(file)
}

function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) processFile(file)
}

function processFile(file) {
  fileError.value = null
  importPreview.value = null
  parsedPayload.value = null
  importResult.value = null
  selectedFile.value = file

  if (!file.name.endsWith('.json')) {
    fileError.value = 'Please select a .json file.'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result)
      if (!parsed.schemaVersion || !parsed.data) {
        fileError.value = 'This does not appear to be a valid Aurora export file.'
        return
      }
      parsedPayload.value = parsed
      importPreview.value = parsed
    } catch {
      fileError.value = 'Could not parse file — is it valid JSON?'
    }
  }
  reader.readAsText(file)
}

function clearFile() {
  selectedFile.value = null
  importPreview.value = null
  parsedPayload.value = null
  fileError.value = null
  importResult.value = null
  if (fileInput.value) fileInput.value.value = ''
}

async function runImport() {
  if (!parsedPayload.value) return
  importing.value = true
  showConfirmModal.value = false
  try {
    const { data } = await api.post('/api/data/import', parsedPayload.value)
    importResult.value = data.summary
    clearFile()
    await loadExportSummary()
  } catch (err) {
    fileError.value = err.response?.data?.message || 'Import failed. Please try again.'
  } finally {
    importing.value = false
  }
}

// ── Load Sample Data ──────────────────────────────────────────
async function loadSampleData() {
  loadingSample.value = true
  loadSampleSuccess.value = false
  loadSampleError.value = null
  try {
    await api.post('/api/data/load-sample-data')
    loadSampleSuccess.value = true
    await loadExportSummary()
  } catch (err) {
    loadSampleError.value = err.response?.data?.message || 'Failed to load sample data.'
  } finally {
    loadingSample.value = false
  }
}

// ── Clear Sample Data ─────────────────────────────────────────────
async function clearSampleData() {
  showClearModal.value = false
  clearing.value = true
  clearSuccess.value = false
  try {
    await api.post('/api/data/clear-sample-data')
    clearSuccess.value = true
    await loadExportSummary()
  } catch (err) {
    fileError.value = err.response?.data?.message || 'Failed to clear data.'
  } finally {
    clearing.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

onMounted(loadExportSummary)
</script>
