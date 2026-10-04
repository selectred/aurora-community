<template>
  <div class="record-panel">
    <!-- Start row -->
    <div class="rec-start-row">
      <div class="gen-field gen-field--url">
        <label class="form-label">Start URL</label>
        <input
          v-model="startUrl"
          type="text"
          class="form-input"
          placeholder="https://your-app.com/login"
          :disabled="!!sessionId"
        />
      </div>
      <div class="rec-start-actions">
        <button
          v-if="!sessionId"
          class="btn btn-primary btn-sm"
          :disabled="!startUrl || starting"
          @click="startRecording"
        >
          <Circle :size="13" class="rec-dot" />
          {{ starting ? 'Starting...' : 'Start Recording' }}
        </button>
        <button
          v-else
          class="btn btn-danger btn-sm"
          :disabled="stopping"
          @click="stopRecording"
        >
          <Square :size="13" />
          {{ stopping ? 'Stopping...' : 'Stop Recording' }}
        </button>
      </div>
    </div>

    <!-- Status -->
    <div v-if="sessionId" class="rec-status">
      <span class="rec-indicator" />
      <span class="text-xs">Recording in browser — interact with the page to capture steps</span>
      <span class="text-xs text-muted ml-auto">{{ steps.length }} step{{ steps.length !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Test case reference: replace mode uses replaceSpec, normal mode uses selectedSpec -->
    <div v-if="referenceSpec" class="rec-original">
      <div class="rec-original-header">
        <FileText :size="13" class="text-muted" />
        <span class="text-xs font-medium text-muted">
          {{ replaceSpec ? 'Original spec — recording a replacement' : 'Test case — record steps to satisfy this' }}
        </span>
        <button class="icon-btn text-muted ml-auto" style="padding:2px;" @click="refExpanded = !refExpanded">
          <ChevronDown :size="12" :style="refExpanded ? 'transform:rotate(180deg)' : ''" />
        </button>
      </div>
      <div v-if="refExpanded" class="rec-original-body">
        <pre class="rec-original-text">{{ referenceSpec.markdownSpec || referenceSpec.name }}</pre>
      </div>
    </div>

    <!-- Steps list -->
    <div class="rec-steps-section">
      <div class="rec-steps-header">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">Captured Steps</span>
        <button
          v-if="steps.length && !sessionId"
          class="btn btn-sm btn-secondary"
          @click="clearSteps"
        >
          Clear
        </button>
      </div>

      <div v-if="!steps.length" class="rec-steps-empty">
        <span class="text-xs text-muted">Steps will appear here as you interact with the browser...</span>
      </div>

      <div v-else class="rec-steps-list">
        <div
          v-for="(step, i) in steps"
          :key="i"
          class="rec-step"
        >
          <span class="rec-step-num">{{ i + 1 }}</span>
          <component :is="stepIcon(step)" :size="12" class="rec-step-icon" />
          <span class="rec-step-desc">{{ describeStep(step) }}</span>
          <button
            v-if="!sessionId"
            class="rec-step-del"
            @click="removeStep(i)"
            title="Remove step"
          >
            <X :size="11" />
          </button>
        </div>
      </div>
    </div>

    <!-- Generated code -->
    <div v-if="generatedCode || (steps.length && !sessionId)" class="rec-code-section">
      <div class="rec-code-header">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">Generated Code</span>
        <div class="flex items-center gap-2">
          <button v-if="steps.length && !sessionId" class="btn btn-sm btn-secondary" @click="regenerateCode">
            <RefreshCw :size="11" />
            Regenerate
          </button>
          <button v-if="generatedCode" class="btn btn-sm btn-secondary" @click="copyCode">
            <Copy :size="11" />
            Copy
          </button>
        </div>
      </div>
      <textarea
        v-model="generatedCode"
        class="rec-code-editor"
        rows="8"
        spellcheck="false"
      />
    </div>

    <!-- Save actions -->
    <div v-if="generatedCode" class="rec-save-row">
      <button
        v-if="replaceSpec"
        class="btn btn-sm btn-primary"
        :disabled="saving"
        @click="replaceSpecCode"
      >
        <CheckCircle :size="14" />
        {{ saving ? 'Saving...' : 'Replace Spec' }}
      </button>
      <button
        class="btn btn-sm btn-secondary"
        :disabled="saving"
        @click="saveAsNew = true; openSaveModal()"
      >
        <Save :size="14" />
        Save as New Spec
      </button>
    </div>

    <!-- k6 load test from the same recording -->
    <div v-if="lastSessionId && !sessionId" class="rec-k6">
      <button v-if="!showK6" class="btn btn-sm btn-secondary" :disabled="!trafficCount" data-testid="rec-create-k6"
        :title="trafficCount ? '' : 'This recording captured no page loads or API calls'" @click="showK6 = true">
        <Gauge :size="14" />
        Create k6 load test ({{ trafficCount }} request{{ trafficCount === 1 ? '' : 's' }} captured)
      </button>
      <K6Panel v-else :session-id="lastSessionId" :default-name="(replaceSpec?.name || selectedSpec?.name || 'Recorded journey')" @log="e => emit('log', e)" />
    </div>

    <!-- Save modal -->
    <div v-if="showSaveModal" class="modal-backdrop" @click.self="showSaveModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold text-heading">Save Recorded Test</h3>
          <button class="modal-close" @click="showSaveModal = false"><X :size="16" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Spec Name</label>
            <input v-model="saveForm.name" type="text" class="form-input" />
          </div>
          <div>
            <label class="form-label">Test Pack</label>
            <select v-model="saveForm.packId" class="form-select">
              <option value="">— No pack —</option>
              <option v-for="p in packs" :key="p.packId || p.id" :value="p.packId || p.id">
                {{ p.name || p.packName }}
              </option>
            </select>
          </div>
          <p v-if="saveError" class="text-danger text-sm">{{ saveError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" @click="showSaveModal = false">Cancel</button>
          <button class="btn btn-primary btn-sm" :disabled="saving" @click="confirmSave">
            <Save :size="14" />
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import {
  Circle, Square, X, FileText, RefreshCw, Copy, Save, CheckCircle,
  MousePointer, Type, ChevronsUpDown, Navigation, ChevronDown, Gauge
} from 'lucide-vue-next'
import K6Panel from './K6Panel.vue'
import api, { getApiBaseUrl } from '@/lib/api'

const props = defineProps({
  replaceSpec:    { type: Object, default: null },
  selectedSpec:   { type: Object, default: null },
  selectedPackId: { type: String, default: null }
})

const emit = defineEmits(['log', 'spec-saved', 'spec-replaced'])

// Replace mode shows the spec being replaced; normal mode shows the selected spec as a test case reference
const referenceSpec = computed(() => props.replaceSpec || (props.selectedSpec?.markdownSpec ? props.selectedSpec : null))
const refExpanded   = ref(true)

const startUrl      = ref(props.replaceSpec?.url || props.selectedSpec?.url || '')
const sessionId     = ref(null)
const starting      = ref(false)
const stopping      = ref(false)
const steps         = ref([])
const generatedCode = ref('')
const saving        = ref(false)
const saveError     = ref('')
const showSaveModal = ref(false)
const saveForm      = ref({ name: '', packId: '' })
const packs         = ref([])
const saveAsNew     = ref(false)
// The recording also captures HTTP traffic; kept after stop for k6 generation.
const lastSessionId = ref(null)
const trafficCount  = ref(0)
const showK6        = ref(false)

let sseSource = null

function log(type, content) {
  emit('log', { type, content, timestamp: Date.now() })
}

async function startRecording() {
  starting.value = true
  log('step', `Starting recording session for ${startUrl.value}…`)
  try {
    const { data } = await api.post('/api/agent-tests/recording/start', { url: startUrl.value })
    sessionId.value = data.sessionId
    lastSessionId.value = data.sessionId
    trafficCount.value = 0
    showK6.value = false
    steps.value = []
    generatedCode.value = ''
    listenForSteps(data.sessionId)
    log('info', 'Browser opened — interact with the page. Steps are captured automatically.')
  } catch (e) {
    log('error', e?.response?.data?.message || 'Failed to start recording')
  } finally {
    starting.value = false
  }
}

function listenForSteps(sid) {
  const baseUrl = getApiBaseUrl()
  sseSource = new EventSource(`${baseUrl}/api/agent-tests/recording/stream/${sid}`)
  sseSource.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data)
      if (ev.type === 'step') {
        steps.value = [...steps.value, ev.step]
      } else if (ev.type === 'stopped') {
        steps.value = ev.steps || steps.value
        generatedCode.value = ev.code || ''
        trafficCount.value = ev.trafficCount || 0
        sessionId.value = null
        sseSource?.close()
        sseSource = null
        log('done', `Recording stopped — ${steps.value.length} steps captured`)
      }
    } catch { /* ignore */ }
  }
  sseSource.onerror = () => {
    if (!sessionId.value) return
    log('warn', 'SSE connection dropped — reconnecting...')
    sseSource?.close()
    setTimeout(() => { if (sessionId.value) listenForSteps(sessionId.value) }, 2000)
  }
}

async function stopRecording() {
  if (!sessionId.value) return
  stopping.value = true
  try {
    const { data } = await api.post(`/api/agent-tests/recording/stop/${sessionId.value}`)
    steps.value = data.steps || steps.value
    generatedCode.value = data.code || ''
    trafficCount.value = data.trafficCount || 0
    sessionId.value = null
    sseSource?.close()
    sseSource = null
    log('done', `Recording stopped — ${steps.value.length} steps captured`)
  } catch (e) {
    log('error', e?.response?.data?.message || 'Failed to stop recording')
  } finally {
    stopping.value = false
  }
}

async function removeStep(index) {
  steps.value.splice(index, 1)
  log('info', `Step ${index + 1} removed`)
  regenerateCode()
}

function clearSteps() {
  steps.value = []
  generatedCode.value = ''
}

async function regenerateCode() {
  if (!sessionId.value) {
    // Re-call the generate function locally (no active session — use steps we have)
    // POST steps to a dedicated endpoint or derive locally
    // For now regenerate from current steps by calling a lightweight endpoint
    try {
      // If no session is active, we can't call the backend's session-based generator.
      // Instead we'll call a steps-only endpoint.
      const { data } = await api.post('/api/agent-tests/recording/generate-code', { steps: steps.value })
      generatedCode.value = data.code || ''
    } catch {
      // Fallback: keep existing code
    }
  }
}

function copyCode() {
  navigator.clipboard.writeText(generatedCode.value).catch(() => {})
}

async function openSaveModal() {
  saveForm.value.name = props.replaceSpec?.name || 'Recorded Test'
  saveForm.value.packId = props.selectedPackId || ''
  saveError.value = ''
  try {
    const { data } = await api.get('/api/agent-tests/packs')
    packs.value = data.packs || data || []
  } catch { packs.value = [] }
  showSaveModal.value = true
}

async function replaceSpecCode() {
  if (!props.replaceSpec || !generatedCode.value) return
  saving.value = true
  try {
    await api.patch(`/api/agent-tests/specs/${props.replaceSpec.specId}/code`, { code: generatedCode.value })
    // Log user_reject hallucination signal: user recorded to replace AI output
    api.post('/api/hallucinations/log', {
      specId: props.replaceSpec.specId,
      failureType: 'user_reject',
      aiOutputSnippet: (props.replaceSpec.generatedCode || '').slice(0, 200),
      userMessageSnippet: 'User recorded replacement flow'
    }).catch(() => {})
    log('done', `Spec "${props.replaceSpec.name}" replaced with recorded flow`)
    emit('spec-replaced', props.replaceSpec.specId)
  } catch (e) {
    log('error', e?.response?.data?.error || 'Failed to replace spec')
  } finally {
    saving.value = false
  }
}

async function confirmSave() {
  saving.value = true
  saveError.value = ''
  try {
    // Create new spec with recorded code
    const { data } = await api.post('/api/agent-tests/specs', {
      name: saveForm.value.name,
      url: startUrl.value,
      testType: 'functional',
      generatedCode: generatedCode.value,
      status: 'ready'
    })
    const specId = data.specId || data.id
    if (saveForm.value.packId && specId) {
      await api.post(`/api/agent-tests/packs/${saveForm.value.packId}/tests`, { testIds: [specId] })
    }
    showSaveModal.value = false
    log('done', `Saved "${saveForm.value.name}"`)
    emit('spec-saved', { specId, packId: saveForm.value.packId })
  } catch (e) {
    saveError.value = e?.response?.data?.error || 'Save failed'
  } finally {
    saving.value = false
  }
}

function stepIcon(step) {
  if (step.action === 'navigate') return Navigation
  if (step.action === 'fill') return Type
  if (step.action === 'select') return ChevronsUpDown
  return MousePointer
}

function describeStep(step) {
  if (step.action === 'navigate') return `Navigate → ${truncate(step.url, 60)}`
  if (step.action === 'click') return `Click "${truncate(step.name || step.role || 'element', 50)}"`
  if (step.action === 'fill') {
    const val = step.value?.includes('{{') ? step.value : `"${truncate(step.value, 30)}"`
    return `Fill "${truncate(step.name || step.placeholder || 'field', 30)}" → ${val}`
  }
  if (step.action === 'select') return `Select "${truncate(step.value, 30)}" in "${truncate(step.name, 30)}"`
  return JSON.stringify(step)
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

onUnmounted(() => { sseSource?.close() })
</script>

<style scoped>
.rec-k6 { margin-top: 12px; }
.record-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  height: 100%;
  overflow-y: auto;
}

.rec-start-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.gen-field { display: flex; flex-direction: column; gap: 4px; }
.gen-field--url { flex: 1; }
.rec-start-actions { flex-shrink: 0; padding-bottom: 1px; }

.rec-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, #EA5455 12%, transparent);
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-body);
}
.rec-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #EA5455;
  animation: rec-pulse 1s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rec-dot { color: #EA5455; animation: rec-pulse 1s ease-in-out infinite; }

.rec-original {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}
.rec-original-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.rec-original-body { padding: 10px; max-height: 120px; overflow-y: auto; }
.rec-original-text { font-size: 11px; font-family: monospace; white-space: pre-wrap; color: var(--color-muted); margin: 0; }

.rec-steps-section { display: flex; flex-direction: column; gap: 6px; }
.rec-steps-header { display: flex; align-items: center; justify-content: space-between; }
.rec-steps-empty { padding: 12px; text-align: center; }
.rec-steps-list { display: flex; flex-direction: column; gap: 3px; }

.rec-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--color-surface);
  border-radius: 5px;
  font-size: 12px;
}
.rec-step-num { font-size: 10px; color: var(--color-muted); min-width: 16px; text-align: right; flex-shrink: 0; }
.rec-step-icon { color: var(--color-muted); flex-shrink: 0; }
.rec-step-desc { flex: 1; color: var(--color-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-step-del {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  padding: 2px;
  display: flex;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}
.rec-step:hover .rec-step-del { opacity: 1; }
.rec-step-del:hover { color: #EA5455; }

.rec-code-section { display: flex; flex-direction: column; gap: 6px; }
.rec-code-header { display: flex; align-items: center; justify-content: space-between; }
.rec-code-editor {
  width: 100%;
  resize: vertical;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: #0d0d0d;
  color: #e2e8f0;
}

.rec-save-row { display: flex; gap: 8px; flex-wrap: wrap; }

/* Modal */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--color-card); border-radius: 10px;
  width: 400px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,.4);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border);
}
.modal-close { background: none; border: none; cursor: pointer; color: var(--color-muted); display: flex; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--color-border);
}
</style>
