<template>
  <Teleport to="body">
    <div class="mcp-backdrop" @keydown.esc="closeModal">
      <div class="mcp-modal">

        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="mcp-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="min-w-0">
              <p class="mcp-label">Browser Validation</p>
              <h1 class="mcp-title truncate">{{ spec?.name || 'Loading…' }}</h1>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <label v-if="!running && !completed" class="headed-toggle">
              <input type="checkbox" v-model="headed" class="sr-only" />
              <span class="toggle-track" :class="{ active: headed }">
                <span class="toggle-knob" />
              </span>
              <Monitor :size="13" class="ml-1.5" />
              <span class="text-xs">Headed</span>
            </label>

            <button
              v-if="!running && !completed"
              @click="startValidation"
              :disabled="!spec || loadingSpec || !hasCode"
              class="btn-validate"
            >
              <ScanEye :size="15" />
              Validate with Browser
            </button>

            <button v-if="running" @click="abort" class="btn-abort">
              <X :size="15" />
              Abort
            </button>

            <button v-if="completed" @click="reset" class="btn-secondary-sm">
              <RefreshCw :size="13" />
              Run Again
            </button>

            <button v-if="completed && canApply" @click="applySpec" :disabled="applying" class="btn-apply">
              <Save :size="15" />
              <span>{{ applying ? 'Applying…' : 'Apply Validated Spec' }}</span>
            </button>

            <button class="close-btn" @click="closeModal" title="Close">
              <X :size="16" />
            </button>
          </div>
        </div>

        <!-- ── Body ────────────────────────────────────────────────── -->

        <div v-if="loadingSpec" class="mcp-empty">
          <Loader2 :size="28" class="animate-spin" style="color:var(--color-primary);opacity:0.6;" />
          <p>Loading spec…</p>
        </div>

        <div v-else-if="!spec" class="mcp-empty">
          <AlertCircle :size="32" style="color:#EA5455;opacity:0.7;" />
          <p style="color:var(--color-heading)">Could not load spec</p>
          <p class="text-sm text-muted">Check the console for details.</p>
          <button @click="closeModal" class="btn-secondary-sm" style="margin-top:8px;">Close</button>
        </div>

        <div v-else-if="!hasCode" class="mcp-empty">
          <AlertCircle :size="32" style="color:#FF9F43;opacity:0.7;" />
          <p style="color:var(--color-heading)">No generated code yet</p>
          <p class="text-sm text-muted">Generate code first, then come back to validate.</p>
        </div>

        <div v-else-if="!running && !completed" class="mcp-idle">
          <div class="idle-card">
            <ScanEye :size="40" style="color:var(--color-primary);opacity:0.35;display:block;margin:0 auto 16px;" />
            <h2>Validate selectors against a real browser</h2>
            <p>Aurora will drive a browser through each test step, discover the correct selectors, and produce a spec that works first time.</p>

            <!-- Error banner if last run failed -->
        <div v-if="lastError" style="margin-bottom:16px;padding:10px 14px;border-radius:8px;border:1px solid rgba(234,84,85,0.3);background:rgba(234,84,85,0.07);text-align:left;">
          <p style="font-size:0.75rem;font-weight:600;color:#EA5455;margin:0 0 2px;">Validation failed</p>
          <p style="font-size:0.72rem;color:var(--color-muted);margin:0;">{{ lastError }}</p>
        </div>

        <div class="idle-stats">
              <div class="stat">
                <span class="stat-n">{{ intentSteps.length || '?' }}</span>
                <span class="stat-l">Steps</span>
              </div>
              <div class="stat">
                <span class="stat-n">~{{ Math.ceil((intentSteps.length || 5) * 0.4) }}m</span>
                <span class="stat-l">Est. time</span>
              </div>
              <div class="stat">
                <span class="stat-n">{{ urlHost }}</span>
                <span class="stat-l">Target</span>
              </div>
            </div>

            <div v-if="intentSteps.length" class="idle-steps">
              <div v-for="s in intentSteps" :key="s.id" class="idle-step">
                <span class="step-type-badge" :class="`type-${s.type}`">{{ s.type }}</span>
                <span class="idle-step-intent truncate">{{ s.intent }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Running / Completed -->
        <div v-else class="mcp-main">

          <!-- Left: step list -->
          <div class="step-panel">
            <div class="step-panel-header">
              <span class="panel-label">Steps</span>
              <span v-if="running" class="panel-count">{{ doneCount }} / {{ intentSteps.length }}</span>
              <div v-if="completed" class="flex items-center gap-2" style="font-size:0.72rem;">
                <span style="color:var(--color-success)">{{ summary.pass }} passed</span>
                <span style="color:var(--color-danger)">{{ summary.fail }} failed</span>
                <span v-if="summary.skip" class="text-muted">{{ summary.skip }} skipped</span>
              </div>
            </div>

            <div v-if="running" class="progress-bar">
              <div class="progress-fill" :style="{ width: `${(doneCount / Math.max(intentSteps.length, 1)) * 100}%` }" />
            </div>

            <div class="step-list">
              <div
                v-for="step in intentSteps"
                :key="step.id"
                :class="['step-row', stepState(step.id)]"
              >
                <div class="step-status">
                  <Loader2 v-if="stepState(step.id) === 'running'" :size="14" class="animate-spin" style="color:var(--color-info)" />
                  <CheckCircle v-else-if="stepState(step.id) === 'pass'" :size="14" style="color:var(--color-success)" />
                  <XCircle v-else-if="stepState(step.id) === 'fail'" :size="14" style="color:var(--color-danger)" />
                  <MinusCircle v-else-if="stepState(step.id) === 'skip'" :size="14" style="color:var(--color-muted)" />
                  <RefreshCw v-else-if="stepState(step.id) === 'retry'" :size="14" class="animate-spin" style="color:var(--color-warning)" />
                  <Crosshair v-else-if="stepState(step.id) === 'needs-input'" :size="14" style="color:var(--color-warning)" />
                  <div v-else class="step-dot" />
                </div>
                <div class="step-content">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="step-num">{{ step.id }}</span>
                    <span class="step-type-badge" :class="`type-${step.type}`">{{ step.type }}</span>
                  </div>
                  <p class="step-intent">{{ step.intent }}</p>
                  <p v-if="stepResult(step.id)?.notes && stepState(step.id) !== 'pass'" class="step-note">{{ stepResult(step.id).notes }}</p>
                  <p v-if="stepResult(step.id)?.confidence" class="step-confidence">{{ Math.round(stepResult(step.id).confidence * 100) }}% confidence</p>
                </div>
              </div>
              <div v-if="!intentSteps.length" class="text-center py-8 text-muted" style="font-size:0.8rem;">Parsing intent…</div>
            </div>
          </div>

          <!-- Right: screenshot + log -->
          <div class="browser-panel">

            <!-- Element picker banner (shown when a step needs user interaction) -->
            <Transition name="pick-slide">
              <div v-if="needsInput" class="picker-banner" :class="{ 'picker-banner--takeover': takeOverActive }">

                <!-- Header row -->
                <div class="picker-banner-top">
                  <Loader2 v-if="submittingInput" :size="15" class="animate-spin" style="color:var(--color-warning);flex-shrink:0;" />
                  <Crosshair v-else-if="!takeOverActive" :size="15" style="color:var(--color-warning);flex-shrink:0;" />
                  <Monitor v-else :size="15" style="color:var(--color-info);flex-shrink:0;" />
                  <div class="picker-banner-text">
                    <strong v-if="submittingInput">Processing…</strong>
                    <strong v-else-if="takeOverActive" style="color:var(--color-info)">Browser control handed to you</strong>
                    <strong v-else>Step {{ needsInput.stepId }} needs help</strong>
                    <span>{{ needsInput.intent }}</span>
                  </div>
                </div>

                <template v-if="!submittingInput">

                  <!-- TAKE-OVER ACTIVE: user is doing it manually -->
                  <template v-if="takeOverActive">
                    <p class="picker-instruction" style="color:var(--color-info);">
                      The browser overlay has been removed — click into any field, type your value, and interact freely.
                      When you're done, click <strong>Continue</strong> below.
                    </p>
                    <div class="picker-hint-row">
                      <MessageSquare :size="13" style="color:var(--color-muted);flex-shrink:0;margin-top:1px;" />
                      <input
                        ref="hintInputRef"
                        v-model="userHint"
                        placeholder="Optional: describe what you did (e.g. filled team name with 'QA Team Alpha')…"
                        class="picker-hint-input"
                        @keydown.enter="pickDone"
                      />
                    </div>
                    <div class="picker-actions">
                      <button @click="pickDone" class="picker-hint-btn" style="padding:5px 14px;">
                        <CheckCircle :size="12" /> Continue
                      </button>
                      <button @click="pickAbort" class="picker-abort-btn">
                        <X :size="12" /> Abort
                      </button>
                    </div>
                  </template>

                  <!-- NORMAL MODE: element picker / hint / skip -->
                  <template v-else>
                    <p v-if="needsInput.canPick" class="picker-instruction">
                      Click the correct element in the browser (purple overlay active) — or use the options below.
                    </p>
                    <div class="picker-hint-row">
                      <MessageSquare :size="13" style="color:var(--color-muted);flex-shrink:0;margin-top:1px;" />
                      <input
                        ref="hintInputRef"
                        v-model="userHint"
                        placeholder="Type a correction hint, then press Enter or click Apply…"
                        class="picker-hint-input"
                        @keydown.enter="pickHint"
                      />
                      <button v-if="userHint.trim()" @click="pickHint" class="picker-hint-btn">Apply</button>
                    </div>
                    <div class="picker-actions">
                      <button v-if="needsInput.canPick" @click="pickTakeOver" class="picker-takeover-btn">
                        <Monitor :size="12" /> I'll do this
                      </button>
                      <button @click="pickSkip" class="picker-skip-btn">
                        <SkipForward :size="12" /> Skip step
                      </button>
                      <button @click="pickAbort" class="picker-abort-btn">
                        <X :size="12" /> Abort
                      </button>
                    </div>
                  </template>

                </template>
              </div>
            </Transition>

            <div class="screenshot-area">
              <div v-if="!latestScreenshot" class="screenshot-placeholder">
                <Monitor :size="36" style="color:rgba(255,255,255,0.12);margin-bottom:8px;" />
                <p style="font-size:0.8rem;color:var(--color-muted)">{{ running ? 'Starting browser…' : 'No screenshot' }}</p>
              </div>
              <img v-else :src="`data:image/jpeg;base64,${latestScreenshot}`" class="screenshot-img" alt="Browser screenshot" />
              <div v-if="currentUrl" class="url-bar">
                <Globe :size="11" style="color:rgba(255,255,255,0.3);flex-shrink:0;" />
                <span class="truncate" style="font-size:0.72rem;color:rgba(255,255,255,0.4);">{{ currentUrl }}</span>
              </div>
            </div>

            <div class="action-log" ref="logRef">
              <div class="log-header">
                <Terminal :size="12" style="color:rgba(255,255,255,0.3);" />
                <span style="font-size:0.7rem;color:var(--color-muted);font-weight:500;">Action log</span>
              </div>
              <div v-if="!actionLog.length" style="font-size:0.72rem;color:rgba(255,255,255,0.2);padding:6px 12px;">
                {{ running ? 'Waiting for first action…' : 'No actions recorded' }}
              </div>
              <div v-for="(entry, i) in actionLog" :key="i" class="log-entry">
                <span class="log-icon">
                  <CheckCircle v-if="entry.type === 'pass'" :size="11" style="color:var(--color-success)" />
                  <XCircle v-else-if="entry.type === 'fail' || entry.type === 'retry'" :size="11" style="color:var(--color-danger)" />
                  <MinusCircle v-else-if="entry.type === 'skip'" :size="11" style="color:var(--color-muted)" />
                  <Zap v-else :size="11" style="color:var(--color-info)" />
                </span>
                <div class="log-body">
                  <span class="log-label">{{ entry.label }}</span>
                  <span v-if="entry.detail" class="log-detail">{{ entry.detail }}</span>
                </div>
              </div>
            </div>

            <div v-if="completed && validatedSpec" class="validated-spec">
              <div class="validated-spec-header">
                <FileCode :size="13" style="color:var(--color-primary);opacity:0.7;" />
                <span style="font-size:0.72rem;font-weight:500;color:var(--color-heading);">Validated spec</span>
                <button @click="copySpec" class="copy-btn">
                  <ClipboardCopy :size="11" />
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="spec-code">{{ validatedSpec }}</pre>
            </div>
          </div>

        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Monitor, ScanEye, RefreshCw, Save, X, Loader2,
  AlertCircle, CheckCircle, XCircle, MinusCircle, Globe, Terminal,
  Zap, FileCode, ClipboardCopy, Crosshair, MessageSquare, SkipForward
} from 'lucide-vue-next'
// CheckCircle already imported above — used for Done button in take-over mode
import api, { getMcpWebSocketUrl } from '@/lib/api'

const props = defineProps({
  specId: { type: String, required: true }
})

const emit = defineEmits(['close', 'spec-applied'])

// ── Spec data ──────────────────────────────────────────────────────────────
const spec        = ref(null)
const loadingSpec = ref(true)
const hasCode     = computed(() => !!spec.value?.generatedCode || spec.value?.codeStorage === 'file')
const urlHost     = computed(() => {
  try { return spec.value?.url ? new URL(spec.value.url).hostname : '—' } catch { return '—' }
})

// ── Validation state ────────────────────────────────────────────────────────
const headed          = ref(false)
const running         = ref(false)
const completed       = ref(false)
const lastError       = ref('')    // persists after running → false so user can see it
const sessionId   = ref(null)
const applying    = ref(false)
const copied      = ref(false)

const intentSteps     = ref([])
const latestScreenshot = ref(null)
const currentUrl      = ref('')
const actionLog       = ref([])
const stepResults     = ref({})
const currentStepId   = ref(null)
const summary         = ref({ pass: 0, fail: 0, skip: 0, total: 0 })
const validatedSpec   = ref('')

// ── Element picker state ───────────────────────────────────────────────────
const needsInput       = ref(null)   // { stepId, intent, type, canPick } when step needs help
const userHint         = ref('')
const submittingInput  = ref(false)  // true while HTTP POST in flight
const takeOverActive   = ref(false)  // user is interacting directly with the browser

let ws = null
const logRef      = ref(null)
const hintInputRef = ref(null)

// Auto-focus hint input when the banner appears
watch(needsInput, (val) => {
  if (val && !val.canPick) {
    nextTick(() => hintInputRef.value?.focus())
  }
})

// ── Computed ───────────────────────────────────────────────────────────────
const doneCount = computed(() =>
  Object.values(stepResults.value).filter(r => ['pass', 'fail', 'skip'].includes(r.status)).length
)
const canApply = computed(() => validatedSpec.value && summary.value.pass > 0)

// ── Helpers ────────────────────────────────────────────────────────────────
function stepState(id) {
  if (currentStepId.value === id && running.value) {
    const r = stepResults.value[id]
    if (!r) return 'running'
    if (r.status === 'retry') return 'retry'
  }
  return stepResults.value[id]?.status || 'pending'
}
function stepResult(id) { return stepResults.value[id] }

function addLog(type, label, detail = '') {
  actionLog.value.push({ type, label, detail })
  nextTick(() => { if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight })
}

function closeModal() {
  if (running.value) {
    abort()
  }
  emit('close')
}

// ── Keyboard close ─────────────────────────────────────────────────────────
function onKeydown(e) { if (e.key === 'Escape') closeModal() }

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  await loadSpec()
  loadingSpec.value = false
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  ws?.close()
})

async function loadSpec() {
  try {
    const { data } = await api.get(`/api/agent-tests/specs/${props.specId}`)
    spec.value = data
    if (data.intentJson) {
      try {
        const parsed = typeof data.intentJson === 'string' ? JSON.parse(data.intentJson) : data.intentJson
        intentSteps.value = parsed.steps || []
      } catch {}
    }
  } catch (err) {
    console.error('Failed to load spec:', err)
  }
}

// ── Validation session ─────────────────────────────────────────────────────
// Deliver user input via HTTP POST. Banner stays visible until step-result arrives.
async function sendInput(action, hint = '') {
  submittingInput.value = true
  userHint.value = ''
  try {
    await api.post(`/api/mcp/sessions/${sessionId.value}/input`, { action, hint })
  } catch (err) {
    // POST failed — reset so the user can try again
    submittingInput.value = false
    addLog('fail', 'Failed to send input — try again', err?.response?.data?.message || err?.message || '')
    return
  }
  // HTTP POST is the only delivery path — removed WS fallback because it caused
  // a duplicate pending input that made manualMode resolve instantly without user interaction.
  // Banner stays visible with "Processing…" until step-result clears it
}

function pickSkip()      { sendInput('skip') }
function pickAbort()     { needsInput.value = null; submittingInput.value = false; takeOverActive.value = false; abort() }
function pickHint()      { if (!userHint.value.trim()) return; sendInput('hint', userHint.value.trim()) }
function pickTakeOver()  { sendInput('take-over') }
function pickDone()      { sendInput('done', userHint.value.trim()); userHint.value = '' }

async function startValidation() {
  running.value   = true
  completed.value = false
  lastError.value = ''
  needsInput.value      = null
  userHint.value        = ''
  submittingInput.value = false
  stepResults.value = {}
  actionLog.value   = []
  latestScreenshot.value = null
  currentUrl.value  = ''
  validatedSpec.value = ''
  summary.value = { pass: 0, fail: 0, skip: 0, total: 0 }

  try {
    const { data } = await api.post(`/api/mcp/validate/${props.specId}`, { headed: headed.value })
    sessionId.value = data.sessionId
    if (data.totalSteps && !intentSteps.value.length) await loadSpec()
    connectWebSocket(data.sessionId)
  } catch (err) {
    lastError.value = err.response?.data?.message || err.message
    running.value = false
  }
}

function connectWebSocket(sid) {
  ws = new WebSocket(getMcpWebSocketUrl(sid))
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data)
    handleEvent(msg.type, msg.data)
  }
  ws.onerror = () => { lastError.value = 'WebSocket connection lost' }
  ws.onclose = () => {
    if (running.value) {
      lastError.value = lastError.value || 'Connection closed unexpectedly'
      running.value = false
    }
  }
}

function handleEvent(type, data) {
  switch (type) {
    case 'session-start':
      addLog('action', `Session started — ${data.totalSteps} steps`, data.headed ? 'headed browser' : 'headless')
      break
    case 'step-start':
      currentStepId.value = data.stepId
      if (!stepResults.value[data.stepId]) {
        stepResults.value = { ...stepResults.value, [data.stepId]: { status: 'running' } }
      }
      addLog('action', `Step ${data.stepId}: ${data.intent}`)
      break
    case 'screenshot':
      latestScreenshot.value = data.data
      if (data.url) currentUrl.value = data.url
      break
    case 'action':
      addLog('action', `${data.action} — ${Math.round((data.confidence || 0) * 100)}% confidence`, data.reasoning)
      break
    case 'retry':
      stepResults.value = { ...stepResults.value, [data.stepId]: { status: 'retry' } }
      addLog('retry', `Retry ${data.attempt}: ${data.error}`)
      break
    case 'step-result':
      needsInput.value = null
      submittingInput.value = false
      takeOverActive.value = false
      stepResults.value = { ...stepResults.value, [data.stepId]: data }
      if (data.status === 'pass') addLog('pass', `Step ${data.stepId} passed`, data.notes || '')
      if (data.status === 'fail') addLog('fail', `Step ${data.stepId} failed`, data.notes || '')
      if (data.status === 'skip') addLog('skip', `Step ${data.stepId} skipped`, data.notes || '')
      break
    case 'complete':
      running.value   = false
      completed.value = true
      summary.value   = data.summary
      validatedSpec.value = data.validatedSpec || ''
      currentStepId.value = null
      addLog(data.summary.fail === 0 ? 'pass' : 'action',
        `Done — ${data.summary.pass} passed, ${data.summary.fail} failed, ${data.summary.skip} skipped`)
      break
    case 'step-needs-input':
      takeOverActive.value = false
      needsInput.value = data
      stepResults.value = { ...stepResults.value, [data.stepId]: { status: 'needs-input' } }
      addLog('action', `Step ${data.stepId} needs help — click element in browser${data.canPick ? '' : ' or type a hint'}`)
      break
    case 'take-over-active':
      takeOverActive.value = true
      submittingInput.value = false
      addLog('action', `Step ${data.stepId}: manual mode — interact with the browser, then click Done`)
      break
    case 'pick-confirmed':
      needsInput.value = null
      submittingInput.value = false
      addLog('pass', `Step ${data.stepId}: element picked — ${data.element?.label || data.element?.placeholder || data.element?.tag || 'element'}`)
      break
    case 'pick-error':
      submittingInput.value = false
      addLog('fail', `Pick failed: ${data.error}`)
      break
    case 'error':
      needsInput.value = null
      submittingInput.value = false
      takeOverActive.value = false
      lastError.value = data.message
      running.value = false
      break
    case 'aborted':
      needsInput.value = null
      submittingInput.value = false
      takeOverActive.value = false
      running.value = false
      addLog('fail', 'Validation aborted')
      break
  }
}

async function abort() {
  try { await api.delete(`/api/mcp/sessions/${sessionId.value}`) } catch {}
  ws?.close()
  running.value = false
}

async function applySpec() {
  applying.value = true
  try {
    await api.post(`/api/mcp/sessions/${sessionId.value}/apply`)
    addLog('pass', 'Validated spec applied — spec is now ready to run')
    emit('spec-applied', { specId: props.specId })
  } catch (err) {
    addLog('fail', 'Failed to apply spec', err.response?.data?.message || err.message)
  }
  applying.value = false
}

async function copySpec() {
  await navigator.clipboard.writeText(validatedSpec.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function reset() {
  completed.value = false
  stepResults.value = {}
  actionLog.value = []
  latestScreenshot.value = null
  validatedSpec.value = ''
  summary.value = { pass: 0, fail: 0, skip: 0, total: 0 }
  ws?.close()
  ws = null
}
</script>

<style scoped>
/* ── Overlay ──────────────────────────────────────────────────── */
.mcp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: stretch;
}

.mcp-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-background);
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────── */
.mcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
}

.mcp-label { font-size: 0.65rem; color: var(--color-muted); letter-spacing: 0.06em; text-transform: uppercase; margin: 0; }
.mcp-title { font-size: 0.95rem; font-weight: 600; color: var(--color-heading); margin: 0; }

.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 7px;
  border: 1px solid var(--color-border);
  background: transparent; color: var(--color-muted);
  cursor: pointer; transition: all 150ms; flex-shrink: 0; margin-left: 4px;
}
.close-btn:hover { background: var(--color-danger); border-color: var(--color-danger); color: #fff; }

.btn-validate {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  background: var(--color-primary); color: #fff;
  border: none; font-size: 0.8rem; font-weight: 500;
  cursor: pointer; transition: opacity 150ms;
}
.btn-validate:hover { opacity: 0.88; }
.btn-validate:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-abort {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  background: var(--color-danger); color: #fff;
  border: none; font-size: 0.8rem; font-weight: 500;
  cursor: pointer;
}

.btn-apply {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px;
  background: var(--color-success); color: #fff;
  border: none; font-size: 0.8rem; font-weight: 500;
  cursor: pointer; transition: opacity 150ms;
}
.btn-apply:hover { opacity: 0.88; }
.btn-apply:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary-sm {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent; color: var(--color-muted);
  font-size: 0.75rem; cursor: pointer;
}
.btn-secondary-sm:hover { color: var(--color-heading); }

/* Headed toggle */
.headed-toggle {
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; font-size: 0.75rem; color: var(--color-muted);
  user-select: none;
}
.toggle-track {
  position: relative; width: 30px; height: 17px;
  border-radius: 9px; background: var(--color-border);
  transition: background 150ms; flex-shrink: 0;
}
.toggle-track.active { background: var(--color-primary); }
.toggle-knob {
  position: absolute; top: 2px; left: 2px;
  width: 13px; height: 13px; border-radius: 50%;
  background: #fff; transition: transform 150ms;
}
.toggle-track.active .toggle-knob { transform: translateX(13px); }

/* ── Empty / Idle ─────────────────────────────────────────────── */
.mcp-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; color: var(--color-muted); text-align: center; padding: 40px;
}

.mcp-idle {
  flex: 1; display: flex; align-items: center;
  justify-content: center; padding: 40px 20px; overflow-y: auto;
}

.idle-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px; padding: 32px;
  max-width: 520px; width: 100%; text-align: center;
}
.idle-card h2 { font-size: 1.1rem; font-weight: 600; color: var(--color-heading); margin: 0 0 8px; }
.idle-card p  { font-size: 0.85rem; color: var(--color-muted); margin: 0 0 20px; }

.idle-stats { display: flex; justify-content: center; gap: 24px; margin-bottom: 24px; }
.stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat-n { font-size: 1.2rem; font-weight: 700; color: var(--color-heading); }
.stat-l { font-size: 0.7rem; color: var(--color-muted); }

.idle-steps {
  text-align: left; border-top: 1px solid var(--color-border);
  padding-top: 16px; display: flex; flex-direction: column; gap: 6px;
  max-height: 280px; overflow-y: auto;
}
.idle-step { display: flex; align-items: center; gap: 8px; }
.idle-step-intent { font-size: 0.8rem; color: var(--color-muted); }

/* ── Main split ───────────────────────────────────────────────── */
.mcp-main { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* ── Step panel ─────────────────────────────────────────────── */
.step-panel {
  width: 38%; border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
}
.step-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--color-border);
  background: var(--color-surface); flex-shrink: 0;
}
.panel-label { font-size: 0.72rem; font-weight: 600; color: var(--color-heading); }
.panel-count  { font-size: 0.7rem; color: var(--color-muted); }

.progress-bar { height: 2px; background: var(--color-border); flex-shrink: 0; }
.progress-fill { height: 100%; background: var(--color-primary); transition: width 400ms ease; }

.step-list { flex: 1; overflow-y: auto; padding: 6px; }

.step-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px; border-radius: 8px; margin-bottom: 3px;
  border: 1px solid transparent; transition: all 150ms;
}
.step-row.running      { background: rgba(0,207,232,0.06); border-color: rgba(0,207,232,0.2); }
.step-row.pass         { background: rgba(40,199,111,0.05); border-color: rgba(40,199,111,0.15); }
.step-row.fail         { background: rgba(234,84,85,0.05);  border-color: rgba(234,84,85,0.15); }
.step-row.retry        { background: rgba(255,159,67,0.05); border-color: rgba(255,159,67,0.2); }
.step-row.skip         { opacity: 0.55; }
.step-row.needs-input  { background: rgba(255,159,67,0.08); border-color: rgba(255,159,67,0.4); }

.step-status { flex-shrink: 0; padding-top: 2px; }
.step-dot { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--color-border); margin: 3px; }
.step-content { flex: 1; min-width: 0; }
.step-num        { font-size: 0.65rem; color: var(--color-muted); }
.step-intent     { font-size: 0.75rem; color: var(--color-body); margin: 0; line-height: 1.4; }
.step-note       { font-size: 0.7rem; color: var(--color-danger); margin: 3px 0 0; line-height: 1.3; }
.step-confidence { font-size: 0.65rem; color: var(--color-muted); margin: 2px 0 0; }

/* ── Type badges ────────────────────────────────────────────── */
.step-type-badge {
  display: inline-block; font-size: 0.6rem; font-weight: 600;
  padding: 1px 5px; border-radius: 4px; letter-spacing: 0.04em;
  text-transform: uppercase; vertical-align: middle;
}
.type-navigate   { background: rgba(115,103,240,0.15); color: #7367F0; }
.type-fill       { background: rgba(0,207,232,0.12);   color: #00CFE8; }
.type-click      { background: rgba(40,199,111,0.12);  color: #28C76F; }
.type-select     { background: rgba(0,207,232,0.12);   color: #00CFE8; }
.type-clear-auth { background: rgba(255,159,67,0.12);  color: #FF9F43; }
.type-wait-url   { background: rgba(115,103,240,0.12); color: #7367F0; }
.type-assert     { background: rgba(40,199,111,0.12);  color: #28C76F; }
.type-assert-url { background: rgba(40,199,111,0.12);  color: #28C76F; }
.type-skip       { background: rgba(255,255,255,0.06); color: var(--color-muted); }
.type-custom     { background: rgba(255,255,255,0.06); color: var(--color-muted); }

/* ── Browser panel ──────────────────────────────────────────── */
.browser-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* ── Element picker banner ───────────────────────────────────── */
.picker-banner {
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(255,159,67,0.3);
  background: rgba(255,159,67,0.07);
  flex-shrink: 0;
}
.picker-banner-top {
  display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;
}
.picker-banner-text { display: flex; flex-direction: column; gap: 1px; }
.picker-banner-text strong { font-size: 0.78rem; color: var(--color-warning); }
.picker-banner-text span  { font-size: 0.73rem; color: var(--color-muted); }
.picker-instruction {
  font-size: 0.72rem; color: var(--color-info);
  margin: 0 0 8px 23px; line-height: 1.4;
}
.picker-hint-row {
  display: flex; align-items: center; gap: 6px;
  margin: 0 0 8px 0;
}
.picker-hint-input {
  flex: 1; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 5px; padding: 5px 9px; font-size: 0.73rem;
  color: var(--color-heading); outline: none;
}
.picker-hint-input:focus { border-color: var(--color-primary); }
.picker-hint-btn {
  background: var(--color-primary); color: #fff; border: none;
  border-radius: 5px; padding: 5px 10px; font-size: 0.72rem; font-weight: 600; cursor: pointer;
  white-space: nowrap;
}
.picker-actions { display: flex; gap: 6px; }
.picker-skip-btn, .picker-abort-btn {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--color-border); border-radius: 5px;
  padding: 4px 10px; font-size: 0.71rem; cursor: pointer; background: transparent;
}
.picker-skip-btn     { color: var(--color-muted); }
.picker-skip-btn:hover     { background: rgba(255,255,255,0.05); }
.picker-takeover-btn { color: var(--color-info); border-color: rgba(0,207,232,0.3); }
.picker-takeover-btn:hover { background: rgba(0,207,232,0.08); }
.picker-abort-btn    { color: var(--color-danger); border-color: rgba(234,84,85,0.3); }
.picker-abort-btn:hover    { background: rgba(234,84,85,0.08); }
.picker-banner--takeover {
  border-bottom-color: rgba(0,207,232,0.3);
  background: rgba(0,207,232,0.05);
}

.pick-slide-enter-active, .pick-slide-leave-active { transition: all 0.2s ease; }
.pick-slide-enter-from, .pick-slide-leave-to { opacity: 0; transform: translateY(-8px); }

.screenshot-area {
  flex: 1; position: relative; overflow: hidden;
  background: #0a0a0a; min-height: 0;
}
.screenshot-placeholder {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.screenshot-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.url-bar {
  position: absolute; bottom: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
}

.action-log { height: 160px; overflow-y: auto; border-top: 1px solid var(--color-border); background: var(--color-surface); flex-shrink: 0; }
.log-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-bottom: 1px solid var(--color-border);
  position: sticky; top: 0; background: var(--color-surface);
}
.log-entry {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 4px 12px; font-size: 0.72rem; line-height: 1.4;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.log-icon  { flex-shrink: 0; padding-top: 1px; }
.log-body  { display: flex; flex-direction: column; gap: 1px; }
.log-label { color: var(--color-body); }
.log-detail { color: var(--color-muted); font-size: 0.68rem; }

/* ── Validated spec ─────────────────────────────────────────── */
.validated-spec { border-top: 1px solid var(--color-border); flex-shrink: 0; max-height: 220px; display: flex; flex-direction: column; }
.validated-spec-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-bottom: 1px solid var(--color-border); background: var(--color-surface); flex-shrink: 0;
}
.copy-btn {
  display: flex; align-items: center; gap: 4px; margin-left: auto;
  font-size: 0.7rem; color: var(--color-muted);
  background: none; border: none; cursor: pointer; padding: 2px 6px; border-radius: 4px;
}
.copy-btn:hover { color: var(--color-heading); }
.spec-code {
  font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;
  color: var(--color-body); padding: 10px 14px; margin: 0;
  overflow-y: auto; flex: 1; white-space: pre;
}
</style>
