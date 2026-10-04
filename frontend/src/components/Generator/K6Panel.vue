<template>
  <div class="k6-panel" data-testid="k6-panel">
    <div class="k6-header">
      <div>
        <div class="k6-title">k6 load test</div>
        <div class="k6-sub">Built from the HTTP traffic in this recording. Run it once here, then push it to Continuum to run under load.</div>
      </div>
      <button class="btn btn-sm btn-secondary" :disabled="converting" @click="convertTraffic">
        <RefreshCw :size="13" :class="{ 'animate-spin': converting }" /> Rebuild
      </button>
    </div>

    <p v-if="error" class="k6-error" role="alert">{{ error }}<span v-if="errorDetail"><br><code>{{ errorDetail }}</code></span></p>

    <template v-if="result">
      <!-- Summary -->
      <div class="k6-summary">
        <span><strong>{{ result.summary.kept }}</strong> of {{ result.summary.captured }} requests kept</span>
        <span v-if="result.summary.correlations.length">· {{ result.summary.correlations.length }} value{{ result.summary.correlations.length === 1 ? '' : 's' }} read from earlier responses</span>
        <span v-if="result.summary.secrets.length">· {{ result.summary.secrets.length }} secret{{ result.summary.secrets.length === 1 ? '' : 's' }} as variables</span>
      </div>

      <!-- Requests -->
      <details class="k6-section" :open="!edited">
        <summary>Captured requests</summary>
        <table class="k6-table">
          <tbody>
            <tr v-for="r in result.requests" :key="r.seq" :class="{ 'k6-skipped': !r.kept }">
              <td class="k6-check">
                <input v-if="r.kept || r.reason === 'excluded by you'" type="checkbox" :checked="r.kept"
                  :aria-label="`Include ${r.method} ${r.url}`" @change="toggle(r)" />
              </td>
              <td class="k6-method">{{ r.method }}</td>
              <td class="k6-url" :title="r.url">{{ shortUrl(r.url) }}</td>
              <td class="k6-status">{{ r.status || '' }}</td>
              <td class="k6-reason">
                <template v-if="!r.kept">
                  {{ r.reason }}
                  <button v-if="r.reason === 'third-party host'" class="k6-link" @click="includeHost(r.url)">include this host</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="result.summary.correlations.length" class="k6-note">
          Read from responses:
          <span v-for="c in result.summary.correlations" :key="c.variable"><code>{{ c.variable }}</code> ← {{ c.from }} <code>{{ c.path }}</code>; </span>
        </p>
      </details>

      <!-- Variables -->
      <div class="k6-section">
        <div class="k6-section-title">Variables</div>
        <div v-for="v in envVars" :key="v.key" class="k6-var">
          <code class="k6-var-key">{{ v.key }}</code>
          <input v-model="v.value" :type="v.sensitive ? 'password' : 'text'" class="form-input"
            :placeholder="v.sensitive ? 'Secret — only used for the smoke run here' : ''" autocomplete="off" />
        </div>
        <p class="k6-note">Secret values stay on this machine. Continuum gets the variable names only; set the values there.</p>
      </div>

      <!-- Script -->
      <div class="k6-section">
        <div class="k6-section-title">
          Script
          <span class="k6-actions">
            <button class="btn btn-sm btn-secondary" :disabled="improving" data-testid="k6-improve" @click="improve">
              <Sparkles :size="13" /> {{ improving ? 'Improving…' : 'Improve with AI' }}
            </button>
            <button class="btn btn-sm btn-secondary" @click="download"><Download :size="13" /> .js</button>
          </span>
        </div>
        <textarea v-model="script" class="k6-script" spellcheck="false" data-testid="k6-script" @input="edited = true" />
        <p v-if="aiWarning" class="k6-note">{{ aiWarning }}</p>
      </div>

      <!-- Smoke run -->
      <div class="k6-section">
        <div class="k6-section-title">Smoke run <span class="k6-muted">one virtual user, one iteration, on this machine</span></div>
        <div v-if="!k6.installed" class="k6-row">
          <button class="btn btn-sm btn-primary" :disabled="installing" data-testid="k6-install" @click="installK6">
            <Download :size="13" /> {{ installing ? `Installing k6… ${installPct ?? ''}${installPct != null ? '%' : ''}` : `Install k6 ${k6.version || ''}` }}
          </button>
          <span class="k6-muted">About 30 MB, downloaded once into Aurora's data folder and checked against the published checksum.</span>
        </div>
        <button v-else class="btn btn-sm btn-primary" :disabled="smoking" data-testid="k6-smoke" @click="smoke">
          <Play :size="13" /> {{ smoking ? 'Running…' : 'Run once' }}
        </button>
        <div v-if="smokeResult" class="k6-result" :class="smokeResult.ok ? 'k6-ok' : 'k6-bad'" data-testid="k6-smoke-result">
          <strong>{{ smokeResult.ok ? 'Passed' : 'Failed' }}</strong>
          <span v-if="smokeResult.requests !== undefined"> · {{ smokeResult.requests }} requests · checks {{ smokeResult.checks?.passes || 0 }} passed, {{ smokeResult.checks?.fails || 0 }} failed</span>
          <span v-if="smokeResult.error"> · {{ smokeResult.error }}</span>
          <ul v-if="smokeResult.failedChecks?.length">
            <li v-for="c in smokeResult.failedChecks" :key="c.name + c.group">{{ c.group ? `${c.group} › ` : '' }}{{ c.name }}</li>
          </ul>
          <details v-if="smokeResult.console"><summary>k6 output</summary><pre>{{ smokeResult.console }}</pre></details>
        </div>
      </div>

      <!-- Save / push -->
      <div class="k6-section">
        <div class="k6-section-title">Save the script</div>
        <div class="k6-row">
          <input v-model="name" class="form-input" placeholder="Script name" style="max-width: 260px" />
          <input v-model="description" class="form-input" placeholder="Description (optional)" />
          <button class="btn btn-sm btn-primary" :disabled="saving || !name.trim()" data-testid="k6-save-library" @click="saveToLibrary">
            <Save :size="13" /> {{ saving ? 'Saving…' : 'Save to Performance' }}
          </button>
          <button class="btn btn-sm btn-secondary" :disabled="pushing || !name.trim()" data-testid="k6-push" title="Send the script straight to Continuum without building a scenario here" @click="push">
            <Upload :size="13" /> {{ pushing ? 'Pushing…' : 'Push to Continuum' }}
          </button>
        </div>
        <p v-if="savedScript" class="k6-note k6-ok-text" role="status">
          Saved to Performance → Scripts as "{{ savedScript.name }}". Build a scenario around it there to run it with up to 20 users.
        </p>
        <p v-if="pushResult" class="k6-note k6-ok-text" role="status">
          {{ pushResult.created ? 'Created' : 'Updated' }} in Continuum.
          <a :href="pushResult.url" target="_blank" rel="noopener">Open the scenario</a>, set its secret values, and run it with a workload model.
        </p>
        <p v-if="smokeResult && !smokeResult.ok && !pushResult" class="k6-note">The last smoke run failed; you can still push, but fix it first if you can.</p>
      </div>
    </template>
    <p v-else-if="converting" class="k6-muted">Building the script…</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RefreshCw, Sparkles, Download, Play, Upload, Save } from 'lucide-vue-next'
import api, { getApiBaseUrl } from '@/lib/api'

const props = defineProps({
  sessionId: { type: String, required: true },
  defaultName: { type: String, default: 'Recorded journey' }
})
const emit = defineEmits(['log'])

const result = ref(null)
const script = ref('')
const envVars = ref([])
const edited = ref(false)
const exclude = ref([])
const includeHosts = ref(null)
const name = ref(props.defaultName)
const description = ref('')
const converting = ref(false)
const improving = ref(false)
const smoking = ref(false)
const pushing = ref(false)
const saving = ref(false)
const savedScript = ref(null)
const installing = ref(false)
const installPct = ref(null)
const k6 = ref({ installed: false })
const smokeResult = ref(null)
const pushResult = ref(null)
const aiWarning = ref('')
const error = ref('')
const errorDetail = ref('')

const log = (type, content) => emit('log', { type, content, timestamp: Date.now() })
function fail (e, fallback) {
  error.value = e?.response?.data?.message || fallback
  errorDetail.value = e?.response?.data?.detail || ''
}

function shortUrl (u) {
  try { const x = new URL(u); return x.host + x.pathname + (x.search.length > 30 ? x.search.slice(0, 30) + '…' : x.search) } catch { return u }
}

async function convertTraffic () {
  if (edited.value && !confirm('Rebuilding replaces your edits to the script. Continue?')) return
  converting.value = true
  error.value = ''
  try {
    const { data } = await api.post('/api/k6/convert', { sessionId: props.sessionId, name: name.value, exclude: exclude.value, includeHosts: includeHosts.value })
    // Keep values the user already typed (e.g. secrets) when rebuilding.
    const typed = new Map(envVars.value.map(v => [v.key, v.value]))
    result.value = data
    script.value = data.script
    envVars.value = data.envVars.map(v => ({ ...v, value: typed.has(v.key) ? typed.get(v.key) : v.value }))
    edited.value = false
    smokeResult.value = null
  } catch (e) {
    fail(e, 'Could not build the k6 script')
  } finally {
    converting.value = false
  }
}

function toggle (r) {
  exclude.value = r.kept ? [...exclude.value, r.seq] : exclude.value.filter(s => s !== r.seq)
  edited.value = false
  convertTraffic()
}

function includeHost (url) {
  const origin = new URL(url).origin
  const current = includeHosts.value || [...new Set(result.value.requests.filter(r => r.kept).map(r => new URL(r.url).origin))]
  includeHosts.value = [...new Set([...current, origin])]
  edited.value = false
  convertTraffic()
}

async function improve () {
  improving.value = true
  error.value = ''
  aiWarning.value = ''
  try {
    const { data } = await api.post('/api/k6/improve', { script: script.value, summary: result.value?.summary })
    script.value = data.script
    edited.value = true
    aiWarning.value = data.warning || ''
    log('done', 'k6 script improved with AI')
  } catch (e) {
    fail(e, 'The AI could not improve the script')
  } finally {
    improving.value = false
  }
}

async function loadStatus () {
  try { k6.value = (await api.get('/api/k6/status')).data } catch { /* leave as not installed */ }
}

async function installK6 () {
  installing.value = true
  installPct.value = null
  error.value = ''
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/k6/install`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop()
      for (const chunk of events) {
        const line = chunk.replace(/^data: /, '')
        if (!line.trim()) continue
        const ev = JSON.parse(line)
        if (ev.type === 'progress') installPct.value = ev.pct
        else if (ev.type === 'error') error.value = ev.message
      }
    }
  } catch (e) {
    error.value = e.message || 'Download failed'
  } finally {
    installing.value = false
    await loadStatus()
  }
}

async function smoke () {
  smoking.value = true
  error.value = ''
  smokeResult.value = null
  try {
    const { data } = await api.post('/api/k6/smoke', { script: script.value, envVars: envVars.value })
    smokeResult.value = data
    log(data.ok ? 'done' : 'warn', `k6 smoke run ${data.ok ? 'passed' : 'failed'}: ${data.requests} requests`)
  } catch (e) {
    if (e?.response?.data?.notInstalled) await loadStatus()
    fail(e, 'The smoke run failed to start')
  } finally {
    smoking.value = false
  }
}

async function push () {
  pushing.value = true
  error.value = ''
  pushResult.value = null
  try {
    const { data } = await api.post('/api/k6/push', { name: name.value.trim(), description: description.value, script: script.value, envVars: envVars.value })
    pushResult.value = data
    log('done', `Pushed "${name.value.trim()}" to Continuum`)
  } catch (e) {
    fail(e, 'Could not push to Continuum')
  } finally {
    pushing.value = false
  }
}

// Save to the Performance library (scripts are edited, smoke-run and built into
// scenarios there). Secret values are encrypted at rest on this machine.
async function saveToLibrary () {
  saving.value = true
  error.value = ''
  savedScript.value = null
  try {
    const { data } = await api.post('/api/performance/scripts', {
      name: name.value.trim(),
      description: description.value || 'Built from a recorded session',
      scriptType: 'http',
      script: script.value,
      envVars: envVars.value,
      source: 'recording'
    })
    savedScript.value = data.script
    log('done', `Saved "${data.script.name}" to Performance scripts`)
  } catch (e) {
    fail(e, 'Could not save the script')
  } finally {
    saving.value = false
  }
}

function download () {
  const blob = new Blob([script.value], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(name.value || 'load-test').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.js`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

onMounted(() => { loadStatus(); convertTraffic() })
</script>

<style scoped>
.k6-panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 12px; background: var(--color-surface); }
.k6-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.k6-title { font-weight: 600; color: var(--color-heading, var(--color-body)); }
.k6-sub, .k6-muted, .k6-note { font-size: 12px; color: var(--color-muted); }
.k6-summary { font-size: 12px; color: var(--color-body); display: flex; flex-wrap: wrap; gap: 4px; }
.k6-section { display: flex; flex-direction: column; gap: 6px; }
.k6-section > summary, .k6-section-title { font-size: 12px; font-weight: 600; color: var(--color-body); cursor: default; display: flex; align-items: center; gap: 8px; }
.k6-section > summary { cursor: pointer; }
.k6-actions { margin-left: auto; display: flex; gap: 6px; }
.k6-table { width: 100%; font-size: 11px; border-collapse: collapse; }
.k6-table td { padding: 2px 4px; border-top: 1px solid var(--color-border); vertical-align: middle; }
.k6-check { width: 20px; }
.k6-method { font-family: monospace; width: 52px; }
.k6-url { font-family: monospace; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k6-status { width: 36px; color: var(--color-muted); }
.k6-reason { color: var(--color-muted); white-space: nowrap; }
.k6-skipped { opacity: 0.55; }
.k6-link { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 11px; padding: 0 0 0 6px; text-decoration: underline; }
.k6-var { display: flex; align-items: center; gap: 8px; }
.k6-var-key { min-width: 140px; font-size: 12px; }
.k6-script { width: 100%; min-height: 280px; font-family: monospace; font-size: 11px; padding: 8px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-surface-2, var(--color-surface)); color: var(--color-body); }
.k6-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.k6-result { font-size: 12px; border-radius: 6px; padding: 8px; }
.k6-result pre { font-size: 11px; white-space: pre-wrap; max-height: 240px; overflow: auto; }
.k6-ok { background: color-mix(in srgb, #28C76F 12%, transparent); }
.k6-bad { background: color-mix(in srgb, #EA5455 12%, transparent); }
.k6-ok-text { color: #28C76F; }
.k6-error { font-size: 12px; color: #EA5455; }
</style>
