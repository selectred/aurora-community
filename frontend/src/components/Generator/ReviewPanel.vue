<template>
  <div class="review-panel">
    <!-- No pack selected -->
    <div v-if="!selectedPack" class="review-empty">
      <ClipboardList :size="32" class="text-muted mb-2" />
      <p class="text-sm text-muted">Select a test pack from the left panel to review its specs.</p>
    </div>

    <template v-else>
      <!-- Pack header -->
      <div class="review-pack-header">
        <div>
          <h3 class="font-semibold text-heading">{{ selectedPack.packName }}</h3>
          <p class="text-xs text-muted mt-0.5">
            {{ selectedPack.specs?.length || 0 }} specs
            <template v-if="selectedPack.failed > 0">· <span class="text-danger">{{ selectedPack.failed }} failed</span></template>
            <template v-if="selectedPack.draft > 0">· <span class="text-warning">{{ selectedPack.draft }} need code</span></template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-sm btn-secondary"
            :disabled="running || healing || generating || packRunning"
            @click="runAllSpecs"
            title="Run all specs in this pack"
          >
            <Play :size="13" :class="{ 'animate-spin': packRunning }" />
            {{ packRunning ? 'Running...' : 'Run All' }}
          </button>
          <button
            class="btn btn-sm btn-secondary"
            :disabled="generating"
            @click="generateAllSpecs"
            title="Generate Playwright code for all specs in this pack"
          >
            <Bot :size="13" :class="{ 'animate-spin': generating }" />
            {{ generating ? `${genDone}/${genTotal}` : 'Generate All' }}
          </button>
          <button class="btn btn-sm btn-secondary" @click="$emit('refresh')">
            <RefreshCw :size="13" />
          </button>
        </div>
      </div>

      <!-- Pack association: initiative + feature inline -->
      <div class="pack-assoc-row">
        <label class="pack-assoc-field">
          <span class="pack-assoc-label">Initiative</span>
          <select v-model="packForm.initiativeId" class="pack-assoc-select" @change="onInitiativeChange">
            <option value="">— none —</option>
            <option v-for="i in initiatives" :key="i.id" :value="i.id">{{ i.name }}</option>
          </select>
        </label>
        <span class="text-muted" style="font-size:10px;margin-top:14px">›</span>
        <label class="pack-assoc-field">
          <span class="pack-assoc-label">Feature</span>
          <select v-model="packForm.featureId" class="pack-assoc-select" :disabled="!packForm.initiativeId">
            <option value="">— none —</option>
            <option v-for="f in packFeatures" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <div class="pack-assoc-actions">
          <button
            class="btn btn-xs btn-primary"
            @click="savePackAssociation"
            :disabled="packFormSaving"
            title="Save initiative/feature association"
          >
            <Save :size="11" />
            {{ packFormSaving ? '…' : 'Save' }}
          </button>
          <span v-if="packFormSaved" class="text-xs text-success">✓ Saved</span>
          <span v-if="packFormError" class="text-xs text-danger" style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ packFormError }}</span>
        </div>
      </div>

      <!-- Spec detail -->
      <div v-if="selectedSpec" class="review-spec-detail">
        <!-- Spec header -->
        <div class="review-spec-header">
          <div class="flex items-center gap-2 min-w-0">
            <component
              :is="specIcon(selectedSpec)"
              :size="14"
              :style="{ color: specColor(selectedSpec) }"
            />
            <span class="font-medium text-heading text-sm truncate">{{ selectedSpec.name }}</span>
            <span
              v-if="selectedSpec.healCount > 0"
              class="badge"
              style="background:color-mix(in srgb,#FF9F43 15%,transparent);color:#FF9F43;font-size:10px;"
              :title="`Healed ${selectedSpec.healCount} time(s)`"
            >Healed {{ selectedSpec.healCount }}×</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="selectedSpec.hasCode"
              class="btn btn-sm btn-secondary"
              :disabled="running || healing || generating"
              @click="runSpec"
            >
              <Play :size="11" :class="{ 'animate-spin': running }" />
              {{ running ? 'Running...' : 'Run' }}
            </button>
            <button
              v-if="selectedSpec.hasCode"
              class="btn btn-sm btn-secondary"
              :disabled="running || healing || refactoring || generating"
              @click="healSpec"
            >
              <Wrench :size="11" :class="{ 'animate-spin': healing }" />
              {{ healing ? 'Healing...' : 'Heal' }}
            </button>
            <button
              v-if="selectedSpec.hasCode"
              class="btn btn-sm btn-secondary review-refactor-btn"
              :disabled="running || healing || refactoring || generating"
              @click="refactorSpec"
              title="Ask AI to replace hardcoded counts, indices, and data-state values with dynamic equivalents"
            >
              <Sparkles :size="11" :class="{ 'animate-spin': refactoring }" />
              {{ refactoring ? 'Refactoring...' : 'Refactor' }}
            </button>
            <button
              class="btn btn-sm btn-secondary"
              :disabled="running || healing || refactoring || generating"
              @click="generateSpecCode"
            >
              <Bot :size="11" :class="{ 'animate-spin': generating }" />
              {{ generating ? 'Generating...' : (selectedSpec.hasCode ? 'Regen' : 'Generate') }}
            </button>
            <button
              class="btn btn-sm btn-warning"
              @click="$emit('record-to-replace', selectedSpec)"
              title="Open step recorder to replace this spec's AI-generated code"
            >
              <Circle :size="11" />
              Record Replace
            </button>
          </div>
        </div>

        <!-- Markdown spec (original test case) -->
        <div v-if="selectedSpec.markdownSpec" class="review-markdown">
          <div class="review-section-label">Original Test Case</div>
          <div class="review-markdown-body">
            <pre>{{ selectedSpec.markdownSpec }}</pre>
          </div>
        </div>

        <!-- Code editor -->
        <div class="review-code-section">
          <div class="review-section-label-row">
            <span class="review-section-label">Generated Code</span>
            <div class="flex items-center gap-2">
              <button
                v-if="codeViewMode && failingLineNums.length > 0"
                class="btn btn-sm btn-secondary"
                @click="codeViewMode = false"
                title="Switch to edit mode"
              >
                <Pencil :size="11" />
                Edit
              </button>
              <button
                v-if="!codeViewMode && failingLineNums.length > 0"
                class="btn btn-sm btn-secondary review-errors-btn"
                @click="codeViewMode = true"
                title="Show failing lines"
              >
                <Eye :size="11" />
                Errors
              </button>
              <span v-if="codeDirty" class="text-xs text-warning">Unsaved changes</span>
              <button v-if="codeDirty" class="btn btn-sm btn-primary" :disabled="codeSaving" @click="saveCode">
                <Save :size="11" />
                {{ codeSaving ? 'Saving...' : 'Save' }}
              </button>
              <button class="btn btn-sm btn-secondary" @click="copyCode">
                <Copy :size="11" />
              </button>
            </div>
          </div>
          <!-- Line-highlighted view — shown after a failed run -->
          <div v-if="codeViewMode && failingLineNums.length > 0" class="review-code-highlight">
            <div
              v-for="(line, i) in codeEdit.split('\n')"
              :key="i"
              class="review-code-line"
              :class="failingLineNums.includes(i + 1) ? 'review-code-line--error' : 'review-code-line--normal'"
            >
              <span class="review-code-linenum" :class="failingLineNums.includes(i + 1) ? 'review-code-linenum--error' : ''">{{ i + 1 }}</span>
              <span class="review-code-text" :class="failingLineNums.includes(i + 1) ? 'review-code-text--error' : ''">{{ line }}</span>
            </div>
          </div>
          <!-- Editable textarea — default view -->
          <textarea
            v-else
            v-model="codeEdit"
            class="review-code-editor"
            spellcheck="false"
            :placeholder="selectedSpec.hasCode ? '' : 'No code generated yet — click Generate'"
            @input="codeDirty = true"
          />
        </div>

        <!-- Result banner -->
        <div v-if="lastResult" class="review-result" :class="lastResult.status === 'passed' ? 'review-result--pass' : 'review-result--fail'">
          <component :is="lastResult.status === 'passed' ? CheckCircle : XCircle" :size="14" />
          <span class="text-sm">{{ lastResult.status === 'passed' ? 'Test passed' : `Failed — ${lastResult.error || 'see console'}` }}</span>
        </div>
      </div>

      <!-- No spec selected -->
      <div v-else class="review-no-spec">
        <p class="text-xs text-muted">Select a spec from the left panel, or generate code for all specs above.</p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import {
  ClipboardList, Bot, RefreshCw, Play, Wrench, Save, Copy, Circle,
  CheckCircle, XCircle, AlertCircle, Eye, Pencil, Sparkles
} from 'lucide-vue-next'
import api, { getApiBaseUrl } from '@/lib/api'

const props = defineProps({
  selectedPack: { type: Object, default: null },
  selectedSpec: { type: Object, default: null }
})

const emit = defineEmits(['log', 'refresh', 'record-to-replace', 'spec-updated'])

const running     = ref(false)
const healing     = ref(false)
const refactoring = ref(false)
const generating  = ref(false)
const packRunning = ref(false)
const initiatives    = ref([])
const packFeatures   = ref([])
const packForm       = ref({ initiativeId: '', featureId: '' })
const packFormSaving = ref(false)
const packFormSaved  = ref(false)
const packFormError  = ref('')
const genDone     = ref(0)
const genTotal    = ref(0)

const codeEdit      = ref('')
const codeDirty     = ref(false)
const codeSaving    = ref(false)
const lastResult    = ref(null)
const codeViewMode  = ref(false)
const failingLineNums = ref([])

function log(type, content) {
  emit('log', { type, content, timestamp: Date.now() })
}

// When pack selection changes, pre-populate the association dropdowns
watch(() => props.selectedPack?.packId, async (packId) => {
  packFormSaved.value = false
  packFormError.value = ''
  const pack = props.selectedPack
  if (!pack) { packForm.value = { initiativeId: '', featureId: '' }; packFeatures.value = []; return }

  const initId = pack.feature?.initiativeId || pack.initiativeId || ''
  packForm.value = { initiativeId: initId, featureId: pack.featureId || '' }

  if (!initiatives.value.length) {
    try {
      const { data } = await api.get('/api/initiatives')
      initiatives.value = data.initiatives || data || []
    } catch { initiatives.value = [] }
  }

  if (initId) {
    try {
      const { data } = await api.get(`/api/features?initiativeId=${initId}`)
      packFeatures.value = data.features || data || []
    } catch { packFeatures.value = [] }
  } else {
    packFeatures.value = []
  }
}, { immediate: true })

watch(() => props.selectedSpec?.specId, async (newId) => {
  if (!newId) { codeEdit.value = ''; codeDirty.value = false; lastResult.value = null; failingLineNums.value = []; codeViewMode.value = false; return }
  codeDirty.value = false
  lastResult.value = null
  failingLineNums.value = []
  codeViewMode.value = false
  let code = props.selectedSpec?.generatedCode || ''
  if (!code && props.selectedSpec?.hasCode) {
    try {
      const { data } = await api.get(`/api/agent-tests/specs/${newId}`)
      code = data.generatedCode || ''
    } catch { /* ignore */ }
  }
  codeEdit.value = code
}, { immediate: true })

async function runSpec() {
  if (!props.selectedSpec) return
  running.value = true
  lastResult.value = null
  log('step', `Running: ${props.selectedSpec.name}`)
  try {
    const { data } = await api.post(
      `/api/agent-tests/specs/${props.selectedSpec.specId}/run`, {}, { timeout: 120000 }
    )
    lastResult.value = { status: data.status, error: data.error }
    log(data.status === 'passed' ? 'done' : 'error',
      data.status === 'passed' ? 'Test passed' : `Test failed — ${data.error || 'see steps'}`)
    // Collect failing line numbers and auto-switch to highlight view
    if (data.status !== 'passed') {
      const nums = []
      for (const step of (data.steps || [])) {
        if (!step.success && step.errorLine && !nums.includes(step.errorLine)) nums.push(step.errorLine)
      }
      failingLineNums.value = nums
      if (nums.length > 0) codeViewMode.value = true
    } else {
      failingLineNums.value = []
      codeViewMode.value = false
    }
    emit('spec-updated', { specId: props.selectedSpec.specId, status: data.status })
  } catch (e) {
    log('error', e?.response?.data?.error || 'Run failed')
  } finally { running.value = false }
}

async function healSpec() {
  if (!props.selectedSpec) return
  healing.value = true
  log('step', `Healing: ${props.selectedSpec.name}`)
  try {
    const baseUrl = getApiBaseUrl()
    const resp = await fetch(`${baseUrl}/api/agent-tests/specs/${props.selectedSpec.specId}/heal-stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    })
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { const ev = JSON.parse(line.slice(6)); log(ev.type, ev.message || '') } catch { /* ignore */ }
      }
    }
    // Reload healed code
    const { data } = await api.get(`/api/agent-tests/specs/${props.selectedSpec.specId}`)
    codeEdit.value = data.generatedCode || ''
    codeDirty.value = false
    emit('refresh')
  } catch (e) {
    log('error', e?.message || 'Heal failed')
  } finally { healing.value = false }
}

async function refactorSpec() {
  if (!props.selectedSpec) return
  refactoring.value = true
  log('step', `Refactoring: ${props.selectedSpec.name}`)
  try {
    const baseUrl = getApiBaseUrl()
    const resp = await fetch(`${baseUrl}/api/agent-tests/specs/${props.selectedSpec.specId}/refactor-stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }
    })
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try { const ev = JSON.parse(line.slice(6)); log(ev.type, ev.message || '') } catch { /* ignore */ }
      }
    }
    // Reload refactored code
    const { data } = await api.get(`/api/agent-tests/specs/${props.selectedSpec.specId}`)
    codeEdit.value = data.generatedCode || ''
    codeDirty.value = false
    emit('refresh')
  } catch (e) {
    log('error', e?.message || 'Refactor failed')
  } finally { refactoring.value = false }
}

async function generateSpecCode() {
  if (!props.selectedSpec) return
  generating.value = true
  log('step', `Generating code for: ${props.selectedSpec.name}`)
  try {
    const { data } = await api.post(
      `/api/agent-tests/specs/${props.selectedSpec.specId}/generate`, {}, { timeout: 180000 }
    )
    codeEdit.value = data.generatedCode || ''
    codeDirty.value = false
    log('done', 'Code generated')
    emit('spec-updated', { specId: props.selectedSpec.specId, status: data.status || 'ready', hasCode: true })
  } catch (e) {
    log('error', e?.response?.data?.error || 'Generation failed')
  } finally { generating.value = false }
}

async function runAllSpecs() {
  if (!props.selectedPack) return
  packRunning.value = true
  log('step', `Running all specs in "${props.selectedPack.packName}"…`)
  try {
    const { data } = await api.post(
      `/api/agent-tests/packs/${props.selectedPack.packId}/run`, {}, { timeout: 300000 }
    )
    const passed = data.passed ?? 0
    const failed = data.failed ?? 0
    log(failed === 0 ? 'done' : 'error', `Pack run complete — ${passed} passed, ${failed} failed`)
    emit('refresh')
  } catch (e) {
    log('error', e?.response?.data?.error || 'Pack run failed')
  } finally { packRunning.value = false }
}

async function generateAllSpecs() {
  if (!props.selectedPack?.specs?.length) return
  generating.value = true
  genDone.value = 0
  genTotal.value = props.selectedPack.specs.length
  for (const spec of props.selectedPack.specs) {
    log('step', `[${genDone.value + 1}/${genTotal.value}] ${spec.name}`)
    try {
      await api.post(`/api/agent-tests/specs/${spec.specId}/generate`, {}, { timeout: 180000 })
      log('done', `✓ ${spec.name}`)
    } catch (e) {
      log('error', `✗ ${spec.name} — ${e?.response?.data?.error || e.message}`)
    }
    genDone.value++
  }
  generating.value = false
  emit('refresh')
}

async function onInitiativeChange() {
  packForm.value.featureId = ''
  packFeatures.value = []
  if (!packForm.value.initiativeId) return
  try {
    const { data } = await api.get(`/api/features?initiativeId=${packForm.value.initiativeId}`)
    packFeatures.value = data.features || data || []
  } catch { packFeatures.value = [] }
}

async function savePackAssociation() {
  if (!props.selectedPack) return
  packFormSaving.value = true
  packFormSaved.value = false
  packFormError.value = ''
  try {
    await api.put(`/api/agent-tests/packs/${props.selectedPack.packId}`, {
      featureId: packForm.value.featureId || null,
      initiativeId: packForm.value.initiativeId || null
    })
    packFormSaved.value = true
    setTimeout(() => { packFormSaved.value = false }, 2000)
    emit('refresh')
  } catch (e) {
    packFormError.value = e?.response?.data?.message || 'Failed to save'
  } finally { packFormSaving.value = false }
}

async function saveCode() {
  if (!props.selectedSpec) return
  codeSaving.value = true
  try {
    await api.patch(`/api/agent-tests/specs/${props.selectedSpec.specId}/code`, { code: codeEdit.value })
    codeDirty.value = false
    emit('spec-updated', { specId: props.selectedSpec.specId, hasCode: true, status: 'ready' })
  } catch { /* ignore */ } finally { codeSaving.value = false }
}

function copyCode() {
  navigator.clipboard.writeText(codeEdit.value).catch(() => {})
}

function specIcon(spec) {
  if (spec.status === 'passed') return CheckCircle
  if (spec.status === 'failed') return XCircle
  if (spec.hasCode) return Play
  return AlertCircle
}

function specColor(spec) {
  if (spec.status === 'passed') return '#28C76F'
  if (spec.status === 'failed') return '#EA5455'
  if (spec.hasCode) return '#7367F0'
  return '#94a3b8'
}
</script>

<style scoped>
.review-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  height: 100%;
  overflow: hidden;
}

.review-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}

.review-pack-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.review-spec-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.review-spec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.review-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted);
  margin-bottom: 4px;
}

.review-section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.review-markdown {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}
.review-markdown-body {
  max-height: 120px;
  overflow-y: auto;
  padding: 8px 12px;
  background: var(--color-surface);
}
.review-markdown-body pre {
  font-size: 11px;
  font-family: monospace;
  white-space: pre-wrap;
  color: var(--color-muted);
  margin: 0;
}

.review-code-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.review-code-editor {
  width: 100%;
  flex: 1;
  min-height: 150px;
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

.review-code-highlight {
  flex: 1;
  min-height: 150px;
  overflow: auto;
  background: #0d0d0d;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 0;
}

.review-code-line {
  display: flex;
  min-height: 1.6em;
}
.review-code-line--error {
  background: rgba(239, 68, 68, 0.15);
  border-left: 2px solid #ef4444;
}
.review-code-line--normal {
  border-left: 2px solid transparent;
}
.review-code-linenum {
  width: 44px;
  flex-shrink: 0;
  text-align: right;
  padding: 0 14px 0 8px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  user-select: none;
  color: rgba(255,255,255,0.2);
}
.review-code-linenum--error { color: #f87171; }

.review-code-text {
  flex: 1;
  white-space: pre;
  padding-right: 16px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(255,255,255,0.82);
}
.review-code-text--error { color: #fca5a5; }

.review-errors-btn {
  border-color: rgba(239, 68, 68, 0.4) !important;
  background: rgba(239, 68, 68, 0.1) !important;
  color: #f87171 !important;
}

.review-refactor-btn {
  border-color: rgba(115, 103, 240, 0.4) !important;
  background: rgba(115, 103, 240, 0.1) !important;
  color: #9d94f5 !important;
}

.review-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
}
.review-result--pass { background: color-mix(in srgb, #28C76F 12%, transparent); color: #28C76F; }
.review-result--fail { background: color-mix(in srgb, #EA5455 12%, transparent); color: #EA5455; }

.pack-assoc-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 7px 0 9px;
  border-bottom: 1px solid var(--color-border);
}
.pack-assoc-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.pack-assoc-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  padding-left: 1px;
}
.pack-assoc-select {
  width: 100%;
  font-size: 11px;
  padding: 4px 8px;
  height: 26px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  color: var(--color-heading);
  outline: none;
}
.pack-assoc-select:focus {
  border-color: var(--color-primary);
}
.pack-assoc-select:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pack-assoc-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  flex-shrink: 0;
  padding-bottom: 1px;
}

.review-no-spec {
  padding: 20px;
  text-align: center;
}
</style>
