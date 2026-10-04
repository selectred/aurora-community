<template>
  <div class="script-editor-overlay" @mousedown.self="$emit('close')">
    <div class="script-editor">

      <!-- Header -->
      <div class="script-editor-header">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-heading truncate">{{ spec.name }}</h2>
          <div v-if="editingUrl" class="flex items-center gap-1 mt-0.5">
            <input
              v-model="urlDraft"
              type="url"
              class="input input-sm text-xs flex-1 min-w-0"
              placeholder="https://your-app.example.com"
              @keydown.enter="saveUrl"
              @keydown.escape="editingUrl = false"
            />
            <button @click="saveUrl" :disabled="savingUrl" class="btn btn-xs btn-primary shrink-0">{{ savingUrl ? '…' : 'Save' }}</button>
            <button @click="editingUrl = false" class="btn btn-xs btn-secondary shrink-0">✕</button>
          </div>
          <button v-else @click="editingUrl = true" class="text-xs text-muted truncate hover:text-primary text-left">
            {{ urlDraft || 'No URL — click to set' }}
          </button>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span :class="['badge', statusClass]">{{ currentStatus }}</span>
          <button @click="$emit('close')" class="btn btn-sm btn-secondary">
            <X :size="16" />
          </button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="script-editor-toolbar">
        <button v-if="isPlaceholder" @click="generateCode" :disabled="generating" class="btn btn-sm btn-primary">
          <Loader2 v-if="generating" :size="14" class="animate-spin" />
          <Wand2 v-else :size="14" />
          {{ generating ? 'Generating…' : 'Generate' }}
        </button>
        <button @click="runSpec" :disabled="running || isPlaceholder" class="btn btn-sm btn-success">
          <Loader2 v-if="running" :size="14" class="animate-spin" />
          <Play v-else :size="14" />
          {{ running ? 'Running…' : 'Run' }}
        </button>
        <button @click="saveCode" :disabled="saving || !dirty" class="btn btn-sm btn-primary">
          <Save :size="14" />
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button @click="resetCode" :disabled="!dirty" class="btn btn-sm btn-secondary">Reset</button>
        <span v-if="dirty" class="text-xs text-warning ml-1">Unsaved changes</span>

        <div class="ml-auto flex items-center gap-2">
          <button
            v-if="steps.length === 0 && !rawMode"
            @click="rawMode = true"
            class="text-xs text-muted hover:text-heading"
            title="No step markers found — switch to raw edit"
          >
            No steps parsed
          </button>
          <button @click="rawMode = !rawMode" class="btn btn-sm btn-secondary">
            {{ rawMode ? 'Step view' : 'Raw code' }}
          </button>
        </div>
      </div>

      <!-- Run result banner -->
      <div v-if="runResult" :class="['run-result-banner', runResult.status === 'passed' ? 'run-result-pass' : 'run-result-fail']">
        <template v-if="runResult.status === 'passed'">
          <CheckCircle :size="14" />
          All tests passed ({{ runResult.duration }}ms)
        </template>
        <template v-else>
          <XCircle :size="14" />
          <span class="font-medium">{{ runResult.error }}</span>
        </template>
      </div>

      <!-- Body -->
      <div class="script-editor-body">

        <!-- Raw code mode -->
        <div v-if="rawMode" class="h-full flex flex-col p-4">
          <textarea
            v-model="rawCode"
            class="flex-1 font-mono text-xs bg-gray-900 text-gray-100 p-3 rounded resize-none outline-none border border-border focus:border-primary"
            spellcheck="false"
            @input="onRawInput"
          />
        </div>

        <!-- Step view mode -->
        <div v-else class="p-4 space-y-3">

          <!-- Preamble (collapsed by default) -->
          <div class="rounded border border-border overflow-hidden">
            <button
              @click="preambleOpen = !preambleOpen"
              class="w-full flex items-center gap-2 px-3 py-2 bg-surface text-muted text-xs hover:text-heading transition-colors text-left"
            >
              <ChevronDown :size="12" :class="['transition-transform', preambleOpen ? '' : '-rotate-90']" />
              Preamble ({{ preambleLineCount }} lines)
            </button>
            <div v-if="preambleOpen" class="border-t border-border">
              <textarea
                v-model="preamble"
                class="w-full font-mono text-xs bg-gray-900 text-gray-100 p-3 resize-none outline-none"
                :rows="Math.min(preambleLineCount + 1, 12)"
                spellcheck="false"
                @input="markDirty"
              />
            </div>
          </div>

          <!-- No steps found message -->
          <div v-if="steps.length === 0" class="text-center py-8 text-muted text-sm">
            <p>No step markers found in this code.</p>
            <p class="text-xs mt-1">Step markers are indented <code>// comments</code> followed by <code>await</code> calls. Use Raw Code to edit directly.</p>
          </div>

          <!-- Step cards -->
          <div
            v-for="(step, idx) in steps"
            :key="idx"
            :class="[
              'step-card rounded border overflow-hidden transition-colors',
              failedStepIdx === idx ? 'border-danger' : 'border-border',
              failedStepIdx === idx ? 'bg-red-950/20' : ''
            ]"
          >
            <!-- Step header -->
            <div class="flex items-center gap-2 px-3 py-2 bg-surface">
              <span class="text-xs text-muted font-mono w-5 text-right shrink-0">{{ idx + 1 }}</span>
              <span :class="['w-2 h-2 rounded-full shrink-0', stepStatusDot(idx)]" />
              <span class="text-sm text-heading truncate flex-1">{{ step.label }}</span>
              <div class="flex gap-1 shrink-0">
                <button
                  v-if="failedStepIdx === idx || !runResult"
                  @click="healStep(idx)"
                  :disabled="healingStep === idx"
                  class="btn btn-xs btn-warning"
                  title="AI-fix this step with a fresh page probe"
                >
                  <Loader2 v-if="healingStep === idx" :size="10" class="animate-spin" />
                  <RefreshCw v-else :size="10" />
                  {{ healingStep === idx ? 'Healing…' : 'Heal' }}
                </button>
                <button @click="toggleEdit(idx)" class="btn btn-xs btn-secondary">
                  {{ editingStep === idx ? 'Done' : 'Edit' }}
                </button>
              </div>
            </div>

            <!-- Step error -->
            <div
              v-if="failedStepIdx === idx && runResult?.error"
              class="flex items-start gap-2 px-3 py-2 bg-red-900/30 border-t border-danger/30 text-danger text-xs"
            >
              <AlertTriangle :size="12" class="mt-0.5 shrink-0" />
              <span class="font-mono break-all">{{ runResult.error }}</span>
            </div>

            <!-- Step code (editable textarea or read-only pre) -->
            <div class="border-t border-border">
              <textarea
                v-if="editingStep === idx"
                v-model="steps[idx].code"
                class="w-full font-mono text-xs bg-gray-900 text-gray-100 p-3 resize-y outline-none"
                rows="6"
                spellcheck="false"
                @input="markDirty"
              />
              <pre v-else class="font-mono text-xs bg-gray-900 text-gray-100 p-3 overflow-x-auto whitespace-pre">{{ step.code }}</pre>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  X, Play, Save, RefreshCw, Loader2, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, Wand2
} from 'lucide-vue-next'
import api from '@/lib/api'

const props = defineProps({
  spec: { type: Object, required: true }
})

const emit = defineEmits(['close', 'saved'])

// ── State ──────────────────────────────────────────────
const rawMode = ref(false)
const rawCode = ref('')
const preamble = ref('')
const steps = ref([])
const preambleOpen = ref(false)
const editingStep = ref(null)
const healingStep = ref(null)
const dirty = ref(false)
const saving = ref(false)
const running = ref(false)
const generating = ref(false)
const runResult = ref(null)
const currentStatus = ref(props.spec.status)

const editingUrl = ref(false)
const urlDraft = ref(props.spec.url || '')
const savingUrl = ref(false)

async function saveUrl() {
  if (savingUrl.value) return
  savingUrl.value = true
  try {
    await api.put(`/api/agent-tests/specs/${props.spec.specId}`, { url: urlDraft.value })
    editingUrl.value = false
  } catch (e) {
    console.error('Failed to save URL:', e)
  } finally {
    savingUrl.value = false
  }
}

const isPlaceholder = computed(() =>
  !props.spec.generatedCode || props.spec.generatedCode.trim() === '// generated'
)

// ── Derived ────────────────────────────────────────────
const statusClass = computed(() => ({
  ready: 'badge-success',
  passed: 'badge-success',
  failed: 'badge-danger',
  draft: 'badge-secondary',
  generating: 'badge-info',
  healing: 'badge-warning',
}[currentStatus.value] || 'badge-secondary'))

const preambleLineCount = computed(() => preamble.value.split('\n').length)

const failedStepIdx = computed(() => {
  if (!runResult.value || runResult.value.status === 'passed') return -1
  return attributeErrorToStep(steps.value, runResult.value.error)
})

// ── Init ───────────────────────────────────────────────
function init() {
  const code = props.spec.generatedCode || ''
  rawCode.value = code
  const parsed = parseCodeIntoSteps(code)
  preamble.value = parsed.preamble
  steps.value = parsed.steps
  dirty.value = false
  runResult.value = null
  editingStep.value = null
  healingStep.value = null
}

init()
watch(() => props.spec.specId, init)

// ── Step parsing ───────────────────────────────────────
function parseCodeIntoSteps(code) {
  if (!code?.trim()) return { preamble: '', steps: [] }
  const lines = code.split('\n')

  // A step comment is an indented // line whose next non-empty, non-comment line is await/expect/page.*
  function isStepStart(i) {
    if (!/^\s{2,}\/\/\s+\S/.test(lines[i])) return false
    for (let k = i + 1; k < Math.min(i + 7, lines.length); k++) {
      const t = lines[k].trim()
      if (!t) continue
      if (/^\/\//.test(t)) break
      return /^(await\s|expect\s*\(|page\.)/.test(t)
    }
    return false
  }

  const firstStep = lines.findIndex((_, i) => isStepStart(i))
  if (firstStep < 0) return { preamble: code, steps: [] }

  const parsedPreamble = lines.slice(0, firstStep).join('\n')
  const result = []
  let current = null

  for (let i = firstStep; i < lines.length; i++) {
    if (isStepStart(i)) {
      if (current) result.push(current)
      const label = lines[i].trim().replace(/^\/\/\s*/, '').replace(/\s*\|\s*$/, '').trim()
      current = { label, code: lines[i] }
    } else if (current) {
      current.code += '\n' + lines[i]
    }
  }
  if (current) result.push(current)

  return { preamble: parsedPreamble, steps: result }
}

function assembleCode() {
  if (rawMode.value) return rawCode.value
  return preamble.value + '\n' + steps.value.map(s => s.code).join('\n')
}

// ── Error attribution ──────────────────────────────────
function attributeErrorToStep(stepsArr, errorMsg) {
  if (!errorMsg || !stepsArr.length) return -1
  const checks = [
    [/page\.goto/i,            /page\.goto/],
    [/Locator\.click|\.click/i, /\.click\s*\(/],
    [/Locator\.fill/i,         /\.fill\s*\(/],
    [/Locator\.type/i,         /\.type\s*\(/],
    [/Locator\.select/i,       /\.selectOption/],
    [/toBeVisible/i,           /toBeVisible/],
    [/toHaveText/i,            /toHaveText/],
    [/toHaveURL/i,             /toHaveURL/],
    [/toHaveTitle/i,           /toHaveTitle/],
    [/waitForURL/i,            /waitForURL/],
    [/waitFor/i,               /waitFor/],
    [/getByRole/i,             /getByRole/],
    [/getByText/i,             /getByText/],
    [/getByLabel/i,            /getByLabel/],
    [/getByPlaceholder/i,      /getByPlaceholder/],
  ]
  for (const [errPat, codePat] of checks) {
    if (errPat.test(errorMsg)) {
      const idx = stepsArr.findIndex(s => codePat.test(s.code))
      if (idx >= 0) return idx
    }
  }
  return stepsArr.length - 1
}

// ── Step status dot ────────────────────────────────────
function stepStatusDot(idx) {
  if (!runResult.value) return 'bg-gray-500'
  if (runResult.value.status === 'passed') return 'bg-green-500'
  if (failedStepIdx.value === idx) return 'bg-red-500'
  if (idx < failedStepIdx.value) return 'bg-green-500'
  return 'bg-gray-500'
}

// ── Actions ────────────────────────────────────────────
function markDirty() {
  dirty.value = true
}

function onRawInput() {
  dirty.value = true
  // Re-parse steps silently so switching back to step view is in sync
  const parsed = parseCodeIntoSteps(rawCode.value)
  preamble.value = parsed.preamble
  steps.value = parsed.steps
}

function toggleEdit(idx) {
  editingStep.value = editingStep.value === idx ? null : idx
}

function resetCode() {
  init()
}

async function generateCode() {
  generating.value = true
  try {
    const { data } = await api.post(`/api/agent-tests/specs/${props.spec.specId}/generate`)
    const code = data.generatedCode || ''
    rawCode.value = code
    const parsed = parseCodeIntoSteps(code)
    preamble.value = parsed.preamble
    steps.value = parsed.steps
    dirty.value = false
    runResult.value = null
    currentStatus.value = 'ready'
  } catch (e) {
    console.error('Failed to generate code:', e)
  } finally {
    generating.value = false
  }
}

async function saveCode() {
  saving.value = true
  try {
    await api.patch(`/api/agent-tests/specs/${props.spec.specId}/code`, { code: assembleCode() })
    dirty.value = false
    currentStatus.value = 'ready'
    emit('saved')
  } catch (e) {
    console.error('Failed to save code:', e)
  } finally {
    saving.value = false
  }
}

async function runSpec() {
  running.value = true
  runResult.value = null
  try {
    const { data } = await api.post(`/api/agent-tests/specs/${props.spec.specId}/run`, {}, { timeout: 120000 })
    runResult.value = data
    currentStatus.value = data.status
  } catch (e) {
    runResult.value = { status: 'failed', error: e.response?.data?.error || e.message }
    currentStatus.value = 'failed'
  } finally {
    running.value = false
  }
}

async function healStep(idx) {
  healingStep.value = idx
  try {
    const full = assembleCode()
    const { data } = await api.post(`/api/agent-tests/specs/${props.spec.specId}/heal-step`, {
      stepCode: steps.value[idx].code,
      errorMessage: failedStepIdx.value === idx ? runResult.value?.error || '' : '',
      fullCode: full
    })
    if (data.fixedStep) {
      steps.value[idx].code = data.fixedStep
      // Re-derive label from first comment line in the fixed step
      const firstLine = data.fixedStep.split('\n').find(l => /^\s*\/\//.test(l))
      if (firstLine) {
        steps.value[idx].label = firstLine.trim().replace(/^\/\/\s*/, '').replace(/\s*\|\s*$/, '').trim()
      }
      markDirty()
    }
  } catch (e) {
    console.error('Failed to heal step:', e)
  } finally {
    healingStep.value = null
  }
}
</script>

<style scoped>
.script-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.script-editor {
  width: min(820px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--color-background, #1a1a2e);
  border-left: 1px solid var(--color-border, #2d2d44);
  height: 100vh;
  overflow: hidden;
}

.script-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border, #2d2d44);
  background: var(--color-surface, #1e1e3a);
  flex-shrink: 0;
}

.script-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-bottom: 1px solid var(--color-border, #2d2d44);
  background: var(--color-surface, #1e1e3a);
  flex-shrink: 0;
}

.run-result-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  font-size: 0.8125rem;
  flex-shrink: 0;
}

.run-result-pass {
  background: rgba(40, 199, 111, 0.15);
  color: #28c76f;
  border-bottom: 1px solid rgba(40, 199, 111, 0.25);
}

.run-result-fail {
  background: rgba(234, 84, 85, 0.15);
  color: #ea5455;
  border-bottom: 1px solid rgba(234, 84, 85, 0.25);
}

.script-editor-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.btn-xs {
  padding: 0.2rem 0.5rem;
  font-size: 0.7rem;
  line-height: 1.2;
  border-radius: 0.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
