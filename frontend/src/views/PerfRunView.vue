<template>
  <div class="space-y-6" data-testid="page-perf-run">
    <RouterLink v-if="run" :to="`/performance/scenarios/${run.scenarioId}`" class="text-sm text-primary">← {{ run.scenarioName || 'Scenario' }}</RouterLink>
    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

    <template v-if="run">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-page-title flex items-center gap-3 flex-wrap">
            {{ run.scenarioName }}
            <PerfStatusBadge :status="run.status" :regressed="!!run.comparison?.regressed" :baseline="run.isBaseline" />
          </h1>
          <p class="text-sm text-muted">{{ loadSummary(run.load) }} · started {{ when(run.startedAt || run.queuedAt) }} · {{ runLength(run) }}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button v-if="isActive" class="btn btn-danger" :disabled="cancelling" data-testid="run-cancel" @click="cancel"><Square :size="14" /> {{ cancelling ? 'Stopping…' : 'Stop run' }}</button>
          <template v-else>
            <button class="btn btn-success" :disabled="rerunning" @click="rerun"><RotateCcw :size="14" /> Run again</button>
            <button v-if="['passed', 'failed'].includes(run.status) && !run.isBaseline" class="btn btn-secondary" @click="makeBaseline">Set as baseline</button>
            <button class="btn btn-danger" aria-label="Delete run" @click="remove"><Trash2 :size="14" /></button>
          </template>
        </div>
      </div>

      <!-- Live -->
      <div v-if="isActive" class="card" data-testid="run-live">
        <div class="card-body space-y-3">
          <p v-if="run.status === 'queued'" class="text-sm text-muted">Queued. Runs go one at a time on this machine, so this starts when the run before it finishes.</p>
          <template v-else>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><div class="text-xs text-muted">Active users</div><div class="text-2xl font-semibold text-heading">{{ run.live?.vus ?? 0 }} <span class="text-sm text-muted">/ {{ run.live?.maxVus ?? '—' }}</span></div></div>
              <div><div class="text-xs text-muted">Journeys completed</div><div class="text-2xl font-semibold text-heading">{{ num(run.live?.iterations ?? 0) }}</div></div>
              <div><div class="text-xs text-muted">Elapsed</div><div class="text-2xl font-semibold text-heading">{{ run.live?.elapsed || '0s' }}</div></div>
              <div><div class="text-xs text-muted">Interrupted</div><div class="text-2xl font-semibold text-heading">{{ run.live?.interrupted ?? 0 }}</div></div>
            </div>
            <div class="perf-progress" role="progressbar" :aria-valuenow="run.live?.pct || 0" aria-valuemin="0" aria-valuemax="100"><div :style="{ width: `${run.live?.pct || 0}%` }" /></div>
            <p class="text-xs text-muted">Results, charts and the comparison with the baseline appear when the run finishes.</p>
          </template>
        </div>
      </div>

      <div v-if="run.errorMessage && !isActive" class="card border-l-4" style="border-left-color: var(--color-warning)">
        <div class="card-body text-sm">{{ run.errorMessage }}</div>
      </div>

      <template v-if="hasResults">
        <!-- Headline metrics -->
        <div class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          <div v-for="m in headline" :key="m.label" class="card"><div class="card-body">
            <div class="text-xs text-muted">{{ m.label }}</div>
            <div class="text-xl font-semibold text-heading">{{ m.value }}</div>
            <div v-if="m.delta" class="text-xs" :class="m.deltaBad ? 'text-danger' : 'text-muted'">{{ m.delta }}</div>
          </div></div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="card">
            <div class="card-header"><h2 class="card-title">Response times</h2></div>
            <div class="card-body">
              <PerfLineChart v-if="ts.length" :labels="tsLabels" :series="timingSeries" y-title="ms" y1-title="Errors (%)" :format-y="v => `${Math.round(v)} ms`" :format-y1="v => `${Number(v).toFixed(1)}%`" />
              <p v-else class="text-sm text-muted">No time series was recorded.</p>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2 class="card-title">Users and throughput</h2></div>
            <div class="card-body">
              <PerfLineChart v-if="ts.length" :labels="tsLabels" :series="loadSeries" y-title="Users" y1-title="Requests / s" />
              <p v-else class="text-sm text-muted">No time series was recorded.</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="card">
            <div class="card-header"><h2 class="card-title">Thresholds</h2></div>
            <div class="card-body">
              <ul v-if="run.thresholdResults.length" class="space-y-1 text-sm">
                <li v-for="t in run.thresholdResults" :key="t.metric + t.expr" class="flex items-center gap-2">
                  <CheckCircle2 v-if="t.passed" :size="16" class="text-success" /><XCircle v-else :size="16" class="text-danger" />
                  <code>{{ t.metric }}</code> <span>{{ t.expr }}</span>
                </li>
              </ul>
              <p v-else class="text-sm text-muted">No thresholds were set.</p>
              <p v-if="run.metrics.checksFailed" class="text-sm text-warning mt-2">{{ num(run.metrics.checksFailed) }} of {{ num(run.metrics.checksPassed + run.metrics.checksFailed) }} checks failed. Checks don't fail a run on their own; add an error threshold or a <code>checks</code> threshold in the script.</p>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2 class="card-title">Compared with the baseline</h2></div>
            <div class="card-body">
              <table v-if="run.comparison" class="table">
                <thead><tr><th>Metric</th><th>Baseline</th><th>This run</th><th>Change</th></tr></thead>
                <tbody>
                  <tr v-for="d in run.comparison.deltas" :key="d.metric">
                    <td>{{ METRIC_NAMES[d.metric] || d.metric }}</td>
                    <td>{{ fmt(d.metric, d.baseline) }}</td>
                    <td>{{ fmt(d.metric, d.current) }}</td>
                    <td :class="d.regressed ? 'text-danger font-semibold' : 'text-muted'">{{ d.changePts !== undefined ? `${d.changePts > 0 ? '+' : ''}${d.changePts} pts` : `${d.changePct > 0 ? '+' : ''}${d.changePct}%` }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else-if="run.isBaseline" class="text-sm text-muted">This run is the baseline.</p>
              <p v-else class="text-sm text-muted">No comparison: the scenario had no baseline when this ran, or the baseline used a different load.</p>
              <p v-if="run.comparison" class="text-xs text-muted mt-2">A regression is a timing more than {{ run.comparison.tolerancePct }}% slower, or errors up more than {{ run.comparison.failRatePts }} percentage point{{ run.comparison.failRatePts === 1 ? '' : 's' }}. Change these in Settings → Performance.</p>
            </div>
          </div>
        </div>
      </template>

      <div class="card">
        <div class="card-header"><h2 class="card-title">Console output</h2></div>
        <div class="card-body">
          <pre ref="consoleEl" class="perf-console">{{ run.consoleLog || 'Nothing yet.' }}</pre>
          <details class="mt-2">
            <summary class="text-xs text-muted cursor-pointer">Script used for this run</summary>
            <pre class="perf-console">{{ run.script }}</pre>
          </details>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Square, RotateCcw, Trash2, CheckCircle2, XCircle } from 'lucide-vue-next'
import api from '@/lib/api'
import PerfLineChart from '@/components/Performance/PerfLineChart.vue'
import PerfStatusBadge from '@/components/Performance/PerfStatusBadge.vue'
import { ms, pct, num, when, seconds, runLength, loadSummary, apiError } from '@/components/Performance/perfFormat'

const METRIC_NAMES = { p95Duration: '95th percentile', avgDuration: 'Average', medDuration: 'Median', failRate: 'Error rate', reqRate: 'Requests / s' }

const route = useRoute()
const router = useRouter()
const run = ref(null)
const error = ref('')
const cancelling = ref(false)
const rerunning = ref(false)
const consoleEl = ref(null)
let consoleLen = -1
let timer = null

const isActive = computed(() => run.value && ['queued', 'running'].includes(run.value.status))
const hasResults = computed(() => run.value && ['passed', 'failed'].includes(run.value.status))
const ts = computed(() => run.value?.timeseries || [])
const tsLabels = computed(() => ts.value.map(p => seconds(p.tSec)))

const timingSeries = computed(() => {
  const s = [
    { label: 'Average', data: ts.value.map(p => p.avgDuration), color: '#7367F0', fill: true },
    { label: 'Slowest', data: ts.value.map(p => p.maxDuration), color: '#00CFE8' },
    { label: 'Errors %', data: ts.value.map(p => (typeof p.failRate === 'number' ? p.failRate * 100 : null)), color: '#EA5455', axis: 'y1' }
  ]
  // Only draw the threshold when results come near it; otherwise it flattens the real lines.
  const limit = Number(run.value?.thresholds?.p95Ms)
  const peak = Math.max(0, ...ts.value.map(p => p.maxDuration || 0))
  if (limit && peak >= limit * 0.3) s.push({ label: 'p95 threshold', data: ts.value.map(() => limit), color: '#FF9F43', dashed: true })
  return s
})

const loadSeries = computed(() => [
  { label: 'Users', data: ts.value.map(p => p.vus), color: '#28C76F', fill: true, stepped: true },
  { label: 'Requests / s', data: ts.value.map(p => p.reqRate), color: '#7367F0', axis: 'y1' }
])

function deltaFor (metric) {
  return run.value?.comparison?.deltas?.find(d => d.metric === metric)
}

const headline = computed(() => {
  const m = run.value.metrics || {}
  const d = k => {
    const x = deltaFor(k)
    if (!x) return {}
    return { delta: x.changePts !== undefined ? `${x.changePts > 0 ? '+' : ''}${x.changePts} pts vs baseline` : `${x.changePct > 0 ? '+' : ''}${x.changePct}% vs baseline`, deltaBad: x.regressed }
  }
  return [
    { label: 'Requests', value: num(m.httpReqs) },
    { label: 'Requests / s', value: num(m.reqRate, 1), ...d('reqRate') },
    { label: 'Average', value: ms(m.avgDuration), ...d('avgDuration') },
    { label: 'Median', value: ms(m.medDuration), ...d('medDuration') },
    { label: '95th percentile', value: ms(m.p95Duration), ...d('p95Duration') },
    { label: 'Slowest', value: ms(m.maxDuration) },
    { label: 'Errors', value: pct(m.failRate), ...d('failRate') },
    { label: 'Peak users', value: num(m.peakVus) }
  ]
})

function fmt (metric, v) {
  if (metric === 'failRate') return pct(v)
  if (metric === 'reqRate') return num(v, 1)
  return ms(v)
}

async function load () {
  try {
    const { data } = await api.get(`/api/performance/runs/${route.params.id}`)
    const grew = (data.run.consoleLog || '').length !== consoleLen
    consoleLen = (data.run.consoleLog || '').length
    run.value = data.run
    error.value = ''
    // Keep the console at its end, where k6 prints progress and the summary.
    await nextTick()
    if (consoleEl.value && grew) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
  } catch (e) {
    error.value = apiError(e, 'Could not load the run')
  }
  clearTimeout(timer)
  if (isActive.value) timer = setTimeout(load, 2000)
}

async function cancel () {
  cancelling.value = true
  try {
    await api.post(`/api/performance/runs/${run.value.id}/cancel`)
    await load()
  } catch (e) {
    error.value = apiError(e, 'Could not stop the run')
  } finally {
    cancelling.value = false
  }
}

async function rerun () {
  rerunning.value = true
  try {
    const { data } = await api.post(`/api/performance/scenarios/${run.value.scenarioId}/run`)
    router.push(`/performance/runs/${data.run.id}`)
  } catch (e) {
    error.value = apiError(e, 'Could not start the run')
  } finally {
    rerunning.value = false
  }
}

async function makeBaseline () {
  try {
    await api.put(`/api/performance/scenarios/${run.value.scenarioId}/baseline`, { runId: run.value.id })
    await load()
  } catch (e) {
    error.value = apiError(e, 'Could not set the baseline')
  }
}

async function remove () {
  if (!confirm('Delete this run?')) return
  try {
    await api.delete(`/api/performance/runs/${run.value.id}`)
    router.push(`/performance/scenarios/${run.value.scenarioId}`)
  } catch (e) {
    error.value = apiError(e, 'Could not delete the run')
  }
}

watch(() => route.params.id, () => { run.value = null; load() })
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.perf-console { max-height: 320px; overflow: auto; font-size: 11px; white-space: pre-wrap; background: var(--color-background, #fafafa); padding: 8px; border-radius: 6px; }
.perf-progress { height: 6px; border-radius: 3px; background: var(--color-border); overflow: hidden; }
.perf-progress > div { height: 100%; background: var(--color-primary); transition: width 0.5s; }
</style>
