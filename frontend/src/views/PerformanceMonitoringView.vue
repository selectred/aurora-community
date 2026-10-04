<template>
  <div class="space-y-6" data-testid="page-performance-monitoring">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-page-title">Performance</h1>
        <p class="text-body text-body-color">Local k6 runs of your scenarios: response times, errors and regressions against each scenario's baseline.</p>
      </div>
      <div class="flex gap-2 items-center">
        <select v-model.number="days" class="form-select" aria-label="Period" style="width: auto" @change="load">
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
        <RouterLink to="/performance" class="btn btn-primary">Scenarios & scripts</RouterLink>
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

    <template v-if="data">
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div v-for="k in kpis" :key="k.label" class="card"><div class="card-body">
          <div class="text-xs text-muted">{{ k.label }}</div>
          <div class="text-2xl font-semibold" :class="k.cls || 'text-heading'">{{ k.value }}</div>
          <div v-if="k.sub" class="text-xs text-muted">{{ k.sub }}</div>
        </div></div>
      </div>

      <div v-if="!data.points.length" class="card"><div class="card-body text-center text-muted py-10">
        No completed runs in this period.
        <RouterLink to="/performance" class="text-primary">Build a scenario and run it</RouterLink>; its results appear here.
      </div></div>

      <template v-else>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="card">
            <div class="card-header"><h2 class="card-title">95th percentile response time</h2></div>
            <div class="card-body">
              <PerfLineChart :labels="labels" :series="seriesFor('p95')" y-title="ms" :format-y="v => `${Math.round(v)} ms`" />
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h2 class="card-title">Error rate</h2></div>
            <div class="card-body">
              <PerfLineChart :labels="labels" :series="seriesFor('failRate', 100)" y-title="%" :format-y="v => `${Number(v).toFixed(2)}%`" />
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2 class="card-title">Latest result per scenario</h2></div>
          <div class="card-body overflow-x-auto">
            <table class="table">
              <thead><tr><th>Scenario</th><th>Status</th><th>p95</th><th>Average</th><th>Errors</th><th>Requests / s</th><th>Peak users</th><th>When</th></tr></thead>
              <tbody>
                <tr v-for="p in data.latest" :key="p.scenarioId" class="cursor-pointer" @click="$router.push(`/performance/scenarios/${p.scenarioId}`)">
                  <td class="font-medium text-heading">{{ p.scenarioName }}</td>
                  <td><PerfStatusBadge :status="p.status" :regressed="p.regressed" /></td>
                  <td>{{ ms(p.p95) }}</td>
                  <td>{{ ms(p.avg) }}</td>
                  <td>{{ pct(p.failRate) }}</td>
                  <td>{{ num(p.reqRate, 1) }}</td>
                  <td>{{ num(p.peakVus) }}</td>
                  <td class="text-xs text-muted">{{ when(p.at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <div class="card">
        <div class="card-header"><h2 class="card-title">Recent runs</h2></div>
        <div class="card-body overflow-x-auto">
          <table class="table">
            <thead><tr><th>When</th><th>Scenario</th><th>Status</th><th>p95</th><th>Errors</th><th>Note</th></tr></thead>
            <tbody>
              <tr v-for="r in data.recent" :key="r.id" class="cursor-pointer" @click="$router.push(`/performance/runs/${r.id}`)">
                <td class="text-xs">{{ when(r.at) }}</td>
                <td>{{ r.scenarioName }}</td>
                <td><PerfStatusBadge :status="r.status" :regressed="r.regressed" /></td>
                <td>{{ ms(r.metrics?.p95Duration) }}</td>
                <td>{{ pct(r.metrics?.failRate) }}</td>
                <td class="text-xs text-muted truncate max-w-xs">{{ r.errorMessage || '' }}</td>
              </tr>
              <tr v-if="!data.recent.length"><td colspan="6" class="py-6 text-center text-muted">No runs in this period.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/lib/api'
import PerfLineChart from '@/components/Performance/PerfLineChart.vue'
import PerfStatusBadge from '@/components/Performance/PerfStatusBadge.vue'
import { ms, pct, num, when, apiError } from '@/components/Performance/perfFormat'

const PALETTE = ['#7367F0', '#28C76F', '#FF9F43', '#00CFE8', '#EA5455', '#82868B', '#9C27B0', '#3F51B5']

const days = ref(30)
const data = ref(null)
const error = ref('')

const kpis = computed(() => {
  const t = data.value.totals
  const rate = t.completed ? Math.round((t.passed / t.completed) * 100) : null
  return [
    { label: 'Scenarios', value: t.scenarios, sub: `${t.scripts} script${t.scripts === 1 ? '' : 's'}` },
    { label: 'Runs', value: t.runs, sub: t.active ? `${t.active} in progress` : 'in this period' },
    { label: 'Pass rate', value: rate === null ? '—' : `${rate}%`, sub: `${t.passed} passed, ${t.failed} failed`, cls: rate === null ? '' : rate >= 90 ? 'text-success' : rate >= 70 ? 'text-warning' : 'text-danger' },
    { label: 'Regressions', value: t.regressions, sub: 'against baselines', cls: t.regressions ? 'text-warning' : '' },
    { label: 'Errors', value: t.errors, sub: 'runs that could not complete', cls: t.errors ? 'text-danger' : '' },
    { label: 'In Continuum', value: t.pushed, sub: `of ${t.scenarios} scenarios pushed` }
  ]
})

const points = computed(() => data.value?.points || [])
const labels = computed(() => points.value.map(p => when(p.at)))

function seriesFor (field, scale = 1) {
  const ids = [...new Set(points.value.map(p => p.scenarioId))]
  return ids.map((sid, i) => ({
    label: points.value.find(p => p.scenarioId === sid)?.scenarioName || 'Scenario',
    color: PALETTE[i % PALETTE.length],
    data: points.value.map(p => (p.scenarioId === sid && typeof p[field] === 'number' ? p[field] * scale : null))
  }))
}

async function load () {
  try {
    data.value = (await api.get('/api/performance/overview', { params: { days: days.value } })).data
    error.value = ''
  } catch (e) {
    error.value = apiError(e, 'Could not load performance results')
  }
}

onMounted(load)
</script>
