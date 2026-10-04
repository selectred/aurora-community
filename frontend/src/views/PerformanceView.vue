<template>
  <div class="space-y-6" data-testid="page-performance">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-page-title">Performance</h1>
        <p class="text-body text-body-color">Author k6 scripts, build scenarios with up to {{ maxVus }} users, run them here until they're stable, then push them to Continuum.</p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-secondary" data-testid="perf-new-script" @click="newScriptOpen = !newScriptOpen">
          <FileCode2 :size="16" /> New script <ChevronDown :size="14" />
        </button>
        <RouterLink to="/performance/scenarios/new" class="btn btn-primary" data-testid="perf-new-scenario">
          <Plus :size="16" /> New scenario
        </RouterLink>
      </div>
    </div>

    <!-- New script options -->
    <div v-if="newScriptOpen" class="card" data-testid="perf-new-script-menu">
      <div class="card-body grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <button class="perf-option" @click="fromTemplate('http')">
          <Globe :size="18" class="text-primary" />
          <span class="font-semibold text-heading">Blank HTTP script</span>
          <span class="text-xs text-muted">Protocol-level requests. Light enough to run many users.</span>
        </button>
        <button class="perf-option" @click="fromTemplate('browser')">
          <MonitorPlay :size="18" class="text-primary" />
          <span class="font-semibold text-heading">Blank browser script</span>
          <span class="text-xs text-muted">Real headless Chromium per user, with web vitals. Heavy: keep users low.</span>
        </button>
        <button class="perf-option" data-testid="perf-import-har" @click="harOpen = true">
          <Upload :size="18" class="text-primary" />
          <span class="font-semibold text-heading">Import a HAR file</span>
          <span class="text-xs text-muted">Export from browser dev tools (Network → Save all as HAR). Aurora strips noise, correlates tokens and moves secrets to variables.</span>
        </button>
        <button class="perf-option" @click="fromRecording">
          <Video :size="18" class="text-primary" />
          <span class="font-semibold text-heading">From a recording</span>
          <span class="text-xs text-muted">Record the journey in the Test Generator, then choose "Create k6 load test" and save it to the library.</span>
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-default" role="tablist">
      <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="tab === t.id" class="perf-tab" :class="{ active: tab === t.id }" :data-testid="`perf-tab-${t.id}`" @click="setTab(t.id)">
        {{ t.label }} <span class="text-muted">({{ t.count }})</span>
      </button>
    </div>

    <!-- Scenarios -->
    <div v-if="tab === 'scenarios'" class="card">
      <div class="card-body overflow-x-auto">
        <table class="table" data-testid="perf-scenarios-table">
          <thead><tr><th>Scenario</th><th>Script</th><th>Load</th><th>Last run</th><th>p95</th><th>Errors</th><th>Continuum</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in scenarios" :key="s.id" class="cursor-pointer" @click="$router.push(`/performance/scenarios/${s.id}`)">
              <td class="font-medium text-heading">{{ s.name }}</td>
              <td class="text-muted">{{ s.script?.name }}<span v-if="s.script?.scriptType === 'browser'" class="badge badge-info ml-1">browser</span></td>
              <td class="text-muted">{{ loadSummary(s.load) }} · {{ seconds(s.durationSec) }}</td>
              <td>
                <PerfStatusBadge v-if="s.lastRun" :status="s.lastRun.status" :regressed="!!s.lastRun.comparison?.regressed" />
                <span v-else class="text-muted">Not run yet</span>
                <div v-if="s.lastRun" class="text-xs text-muted">{{ when(s.lastRun.finishedAt || s.lastRun.queuedAt) }}</div>
              </td>
              <td>{{ ms(s.lastRun?.metrics?.p95Duration) }}</td>
              <td>{{ pct(s.lastRun?.metrics?.failRate) }}</td>
              <td class="text-xs text-muted">{{ s.pushedAt ? `Pushed ${when(s.pushedAt)}` : '—' }}</td>
              <td class="text-right" @click.stop>
                <button class="btn btn-sm btn-success" :disabled="starting === s.id || !k6Installed" :data-testid="`perf-run-${s.id}`" @click="run(s)">
                  <Play :size="14" /> {{ starting === s.id ? 'Queuing…' : 'Run' }}
                </button>
              </td>
            </tr>
            <tr v-if="!scenarios.length">
              <td colspan="8" class="py-8 text-center text-muted">
                No scenarios yet. A scenario is a script plus a load profile and pass/fail thresholds.
                <RouterLink to="/performance/scenarios/new" class="text-primary">Create one</RouterLink>.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Scripts -->
    <div v-else class="card">
      <div class="card-body overflow-x-auto">
        <table class="table" data-testid="perf-scripts-table">
          <thead><tr><th>Script</th><th>Type</th><th>Source</th><th>Variables</th><th>Smoke run</th><th>Scenarios</th><th>Updated</th></tr></thead>
          <tbody>
            <tr v-for="s in scripts" :key="s.id" class="cursor-pointer" @click="$router.push(`/performance/scripts/${s.id}`)">
              <td class="font-medium text-heading">{{ s.name }}<div v-if="s.description" class="text-xs text-muted truncate max-w-xs">{{ s.description }}</div></td>
              <td>{{ s.scriptType === 'browser' ? 'Browser' : 'HTTP' }}</td>
              <td class="text-muted">{{ SOURCES[s.source] || s.source }}</td>
              <td class="text-muted">{{ s.envVars.length }}<span v-if="s.envVars.some(v => v.sensitive)"> ({{ s.envVars.filter(v => v.sensitive).length }} secret)</span></td>
              <td>
                <span v-if="!s.lastSmoke" class="text-muted">Not run</span>
                <span v-else :class="['badge', s.lastSmoke.ok ? 'badge-success' : 'badge-danger']">{{ s.lastSmoke.ok ? 'Passed' : 'Failed' }}</span>
              </td>
              <td class="text-muted">{{ s.scenarioCount }}</td>
              <td class="text-xs text-muted">{{ when(s.updatedAt) }}</td>
            </tr>
            <tr v-if="!scripts.length"><td colspan="7" class="py-8 text-center text-muted">No scripts yet. Use "New script" to start from a template, a HAR file or a recording.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- HAR import -->
    <div v-if="harOpen" class="modal-overlay" @mousedown.self="harOpen = false">
      <div class="modal-content" role="dialog" aria-labelledby="har-title" style="max-width: 520px">
        <div class="modal-header"><h2 id="har-title" class="modal-title">Import a HAR file</h2></div>
        <div class="modal-body space-y-3">
          <div>
            <label class="form-label" for="har-name">Script name</label>
            <input id="har-name" v-model="harName" class="form-input" placeholder="e.g. Checkout journey" data-testid="har-name" />
          </div>
          <div>
            <label class="form-label" for="har-file">HAR file</label>
            <input id="har-file" type="file" accept=".har,application/json" class="form-input" data-testid="har-file" @change="pickHar" />
            <p class="text-xs text-muted mt-1">Record the journey with dev tools open on the Network tab, then "Save all as HAR (with content)". Response bodies are used to correlate tokens and ids.</p>
          </div>
          <div class="max-w-[200px]">
            <label class="form-label" for="har-think">Think time between pages (s)</label>
            <input id="har-think" v-model.number="harThink" type="number" min="0" max="60" step="0.5" class="form-input" />
          </div>
          <p v-if="harError" class="text-sm text-danger" role="alert">{{ harError }}</p>
        </div>
        <div class="modal-footer flex justify-end gap-2">
          <button class="btn btn-secondary" @click="harOpen = false">Cancel</button>
          <button class="btn btn-primary" :disabled="harBusy || !harText || !harName.trim()" data-testid="har-import" @click="importHar">{{ harBusy ? 'Building…' : 'Build script' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, FileCode2, ChevronDown, Globe, MonitorPlay, Upload, Video, Play } from 'lucide-vue-next'
import api from '@/lib/api'
import { openGeneratorWindow } from '@/lib/windows'
import PerfStatusBadge from '@/components/Performance/PerfStatusBadge.vue'
import { ms, pct, when, seconds, loadSummary, apiError, k6Status, MAX_LOCAL_VUS } from '@/components/Performance/perfFormat'

const SOURCES = { recording: 'Recording', har: 'HAR import', manual: 'Written', template: 'Template' }

const route = useRoute()
const router = useRouter()
const tab = ref(route.query.tab === 'scripts' ? 'scripts' : 'scenarios')
const scenarios = ref([])
const scripts = ref([])
const maxVus = ref(MAX_LOCAL_VUS)
const k6Installed = ref(true)
const error = ref('')
const starting = ref(null)
const newScriptOpen = ref(false)
const harOpen = ref(false)
const harName = ref('')
const harText = ref('')
const harThink = ref(1)
const harBusy = ref(false)
const harError = ref('')

const tabs = computed(() => [
  { id: 'scenarios', label: 'Scenarios', count: scenarios.value.length },
  { id: 'scripts', label: 'Scripts', count: scripts.value.length }
])

function setTab (id) {
  tab.value = id
  router.replace({ query: { ...route.query, tab: id } })
}

async function load () {
  try {
    const [sc, sp, st] = await Promise.all([
      api.get('/api/performance/scenarios'),
      api.get('/api/performance/scripts'),
      api.get('/api/performance/settings')
    ])
    scenarios.value = sc.data.scenarios
    scripts.value = sp.data.scripts
    maxVus.value = st.data.settings.maxVus
    k6Installed.value = (await k6Status()).installed
  } catch (e) {
    error.value = apiError(e, 'Could not load performance tests')
  }
}

async function fromTemplate (type) {
  error.value = ''
  try {
    const base = type === 'browser' ? 'Browser journey' : 'HTTP journey'
    const names = new Set(scripts.value.map(s => s.name))
    let name = base
    for (let i = 2; names.has(name); i++) name = `${base} ${i}`
    const { data } = await api.post('/api/performance/scripts', { name, scriptType: type })
    router.push(`/performance/scripts/${data.script.id}`)
  } catch (e) {
    error.value = apiError(e, 'Could not create the script')
  }
}

function fromRecording () {
  newScriptOpen.value = false
  openGeneratorWindow(router)
}

function pickHar (ev) {
  harError.value = ''
  const file = ev.target.files?.[0]
  if (!file) return
  if (file.size > 40 * 1024 * 1024) { harError.value = 'That file is larger than 40 MB. Export just the journey you want to test.'; return }
  if (!harName.value.trim()) harName.value = file.name.replace(/\.(har|json)$/i, '')
  const reader = new FileReader()
  reader.onload = () => { harText.value = String(reader.result || '') }
  reader.onerror = () => { harError.value = 'Could not read the file' }
  reader.readAsText(file)
}

async function importHar () {
  harBusy.value = true
  harError.value = ''
  try {
    let har
    try { har = JSON.parse(harText.value) } catch { throw new Error('That file is not valid JSON, so it is not a HAR file') }
    const { data } = await api.post('/api/performance/scripts/from-har', { name: harName.value.trim(), har, thinkTimeSec: harThink.value }, { timeout: 120000 })
    harOpen.value = false
    router.push({ path: `/performance/scripts/${data.script.id}`, query: { imported: `${data.summary.kept}/${data.summary.captured}` } })
  } catch (e) {
    harError.value = apiError(e, 'Could not import the HAR file')
  } finally {
    harBusy.value = false
  }
}

async function run (s) {
  starting.value = s.id
  error.value = ''
  try {
    const { data } = await api.post(`/api/performance/scenarios/${s.id}/run`)
    router.push(`/performance/runs/${data.run.id}`)
  } catch (e) {
    error.value = apiError(e, 'Could not start the run')
  } finally {
    starting.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.perf-option { display: flex; flex-direction: column; gap: 4px; text-align: left; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface, transparent); }
.perf-option:hover { border-color: var(--color-primary); }
.perf-tab { padding: 8px 12px; font-size: 0.875rem; color: var(--color-label); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.perf-tab.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
</style>
