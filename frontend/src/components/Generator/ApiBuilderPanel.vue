<template>
  <div class="api-panel">
    <!-- Base URL + Discover -->
    <div class="api-discover-row">
      <div class="gen-field gen-field--url">
        <label class="form-label">Base URL / API Domain</label>
        <input v-model="baseUrl" type="text" class="form-input" placeholder="https://api.your-app.com" />
      </div>
      <div class="api-discover-btn">
        <button class="btn btn-sm btn-secondary" :disabled="!baseUrl || discovering" @click="discover">
          <Search :size="13" :class="{ 'animate-spin': discovering }" />
          {{ discovering ? 'Scanning...' : 'Discover' }}
        </button>
      </div>
    </div>

    <!-- Discovered endpoints -->
    <div v-if="endpoints.length" class="api-endpoints">
      <label class="form-label">Discovered Endpoints</label>
      <select class="form-select" v-model="selectedEndpoint" @change="applyEndpoint">
        <option value="">Select an endpoint…</option>
        <option v-for="ep in endpoints" :key="ep.fullUrl + ep.method" :value="JSON.stringify(ep)">
          {{ ep.method }} {{ ep.path }}{{ ep.summary ? ` — ${ep.summary}` : '' }}
        </option>
      </select>
    </div>

    <!-- Request builder -->
    <div class="api-request">
      <div class="api-request-line">
        <select v-model="method" class="form-select api-method-select">
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
        </select>
        <input v-model="requestUrl" type="text" class="form-input flex-1" placeholder="https://api.your-app.com/users" />
        <button class="btn btn-sm btn-primary" :disabled="!requestUrl || testing" @click="runTest">
          <Zap :size="13" :class="{ 'animate-spin': testing }" />
          {{ testing ? 'Testing...' : 'Test' }}
        </button>
      </div>

      <!-- Headers -->
      <div>
        <div class="api-field-label-row">
          <span class="form-label mb-0">Headers</span>
          <button class="btn btn-xs btn-secondary" @click="addHeader">+ Add</button>
        </div>
        <div class="space-y-1">
          <div v-for="(h, i) in headers" :key="i" class="api-kv-row">
            <input v-model="h.key" type="text" class="form-input form-input--sm" placeholder="Header name" />
            <input v-model="h.value" type="text" class="form-input form-input--sm flex-1" placeholder="Value" />
            <button class="icon-btn text-muted hover:text-danger" @click="headers.splice(i, 1)"><X :size="13" /></button>
          </div>
        </div>
      </div>

      <!-- Request body (for POST/PUT/PATCH) -->
      <div v-if="['POST', 'PUT', 'PATCH'].includes(method)">
        <label class="form-label">Request Body (JSON)</label>
        <textarea v-model="requestBody" class="api-body-editor" rows="4" placeholder='{"key": "value"}' spellcheck="false" />
      </div>

      <!-- Expected status -->
      <div class="api-expected">
        <label class="form-label mb-0">Expected Status</label>
        <input v-model.number="expectedStatus" type="number" class="form-input api-status-input" placeholder="200" />
        <label class="form-label mb-0">Test Name</label>
        <input v-model="testName" type="text" class="form-input flex-1" placeholder="GET users returns 200" />
      </div>
    </div>

    <!-- Response panel -->
    <div v-if="lastResponse" class="api-response">
      <div class="api-response-header">
        <span class="text-xs font-medium">Response</span>
        <span
          class="badge text-xs"
          :style="responseOk ? 'background:color-mix(in srgb,#28C76F 15%,transparent);color:#28C76F' : 'background:color-mix(in srgb,#EA5455 15%,transparent);color:#EA5455'"
        >
          {{ lastResponse.status }} {{ lastResponse.statusText }}
        </span>
        <span class="text-xs text-muted ml-auto">{{ lastResponse.duration }}ms</span>
      </div>
      <pre class="api-response-body">{{ lastResponse.body }}</pre>
    </div>

    <!-- Save -->
    <div class="api-save-row">
      <button
        class="btn btn-sm btn-primary"
        :disabled="!requestUrl || saving"
        @click="saveApiSpec"
      >
        <Save :size="13" />
        {{ saving ? 'Saving...' : 'Save as API Spec' }}
      </button>
    </div>

    <!-- Save modal -->
    <div v-if="showSaveModal" class="modal-backdrop" @click.self="showSaveModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold text-heading">Save API Test</h3>
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
import { ref, computed } from 'vue'
import { Search, Zap, Save, X } from 'lucide-vue-next'
import api from '@/lib/api'

const props = defineProps({
  selectedPackId: { type: String, default: null }
})

const emit = defineEmits(['log', 'spec-saved'])

const baseUrl        = ref('')
const discovering    = ref(false)
const endpoints      = ref([])
const selectedEndpoint = ref('')

const method         = ref('GET')
const requestUrl     = ref('')
const headers        = ref([{ key: 'Content-Type', value: 'application/json' }])
const requestBody    = ref('')
const expectedStatus = ref(200)
const testName       = ref('')
const testing        = ref(false)
const lastResponse   = ref(null)

const saving         = ref(false)
const saveError      = ref('')
const showSaveModal  = ref(false)
const saveForm       = ref({ name: '', packId: '' })
const packs          = ref([])

const responseOk = computed(() =>
  lastResponse.value && lastResponse.value.status === (expectedStatus.value || 200)
)

function log(type, content) {
  emit('log', { type, content, timestamp: Date.now() })
}

async function discover() {
  discovering.value = true
  log('step', `Scanning ${baseUrl.value} for API endpoints…`)
  try {
    const { data } = await api.post('/api/agent-tests/discover/quick', { url: baseUrl.value })
    endpoints.value = data.endpoints || []
    log('done', `Found ${endpoints.value.length} endpoint(s)`)
  } catch (e) {
    log('error', e?.response?.data?.error || 'Discovery failed')
  } finally { discovering.value = false }
}

function applyEndpoint() {
  if (!selectedEndpoint.value) return
  try {
    const ep = JSON.parse(selectedEndpoint.value)
    requestUrl.value = ep.fullUrl || `${baseUrl.value}${ep.path}`
    method.value = ep.method || 'GET'
    if (!testName.value) testName.value = `${ep.method} ${ep.path}`
    if (ep.status) expectedStatus.value = ep.status
  } catch { /* ignore */ }
}

function addHeader() {
  headers.value.push({ key: '', value: '' })
}

async function runTest() {
  testing.value = true
  lastResponse.value = null
  const headersObj = Object.fromEntries(headers.value.filter(h => h.key).map(h => [h.key, h.value]))
  log('step', `${method.value} ${requestUrl.value}`)
  const start = Date.now()
  try {
    // Use backend proxy to avoid CORS
    const { data } = await api.post('/api/agent-tests/proxy-request', {
      method: method.value,
      url: requestUrl.value,
      headers: headersObj,
      body: requestBody.value ? JSON.parse(requestBody.value) : undefined,
      expectedStatus: expectedStatus.value
    }, { timeout: 30000 })
    lastResponse.value = {
      status: data.status,
      statusText: data.statusText || '',
      body: typeof data.body === 'object' ? JSON.stringify(data.body, null, 2) : String(data.body || ''),
      duration: Date.now() - start
    }
    const ok = data.status === expectedStatus.value
    log(ok ? 'done' : 'warn', `${data.status} ${data.statusText} (${Date.now() - start}ms)${ok ? '' : ` — expected ${expectedStatus.value}`}`)
  } catch (e) {
    log('error', e?.response?.data?.error || e.message || 'Request failed')
    lastResponse.value = { status: 'error', statusText: e.message, body: '', duration: Date.now() - start }
  } finally { testing.value = false }
}

async function saveApiSpec() {
  saveForm.value.name = testName.value || `${method.value} ${requestUrl.value}`
  saveForm.value.packId = props.selectedPackId || ''
  saveError.value = ''
  try {
    const { data } = await api.get('/api/agent-tests/packs')
    packs.value = data.packs || data || []
  } catch { packs.value = [] }
  showSaveModal.value = true
}

async function confirmSave() {
  saving.value = true
  saveError.value = ''
  const headersObj = Object.fromEntries(headers.value.filter(h => h.key).map(h => [h.key, h.value]))
  try {
    const { data } = await api.post('/api/agent-tests/specs', {
      name: saveForm.value.name,
      testType: 'api',
      url: requestUrl.value,
      method: method.value,
      headers: JSON.stringify(headersObj),
      requestBody: requestBody.value,
      expectedStatus: expectedStatus.value,
      status: 'ready'
    })
    const specId = data.specId || data.id
    if (saveForm.value.packId && specId) {
      await api.post(`/api/agent-tests/packs/${saveForm.value.packId}/tests`, { testIds: [specId] })
    }
    showSaveModal.value = false
    log('done', `Saved API spec "${saveForm.value.name}"`)
    emit('spec-saved', { specId, packId: saveForm.value.packId })
  } catch (e) {
    saveError.value = e?.response?.data?.error || 'Save failed'
  } finally { saving.value = false }
}
</script>

<style scoped>
.api-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  height: 100%;
  overflow-y: auto;
}

.api-discover-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.gen-field { display: flex; flex-direction: column; gap: 4px; }
.gen-field--url { flex: 1; }
.api-discover-btn { flex-shrink: 0; padding-bottom: 1px; }

.api-request { display: flex; flex-direction: column; gap: 10px; }
.api-request-line { display: flex; gap: 6px; align-items: center; }

.api-method-select { width: 90px; flex-shrink: 0; }

.api-field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.api-kv-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.form-input--sm { font-size: 12px; padding: 5px 8px; }
.icon-btn { background: none; border: none; cursor: pointer; display: flex; padding: 3px; border-radius: 3px; transition: color 0.15s; }

.api-body-editor {
  width: 100%;
  resize: vertical;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-body);
}

.api-expected {
  display: flex;
  align-items: center;
  gap: 8px;
}
.api-status-input { width: 80px; flex-shrink: 0; }

.api-response {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}
.api-response-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.api-response-body {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 11px;
  padding: 10px 12px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-body);
  margin: 0;
}

.api-endpoints { display: flex; flex-direction: column; gap: 4px; }
.api-save-row { display: flex; }

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
