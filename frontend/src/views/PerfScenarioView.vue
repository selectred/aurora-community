<template>
  <div class="space-y-6" data-testid="page-perf-scenario">
    <RouterLink to="/performance" class="text-sm text-primary">← Performance scenarios</RouterLink>

    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
    <p v-if="notice" class="text-sm text-success" role="status">{{ notice }}</p>

    <template v-if="form">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-[280px] space-y-2">
          <input v-model="form.name" class="form-input text-lg font-semibold" placeholder="Scenario name, e.g. Checkout at peak" aria-label="Scenario name" data-testid="scenario-name" @input="dirty = true" />
          <input v-model="form.description" class="form-input" placeholder="What this scenario proves" aria-label="Description" @input="dirty = true" />
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-primary" :disabled="saving || (!dirty && !isNew) || !loadValid" data-testid="scenario-save" @click="save()">{{ saving ? 'Saving…' : isNew ? 'Create scenario' : dirty ? 'Save' : 'Saved' }}</button>
          <template v-if="!isNew">
            <button class="btn btn-success" :disabled="starting || !loadValid || !k6Installed || busyRun" data-testid="scenario-run" @click="run"><Play :size="14" /> {{ starting ? 'Queuing…' : dirty ? 'Save & run' : 'Run' }}</button>
            <button class="btn btn-secondary" :disabled="pushing || dirty" data-testid="scenario-push" :title="dirty ? 'Save first' : 'Send the script, variable names, load profile and thresholds to Continuum'" @click="push"><UploadCloud :size="14" /> {{ pushing ? 'Pushing…' : 'Push to Continuum' }}</button>
            <button class="btn btn-danger" :disabled="deleting" aria-label="Delete scenario" @click="remove"><Trash2 :size="14" /></button>
          </template>
        </div>
      </div>

      <div v-if="pushResult" class="card"><div class="card-body text-sm">
        {{ pushResult.created ? 'Created' : 'Updated' }} in Continuum with its load profile.
        <a :href="pushResult.url" target="_blank" rel="noopener" class="text-primary">Open in Continuum</a>.
        <span v-if="pushResult.secretsWithheld?.length" class="text-muted">Set these secrets there: {{ pushResult.secretsWithheld.join(', ') }}.</span>
      </div></div>

      <K6InstallCard @installed="k6Installed = true" />

      <div v-if="activeRun" class="card border-l-4" style="border-left-color: var(--color-primary)">
        <div class="card-body flex items-center justify-between gap-3 flex-wrap text-sm">
          <span><PerfStatusBadge :status="activeRun.status" /> <span class="ml-2">{{ activeRun.status === 'queued' ? 'Waiting for the run before it to finish' : liveText(activeRun) }}</span></span>
          <RouterLink :to="`/performance/runs/${activeRun.id}`" class="btn btn-sm btn-secondary">Watch run</RouterLink>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- Builder -->
        <div class="card xl:col-span-2">
          <div class="card-header"><h2 class="card-title">Load profile</h2></div>
          <div class="card-body">
            <LoadProfileEditor v-model="form.load" :max-vus="settings.maxVus" :max-duration-min="settings.maxDurationMin" @update:model-value="dirty = true" @valid="v => (loadValid = v)" />
          </div>
        </div>

        <div class="space-y-6">
          <div class="card">
            <div class="card-header"><h2 class="card-title">Script</h2></div>
            <div class="card-body space-y-3">
              <div>
                <label class="form-label" for="sc-script">k6 script</label>
                <select id="sc-script" v-model="form.scriptId" class="form-select" data-testid="scenario-script" @change="dirty = true">
                  <option value="" disabled>Choose a script</option>
                  <option v-for="s in scripts" :key="s.id" :value="s.id">{{ s.name }}{{ s.scriptType === 'browser' ? ' (browser)' : '' }}</option>
                </select>
                <p class="text-xs mt-1">
                  <RouterLink v-if="form.scriptId" :to="`/performance/scripts/${form.scriptId}`" class="text-primary">Open the script</RouterLink>
                  <span v-if="selectedScript?.lastSmoke && !selectedScript.lastSmoke.ok" class="text-warning"> · its last smoke run failed</span>
                  <span v-else-if="selectedScript && !selectedScript.lastSmoke" class="text-muted"> · not smoke-run yet</span>
                </p>
                <p v-if="selectedScript?.scriptType === 'browser'" class="text-xs text-warning mt-1">Browser users each drive a real Chromium. On a laptop, a few is plenty.</p>
              </div>
              <div>
                <label class="form-label" for="sc-think">Think time between pages (s)</label>
                <input id="sc-think" v-model="form.thinkTimeSec" type="number" min="0" max="60" step="0.1" class="form-input" placeholder="Use the script's value" @input="dirty = true" />
                <p class="text-xs text-muted mt-1">Sets <code>THINK_TIME</code>. Leave blank to use the script's default.</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h2 class="card-title">Pass / fail thresholds</h2></div>
            <div class="card-body space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label" for="th-p95">95th percentile under (ms)</label>
                  <input id="th-p95" v-model="form.thresholds.p95Ms" type="number" min="1" class="form-input" placeholder="none" data-testid="th-p95" @input="dirty = true" />
                </div>
                <div>
                  <label class="form-label" for="th-avg">Average under (ms)</label>
                  <input id="th-avg" v-model="form.thresholds.avgMs" type="number" min="1" class="form-input" placeholder="none" @input="dirty = true" />
                </div>
                <div>
                  <label class="form-label" for="th-err">Errors under (%)</label>
                  <input id="th-err" v-model="form.thresholds.maxFailRatePct" type="number" min="0" max="100" step="0.1" class="form-input" placeholder="none" data-testid="th-err" @input="dirty = true" />
                </div>
              </div>
              <p class="text-xs text-muted">Applied to every request in the run, on top of any thresholds in the script. A run fails when one is crossed.</p>
            </div>
          </div>
        </div>
      </div>

      <template v-if="!isNew">
        <!-- Trend -->
        <div class="card">
          <div class="card-header flex items-center justify-between gap-2 flex-wrap">
            <h2 class="card-title">Trend</h2>
            <label class="text-xs text-muted flex items-center gap-1"><input v-model="sameLoadOnly" type="checkbox" /> Only runs with the current load</label>
          </div>
          <div class="card-body">
            <PerfLineChart
              v-if="trend.length > 1"
              :labels="trend.map(r => when(r.finishedAt))"
              :series="trendSeries"
              y-title="Response time (ms)"
              y1-title="Errors (%)"
              :format-y="v => `${Math.round(v)} ms`"
              :format-y1="v => `${Number(v).toFixed(1)}%`"
            />
            <p v-else class="text-sm text-muted">The trend appears after two completed runs{{ sameLoadOnly ? ' with this load' : '' }}.</p>
            <p v-if="baseline" class="text-xs text-muted mt-2">
              Baseline: <RouterLink :to="`/performance/runs/${baseline.id}`" class="text-primary">{{ when(baseline.finishedAt) }}</RouterLink>
              · p95 {{ ms(baseline.metrics?.p95Duration) }} · errors {{ pct(baseline.metrics?.failRate) }}. Later runs with the same load are compared with it.
              <button class="text-primary ml-1" @click="setBaseline(null)">Clear</button>
            </p>
            <p v-else class="text-xs text-muted mt-2">No baseline yet. Mark a good run as the baseline and later runs with the same load are compared with it.</p>
          </div>
        </div>

        <!-- Runs -->
        <div class="card">
          <div class="card-header"><h2 class="card-title">Runs</h2></div>
          <div class="card-body overflow-x-auto">
            <table class="table" data-testid="scenario-runs">
              <thead><tr><th>Started</th><th>Status</th><th>Load</th><th>Length</th><th>Requests</th><th>p95</th><th>Avg</th><th>Errors</th><th>vs baseline</th><th></th></tr></thead>
              <tbody>
                <tr v-for="r in runs" :key="r.id" class="cursor-pointer" @click="$router.push(`/performance/runs/${r.id}`)">
                  <td>{{ when(r.startedAt || r.queuedAt) }}</td>
                  <td><PerfStatusBadge :status="r.status" :regressed="!!r.comparison?.regressed" :baseline="r.id === scenario?.baselineRunId" /></td>
                  <td class="text-xs text-muted">{{ loadSummary(r.load) }}</td>
                  <td>{{ runLength(r) }}</td>
                  <td>{{ num(r.metrics?.httpReqs) }}</td>
                  <td>{{ ms(r.metrics?.p95Duration) }}</td>
                  <td>{{ ms(r.metrics?.avgDuration) }}</td>
                  <td>{{ pct(r.metrics?.failRate) }}</td>
                  <td class="text-xs">{{ deltaText(r) }}</td>
                  <td class="text-right" @click.stop>
                    <button v-if="['passed', 'failed'].includes(r.status) && r.id !== scenario?.baselineRunId" class="btn btn-sm btn-secondary" title="Compare later runs with this one" @click="setBaseline(r.id)">Set baseline</button>
                  </td>
                </tr>
                <tr v-if="!runs.length"><td colspan="10" class="py-6 text-center text-muted">No runs yet. Smoke-run the script first, then run the scenario here.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { Play, Trash2, UploadCloud } from 'lucide-vue-next'
import api from '@/lib/api'
import K6InstallCard from '@/components/Performance/K6InstallCard.vue'
import LoadProfileEditor from '@/components/Performance/LoadProfileEditor.vue'
import PerfLineChart from '@/components/Performance/PerfLineChart.vue'
import PerfStatusBadge from '@/components/Performance/PerfStatusBadge.vue'
import { ms, pct, num, when, runLength, loadSummary, apiError, k6Status, MAX_LOCAL_VUS } from '@/components/Performance/perfFormat'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)
const isNew = computed(() => id.value === 'new')

const form = ref(null)
const scenario = ref(null)
const scripts = ref([])
const runs = ref([])
const baseline = ref(null)
const settings = ref({ maxVus: MAX_LOCAL_VUS, maxDurationMin: 60 })
const dirty = ref(false)
const loadValid = ref(true)
const saving = ref(false)
const starting = ref(false)
const pushing = ref(false)
const deleting = ref(false)
const pushResult = ref(null)
const k6Installed = ref(true)
const sameLoadOnly = ref(true)
const error = ref('')
const notice = ref('')
let timer = null

const selectedScript = computed(() => scripts.value.find(s => s.id === form.value?.scriptId))
const activeRun = computed(() => runs.value.find(r => r.status === 'running' || r.status === 'queued'))
const busyRun = computed(() => !!activeRun.value)

const trend = computed(() => {
  const current = JSON.stringify(scenario.value?.load || {})
  return runs.value
    .filter(r => ['passed', 'failed'].includes(r.status))
    .filter(r => !sameLoadOnly.value || JSON.stringify(r.load) === current)
    .slice()
    .reverse()
})

const trendSeries = computed(() => {
  const s = [
    { label: 'p95', data: trend.value.map(r => r.metrics?.p95Duration ?? null), color: '#7367F0' },
    { label: 'Average', data: trend.value.map(r => r.metrics?.avgDuration ?? null), color: '#00CFE8' },
    { label: 'Errors %', data: trend.value.map(r => (typeof r.metrics?.failRate === 'number' ? r.metrics.failRate * 100 : null)), color: '#EA5455', axis: 'y1' }
  ]
  const b = baseline.value?.metrics?.p95Duration
  if (typeof b === 'number') s.push({ label: 'Baseline p95', data: trend.value.map(() => b), color: '#FF9F43', dashed: true })
  const t = scenario.value?.thresholds?.p95Ms
  if (t) s.push({ label: 'p95 threshold', data: trend.value.map(() => Number(t)), color: '#EA5455', dashed: true })
  return s
})

function liveText (r) {
  const l = r.live || {}
  return `${l.vus ?? 0} users · ${l.iterations ?? 0} journeys · ${l.elapsed || '0s'}${typeof l.pct === 'number' ? ` · ${l.pct}%` : ''}`
}

function deltaText (r) {
  const d = r.comparison?.deltas?.find(x => x.metric === 'p95Duration')
  if (!d) return '—'
  return `p95 ${d.changePct > 0 ? '+' : ''}${d.changePct}%`
}

function blankThresholds (t = {}) {
  return { p95Ms: t.p95Ms ?? '', avgMs: t.avgMs ?? '', maxFailRatePct: t.maxFailRatePct ?? '' }
}

async function load () {
  error.value = ''
  try {
    const [sp, st] = await Promise.all([api.get('/api/performance/scripts'), api.get('/api/performance/settings')])
    scripts.value = sp.data.scripts
    settings.value = st.data.settings
    k6Installed.value = (await k6Status()).installed
    if (isNew.value) {
      const s = st.data.settings
      form.value = {
        name: '',
        description: '',
        scriptId: route.query.scriptId || scripts.value[0]?.id || '',
        load: JSON.parse(JSON.stringify(s.defaultLoad)),
        thresholds: blankThresholds(s.defaultThresholds),
        thinkTimeSec: s.defaultThinkTimeSec ?? ''
      }
      dirty.value = true
      if (!scripts.value.length) error.value = 'Create a script first: a scenario runs a script under load.'
      return
    }
    await loadScenario(true)
  } catch (e) {
    error.value = apiError(e, 'Could not load the scenario')
  }
}

async function loadScenario (resetForm = false) {
  const { data } = await api.get(`/api/performance/scenarios/${id.value}`)
  scenario.value = data.scenario
  runs.value = data.runs
  baseline.value = data.baseline
  if (resetForm || !dirty.value) {
    form.value = {
      name: data.scenario.name,
      description: data.scenario.description,
      scriptId: data.scenario.scriptId,
      load: data.scenario.load,
      thresholds: blankThresholds(data.scenario.thresholds),
      thinkTimeSec: data.scenario.thinkTimeSec ?? ''
    }
    dirty.value = false
  }
  schedule()
}

function schedule () {
  clearTimeout(timer)
  if (activeRun.value) timer = setTimeout(() => loadScenario().catch(() => {}), 3000)
}

function payload () {
  const t = form.value.thresholds
  const n = v => (v === '' || v === null || v === undefined ? null : Number(v))
  return {
    name: form.value.name,
    description: form.value.description,
    scriptId: form.value.scriptId,
    load: form.value.load,
    thresholds: { p95Ms: n(t.p95Ms), avgMs: n(t.avgMs), maxFailRatePct: n(t.maxFailRatePct) },
    thinkTimeSec: n(form.value.thinkTimeSec)
  }
}

async function save () {
  saving.value = true
  error.value = ''
  try {
    if (isNew.value) {
      const { data } = await api.post('/api/performance/scenarios', payload())
      dirty.value = false
      router.replace(`/performance/scenarios/${data.scenario.id}`)
      return true
    }
    await api.put(`/api/performance/scenarios/${id.value}`, payload())
    dirty.value = false
    await loadScenario(true)
    return true
  } catch (e) {
    error.value = apiError(e, 'Could not save the scenario')
    return false
  } finally {
    saving.value = false
  }
}

async function run () {
  if (dirty.value && !(await save())) return
  starting.value = true
  error.value = ''
  try {
    const { data } = await api.post(`/api/performance/scenarios/${id.value}/run`)
    router.push(`/performance/runs/${data.run.id}`)
  } catch (e) {
    error.value = apiError(e, 'Could not start the run')
  } finally {
    starting.value = false
  }
}

async function push () {
  pushing.value = true
  error.value = ''
  pushResult.value = null
  try {
    const { data } = await api.post(`/api/performance/scenarios/${id.value}/push`, {}, { timeout: 60000 })
    pushResult.value = data
    await loadScenario()
  } catch (e) {
    error.value = apiError(e, 'Could not push to Continuum')
  } finally {
    pushing.value = false
  }
}

async function setBaseline (runId) {
  try {
    await api.put(`/api/performance/scenarios/${id.value}/baseline`, { runId })
    await loadScenario()
  } catch (e) {
    error.value = apiError(e, 'Could not change the baseline')
  }
}

async function remove () {
  if (!confirm(`Delete the scenario "${scenario.value.name}" and its run history?`)) return
  deleting.value = true
  try {
    await api.delete(`/api/performance/scenarios/${id.value}`)
    dirty.value = false
    router.push('/performance')
  } catch (e) {
    error.value = apiError(e, 'Could not delete the scenario')
  } finally {
    deleting.value = false
  }
}

watch(id, (v, old) => { if (v !== old) load() })
onBeforeRouteLeave((to) => (dirty.value && !isNew.value && !to.path.startsWith('/performance/runs/') ? confirm('Leave without saving your changes?') : true))
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
</script>
