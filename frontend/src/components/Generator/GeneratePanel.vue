<template>
  <div class="generate-panel">
    <!-- Config row -->
    <div class="gen-config">
      <div class="gen-field">
        <label class="form-label">Test Name</label>
        <input v-model="testName" type="text" class="form-input" placeholder="Login flow" :disabled="isRunning" />
      </div>
      <div class="gen-field gen-field--url">
        <label class="form-label">Target URL</label>
        <input v-model="targetUrl" type="text" class="form-input" placeholder="https://your-app.com" :disabled="isRunning" />
      </div>
    </div>

    <!-- Plan editor -->
    <div class="gen-plan">
      <div class="gen-plan-header">
        <span class="text-xs font-medium text-muted uppercase tracking-wide">Test Plan (Markdown)</span>
        <span v-if="store.hasPlan" class="badge badge-primary" style="font-size:10px;padding:1px 5px;">AI Plan</span>
      </div>
      <textarea
        v-model="userInput"
        class="gen-plan-editor"
        placeholder="Describe what to test, or click Probe then Plan to let AI write it for you..."
        :disabled="isRunning"
        rows="6"
      />
    </div>

    <!-- Action strip -->
    <div class="gen-actions">
      <button
        class="btn btn-sm btn-secondary"
        :disabled="!targetUrl || isRunning"
        @click="runProbe"
        title="Crawl the target URL to discover page elements (optional but improves quality)"
      >
        <Search :size="14" :class="{ 'animate-spin': step === 'probe' }" />
        Probe
      </button>
      <ChevronRight :size="14" class="text-muted" />
      <button
        class="btn btn-sm btn-secondary"
        :disabled="!userInput.trim() || isRunning"
        @click="runPlan"
        title="Generate a structured test plan from your description"
      >
        <FileText :size="14" :class="{ 'animate-spin': step === 'plan' }" />
        Plan
      </button>
      <ChevronRight :size="14" class="text-muted" />
      <button
        class="btn btn-sm btn-primary"
        :disabled="!store.hasPlan || isRunning"
        @click="runGenerate"
        title="Convert the test plan to executable Playwright code"
      >
        <Bot :size="14" :class="{ 'animate-spin': step === 'generate' }" />
        Generate
      </button>
      <ChevronRight :size="14" class="text-muted" />
      <button
        class="btn btn-sm btn-secondary"
        :disabled="!store.hasTests || isRunning"
        @click="runTest"
        title="Run the generated test against the target URL"
      >
        <Play :size="14" :class="{ 'animate-spin': step === 'run' }" />
        Run
      </button>
      <ChevronRight :size="14" class="text-muted" />
      <button
        class="btn btn-sm btn-warning"
        :disabled="!store.hasFailures || isRunning"
        @click="runHeal"
        :title="'Auto-heal failing locators using the page ARIA tree'"
      >
        <Wrench :size="14" :class="{ 'animate-spin': step === 'heal' }" />
        Heal
      </button>
      <div class="gen-actions-spacer" />
      <button
        v-if="store.hasTests"
        class="btn btn-sm btn-success"
        :disabled="isRunning"
        @click="saveSpec"
      >
        <Save :size="14" :class="{ 'animate-spin': saving }" />
        {{ saving ? 'Saving...' : `Save ${specLabel(engine)}` }}
      </button>
      <button class="btn btn-sm btn-secondary" :disabled="isRunning" @click="resetSession">
        <RotateCcw :size="14" />
        Reset
      </button>
    </div>

    <!-- Status bar -->
    <div v-if="store.isProcessing" class="gen-status">
      <Loader2 :size="13" class="animate-spin text-primary" />
      <span class="text-xs text-muted">{{ store.processingText }}</span>
    </div>
    <div v-else-if="lastResult" class="gen-status" :class="lastResult.status === 'passed' ? 'gen-status--pass' : 'gen-status--fail'">
      <component :is="lastResult.status === 'passed' ? CheckCircle : XCircle" :size="13" />
      <span class="text-xs">{{ lastResult.status === 'passed' ? 'Test passed' : `Test failed — ${lastResult.error || 'see console'}` }}</span>
    </div>

    <!-- Generated code preview -->
    <div v-if="generatedCode" class="gen-code-section">
      <div class="gen-code-header">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">Generated Code</span>
        <button class="btn btn-sm btn-secondary" @click="copyCode">
          <Copy :size="11" />
          Copy
        </button>
      </div>
      <textarea
        :value="generatedCode"
        class="gen-code-editor"
        rows="10"
        spellcheck="false"
        readonly
      />
    </div>

    <!-- Save modal -->
    <div v-if="showSaveModal" class="modal-backdrop" @click.self="showSaveModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold text-heading">Save to Test Pack</h3>
          <button class="modal-close" @click="showSaveModal = false"><X :size="16" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">{{ specLabel(engine) }} Name</label>
            <input v-model="saveForm.name" type="text" class="form-input" />
          </div>
          <div>
            <label class="form-label">Test Pack</label>
            <select v-model="saveForm.packId" class="form-select">
              <option value="">— Save without pack —</option>
              <option v-for="p in compatiblePacks" :key="p.packId || p.id" :value="p.packId || p.id">{{ p.name || p.packName }}</option>
            </select>
            <p v-if="incompatiblePackCount > 0" class="text-xs text-muted" style="margin-top:4px;">
              {{ incompatiblePackCount }} pack{{ incompatiblePackCount === 1 ? '' : 's' }} hidden — {{ engineName(engine) }}-only {{ specLabel(engine, { plural: true, lower: true }) }} can't join a pack using a different engine.
            </p>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Search, FileText, Bot, Play, Wrench, Save, RotateCcw, ChevronRight,
  Loader2, CheckCircle, XCircle, X, Copy
} from 'lucide-vue-next'
import { useTerminalStore } from '@/stores/terminalStore'
import { useAppStore } from '@/stores/appStore'
import api from '@/lib/api'
import { specLabel, engineName } from '@/lib/engineTerms'

const props = defineProps({
  selectedPackId: { type: String, default: null }
})

const emit = defineEmits(['log', 'spec-saved'])

const store = useTerminalStore()
const appStore = useAppStore()

const targetUrl    = ref('')
const testName     = ref('')
const userInput    = ref('')
const engine       = ref('playwright')
const step         = ref('')  // current pipeline step for spinner
const lastResult   = ref(null)

const saving       = ref(false)
const saveError    = ref('')
const showSaveModal = ref(false)
const saveForm     = ref({ name: '', packId: '' })
const packs        = ref([])
const generatedCode = ref('')

const isRunning = ref(false)

function log(type, content) {
  emit('log', { type, content, timestamp: Date.now() })
}

// A spec can only join a pack whose existing specs share its engine (enforced server-side
// in addTestsToPack) — filter the picker instead of letting the user hit a confusing save error.
const compatiblePacks = computed(() =>
  packs.value.filter(p => !p.engine || p.engine === engine.value)
)
const incompatiblePackCount = computed(() => packs.value.length - compatiblePacks.value.length)

function copyCode() {
  if (generatedCode.value) navigator.clipboard.writeText(generatedCode.value).catch(() => {})
}

async function runProbe() {
  if (!targetUrl.value) return
  step.value = 'probe'
  isRunning.value = true
  log('step', `Probing ${targetUrl.value}…`)
  const data = await store.probe(targetUrl.value)
  if (data) log('done', `Probe complete: ${data.forms?.length || 0} forms, ${data.navigation?.length || 0} nav links`)
  else log('error', 'Probe failed — check URL and try again')
  step.value = ''
  isRunning.value = false
}

async function runPlan() {
  if (!userInput.value.trim()) return
  step.value = 'plan'
  isRunning.value = true
  log('step', 'Planning…')
  await store.plan(userInput.value, store.probeData)
  // plan result comes via WebSocket, store updates hasPlan
  // wait for store to finish (store.isProcessing drops to false)
  await waitForStore()
  step.value = ''
  isRunning.value = false
}

async function runGenerate() {
  step.value = 'generate'
  isRunning.value = true
  generatedCode.value = ''
  log('step', 'Generating Playwright code…')
  await store.generate(targetUrl.value, testName.value, engine.value)
  await waitForStore()
  if (store.hasTests) {
    log('done', 'Code generated — click Run to validate')
    if (store.currentSpecId) {
      try {
        const { data } = await api.get(`/api/agent-tests/specs/${store.currentSpecId}`)
        generatedCode.value = data.generatedCode || ''
      } catch {
        log('error', 'Generated code could not be loaded for preview — it was still saved server-side')
      }
    }
  }
  step.value = ''
  isRunning.value = false
}

async function runTest() {
  step.value = 'run'
  isRunning.value = true
  lastResult.value = null
  log('step', 'Running test…')
  await store.run()
  await waitForStore()
  if (store.lastRunSummary) {
    const s = store.lastRunSummary
    if (s.failed === 0) {
      lastResult.value = { status: 'passed' }
      log('done', 'Test passed')
    } else {
      lastResult.value = { status: 'failed', error: `${s.failed} step(s) failed` }
      log('error', `Test failed — ${s.failed} step(s) failed`)
    }
  }
  step.value = ''
  isRunning.value = false
}

async function runHeal() {
  step.value = 'heal'
  isRunning.value = true
  log('step', 'Healing failing locators…')
  await store.heal()
  await waitForStore()
  log('done', 'Heal complete — re-run to validate')
  if (store.currentSpecId) {
    try {
      const { data } = await api.get(`/api/agent-tests/specs/${store.currentSpecId}`)
      generatedCode.value = data.generatedCode || ''
    } catch { /* preview refresh is best-effort — heal already persisted server-side */ }
  }
  step.value = ''
  isRunning.value = false
}

function waitForStore() {
  return new Promise(resolve => {
    const check = () => {
      if (!store.isProcessing) { resolve(); return }
      setTimeout(check, 200)
    }
    setTimeout(check, 300)
  })
}

async function saveSpec() {
  saveForm.value.name = testName.value || 'Untitled spec'
  saveError.value = ''
  // fetch packs for picker
  try {
    const { data } = await api.get('/api/agent-tests/packs')
    packs.value = data.packs || data || []
  } catch { packs.value = [] }
  // Only pre-fill the sidebar's currently-selected pack if it's actually compatible
  // with this spec's engine. Otherwise the dropdown silently carries an invalid,
  // filtered-out pack ID that fails on save without ever appearing as a selected
  // option in compatiblePacks below - the user sees a plausible-looking pack name
  // (or a blank selection) but the real submitted value is the incompatible one.
  const preselected = packs.value.find(p => (p.packId || p.id) === props.selectedPackId)
  saveForm.value.packId = (preselected && (!preselected.engine || preselected.engine === engine.value))
    ? props.selectedPackId
    : ''
  showSaveModal.value = true
}

async function confirmSave() {
  if (!store.currentSpecId) { saveError.value = `No ${specLabel(engine.value, { lower: true })} to save — generate code first`; return }
  saving.value = true
  saveError.value = ''
  try {
    if (saveForm.value.name) {
      await api.put(`/api/agent-tests/specs/${store.currentSpecId}`, { name: saveForm.value.name })
    }
    if (saveForm.value.packId) {
      await api.post(`/api/agent-tests/packs/${saveForm.value.packId}/tests`, { testIds: [store.currentSpecId] })
    }
    showSaveModal.value = false
    log('done', `Saved "${saveForm.value.name}"${saveForm.value.packId ? ' to pack' : ''}`)
    emit('spec-saved', { specId: store.currentSpecId, packId: saveForm.value.packId })
  } catch (e) {
    saveError.value = e.response?.data?.error || 'Save failed'
  } finally {
    saving.value = false
  }
}

function resetSession() {
  store.reset()
  store.initialize()
  targetUrl.value = ''
  testName.value = ''
  userInput.value = ''
  engine.value = 'playwright'
  lastResult.value = null
  generatedCode.value = ''
  step.value = ''
  isRunning.value = false
  log('system', 'Session reset.')
}

onMounted(() => {
  store.initialize()
  const prefill = localStorage.getItem('aurora_req_prefill')
  if (prefill) {
    userInput.value = prefill
    localStorage.removeItem('aurora_req_prefill')
  }
})
onUnmounted(() => store.disconnect())

defineExpose({ resetSession })
</script>

<style scoped>
.generate-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  height: 100%;
  overflow-y: auto;
}

.gen-config {
  display: flex;
  gap: 10px;
}

.gen-field { display: flex; flex-direction: column; gap: 4px; }
.gen-field--url { flex: 1; }

.gen-plan {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gen-plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gen-plan-editor {
  width: 100%;
  resize: vertical;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-body);
  transition: border-color 0.15s;
}
.gen-plan-editor:focus { outline: none; border-color: var(--color-primary); }
.gen-plan-editor:disabled { opacity: 0.6; cursor: not-allowed; }

.gen-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.gen-actions-spacer { flex: 1; }

.gen-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--color-surface);
}
.gen-status--pass { background: color-mix(in srgb, #28C76F 12%, transparent); color: #28C76F; }
.gen-status--fail { background: color-mix(in srgb, #EA5455 12%, transparent); color: #EA5455; }

.gen-code-section { display: flex; flex-direction: column; gap: 6px; }
.gen-code-header { display: flex; align-items: center; justify-content: space-between; }
.gen-code-editor {
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

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-box {
  background: var(--color-card);
  border-radius: 10px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0,0,0,.4);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}
.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  display: flex;
}
.modal-body { padding: 20px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
}
</style>
