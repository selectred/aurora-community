<script setup>
import { ref, onMounted, computed } from 'vue'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  BarElement, BarController,
  PointElement, LineElement,
  ArcElement, DoughnutController,
  Title, Tooltip, Legend, Filler
} from 'chart.js'
import api from '@/lib/api'
import { useThemeStore } from '@/stores/themeStore'
import { TrendingUp, Clock, AlertTriangle, Target, Bug } from 'lucide-vue-next'
import HelpTooltip from '@/components/HelpTooltip.vue'
import { useAiTelemetry } from '@/composables/useAiTelemetry'

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, BarController,
  PointElement, LineElement,
  ArcElement, DoughnutController,
  Title, Tooltip, Legend, Filler
)

const themeStore = useThemeStore()
const aiTelemetry = useAiTelemetry()

// ── Existing state ────────────────────────────────────────────────────
const selectedHours = ref(720)
const timelineData = ref(null)
const loading = ref(false)
const chartKey = ref(0)

const initiatives = ref([])
const testPacks = ref([])
const selectedInitiativeId = ref('')
const selectedPackId = ref('')

const bugSummary = ref({ byStatus: {}, bySeverity: {} })
const openBugsCount = computed(() => bugSummary.value.byStatus?.open ?? 0)
const criticalHighCount = computed(() =>
  (bugSummary.value.bySeverity?.critical ?? 0) + (bugSummary.value.bySeverity?.high ?? 0)
)

const metrics24h = ref(null)
const selectedHourLabel = computed(() => hourOptions.find(o => o.value === selectedHours.value)?.label ?? 'Last 2h')

const hourOptions = [
  { value: 2,   label: 'Last 2h' },
  { value: 6,   label: 'Last 6h' },
  { value: 12,  label: 'Last 12h' },
  { value: 24,  label: 'Last 24h' },
  { value: 72,  label: 'Last 3 days' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
]

// ── Chart tabs ────────────────────────────────────────────────────────
const activeChartTab = ref('timeline')
const chartTabs = [
  { key: 'timeline',   label: 'Execution' },
  { key: 'ai-quality', label: 'AI Quality' },
  { key: 'ai-spend',   label: 'AI Spend' },
]

const chartTabTitle = computed(() => {
  if (activeChartTab.value === 'ai-quality') return 'AI Generation Quality'
  if (activeChartTab.value === 'ai-spend')   return 'AI Cost Breakdown'
  return 'Test Execution Timeline'
})

// ── Theme helpers ─────────────────────────────────────────────────────
const gridColor  = computed(() => themeStore.isDark ? '#374151' : '#E5E7EB')
const labelColor = computed(() => themeStore.isDark ? '#9ca3af' : '#6b7280')

const tooltipBase = computed(() => ({
  backgroundColor: themeStore.isDark ? '#1F2937' : '#FFFFFF',
  titleColor:      themeStore.isDark ? '#f3f4f6' : '#1f2937',
  bodyColor:       themeStore.isDark ? '#d1d5db' : '#4b5563',
  borderColor:     gridColor.value,
  borderWidth: 1,
  cornerRadius: 8,
  padding: 12,
  titleFont: { size: 12, weight: '600' },
  bodyFont:  { size: 12 },
}))

// ── Existing data functions ───────────────────────────────────────────
const fetchMetrics = async (hours) => {
  try {
    const metricsRes = await api.get(`/api/tests/metrics?hours=${hours}`)
    metrics24h.value = metricsRes.data.metrics || null
  } catch { /* non-fatal */ }
}

const fetchTimelineData = async (hours) => {
  try {
    loading.value = true
    let url = `/api/tests/timeline?hours=${hours}`
    if (selectedPackId.value) {
      url += `&packId=${selectedPackId.value}`
    } else if (selectedInitiativeId.value) {
      const initiative = initiatives.value.find(i => i.id === selectedInitiativeId.value)
      if (initiative?.teamId) url += `&teamId=${initiative.teamId}`
    }
    const result = await api.get(url)

    if (result.data.success && result.data.data) {
      const rawData = result.data.data
      const points = []
      for (const [dateKey, hourBuckets] of Object.entries(rawData)) {
        for (const [timeKey, stats] of Object.entries(hourBuckets)) {
          points.push({ sortKey: `${dateKey}T${timeKey}`, dateKey, timeKey, stats })
        }
      }
      points.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

      if (points.length > 0) {
        const uniqueDates = new Set(points.map(p => p.dateKey))
        const multiDay = uniqueDates.size > 1
        const labels = points.map(p => {
          if (multiDay) {
            const d = new Date(p.sortKey)
            return d.toLocaleDateString('en', { weekday: 'short' }) + ' ' + p.timeKey
          }
          return p.timeKey
        })
        timelineData.value = {
          labels,
          datasets: [
            {
              label: 'Passed',
              data: points.map(p => p.stats.passed || 0),
              borderColor: '#28C76F',
              backgroundColor: 'rgba(40, 199, 111, 0.1)',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Failed',
              data: points.map(p => p.stats.failed || 0),
              borderColor: '#EA5455',
              backgroundColor: 'rgba(234, 84, 85, 0.1)',
              tension: 0.3,
              fill: true
            }
          ]
        }
      } else {
        timelineData.value = null
      }
    } else {
      timelineData.value = null
    }
  } catch (error) {
    console.error('Failed to fetch timeline data:', error.message)
    timelineData.value = null
  } finally {
    loading.value = false
    chartKey.value++
  }
}

const handleHoursChange = (hours) => {
  selectedHours.value = hours
  fetchTimelineData(hours)
  fetchMetrics(hours)
}

const handleFilterChange = () => {
  fetchTimelineData(selectedHours.value)
}

const clearFilters = () => {
  selectedInitiativeId.value = ''
  selectedPackId.value = ''
  fetchTimelineData(selectedHours.value)
}

// ── Chart options ─────────────────────────────────────────────────────
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        boxWidth: 12,
        padding: 15,
        font: { size: 12, weight: '500', family: 'Inter, system-ui, sans-serif' },
        color: themeStore.isDark ? '#9ca3af' : '#4b5563'
      }
    },
    tooltip: { ...tooltipBase.value }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { color: gridColor.value, drawBorder: false }
    },
    x: {
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { display: false, drawBorder: false }
    }
  }
}))

const acceptanceChartOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      ...tooltipBase.value,
      callbacks: { label: ctx => ' ' + ctx.parsed.x + '%' }
    }
  },
  scales: {
    x: {
      min: 0,
      max: 100,
      ticks: { color: labelColor.value, font: { size: 11 }, callback: v => v + '%' },
      grid:  { color: gridColor.value }
    },
    y: {
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { display: false }
    }
  }
}))

const costDoughnutOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right',
      labels: { color: labelColor.value, padding: 16, usePointStyle: true, font: { size: 12 } }
    },
    tooltip: {
      ...tooltipBase.value,
      callbacks: { label: ctx => ' ' + ctx.label + ': £' + (ctx.parsed ?? 0).toFixed(4) }
    }
  }
}))

const cbaChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: { color: labelColor.value, font: { size: 12 }, padding: 16, boxWidth: 12 }
    },
    tooltip: { ...tooltipBase.value }
  },
  scales: {
    y: {
      type: 'linear',
      position: 'left',
      beginAtZero: true,
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { color: gridColor.value },
      title: { display: true, text: 'Hours Saved', color: '#28C76F', font: { size: 11 } }
    },
    y2: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      ticks: { color: labelColor.value, font: { size: 11 }, callback: v => '£' + v.toFixed(3) },
      grid:  { drawOnChartArea: false },
      title: { display: true, text: 'AI Cost (£)', color: '#7367F0', font: { size: 11 } }
    },
    x: {
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { display: false }
    }
  }
}))

// ── CBA helpers ───────────────────────────────────────────────────────
function formatGBP(amount) {
  if (amount >= 1)    return '£' + amount.toFixed(2)
  if (amount >= 0.01) return '£' + amount.toFixed(3)
  return '£' + amount.toFixed(4)
}

function formatHours(hrs) {
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  if (h === 0) return m + 'm'
  if (m === 0) return h + 'h'
  return h + 'h ' + m + 'm'
}

const cbaTotals = computed(() => {
  const rows = aiTelemetry.cbaSavings.value
  return {
    used: rows.reduce((s, r) => s + r.used, 0),
    hrs:      rows.reduce((s, r) => s + r.hrs, 0),
    cost:     rows.reduce((s, r) => s + r.cost, 0),
    net:      rows.reduce((s, r) => s + r.net, 0),
  }
})

// ── onMounted ─────────────────────────────────────────────────────────
onMounted(async () => {
  fetchTimelineData(selectedHours.value)
  fetchMetrics(selectedHours.value)
  aiTelemetry.load()
  try {
    const bugRes = await api.get('/api/bug-reports/summary')
    bugSummary.value = bugRes.data.summary || { byStatus: {}, bySeverity: {} }
  } catch { /* non-fatal */ }
  try {
    const [initRes, packRes] = await Promise.all([
      api.get('/api/initiatives'),
      api.get('/api/agent-tests/packs')
    ])
    initiatives.value = initRes.data.initiatives || []
    testPacks.value = Array.isArray(packRes.data) ? packRes.data : []
  } catch { /* non-fatal */ }
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Track your test execution and quality metrics</p>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Test Runs<HelpTooltip text="Total automated tests executed in the selected time window, broken down by pass and fail." /></p>
            <p class="text-3xl font-bold text-heading">{{ metrics24h ? metrics24h.total : '—' }}</p>
            <div class="flex items-center gap-3 mt-3">
              <span class="badge badge-success">{{ metrics24h ? metrics24h.passed : 0 }} passed</span>
              <span class="badge badge-danger">{{ metrics24h ? metrics24h.failed : 0 }} failed</span>
            </div>
            <p class="text-[11px] text-muted mt-2">{{ selectedHourLabel }}</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-success-soft flex items-center justify-center">
            <TrendingUp class="w-5 h-5 text-success" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Avg Execution<HelpTooltip text="Average time taken to run a single test. Lower is better — high values can indicate slow environments or tests with unnecessary waits." /></p>
            <p class="text-3xl font-bold text-heading">
              {{ metrics24h ? (metrics24h.avgDuration ? (metrics24h.avgDuration / 1000).toFixed(1) + 's' : '0s') : '—' }}
            </p>
            <p class="text-body text-muted mt-3">Per test</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-info-soft flex items-center justify-center">
            <Clock class="w-5 h-5 text-info" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Flaky Tests<HelpTooltip text="Tests that pass and fail inconsistently without any code change. Flaky tests erode confidence in your suite and should be investigated and stabilised." /></p>
            <p class="text-3xl font-bold text-heading">{{ metrics24h ? metrics24h.flaky : '—' }}</p>
            <span v-if="metrics24h && metrics24h.flaky > 0" class="badge badge-warning mt-3">Needs review</span>
            <span v-else-if="metrics24h" class="badge badge-success mt-3">All clear</span>
          </div>
          <div class="w-10 h-10 rounded-lg bg-warning-soft flex items-center justify-center">
            <AlertTriangle class="w-5 h-5 text-warning" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Pass Rate<HelpTooltip text="Percentage of tests that passed in the last 24 hours." /></p>
            <p class="text-3xl font-bold text-heading">{{ metrics24h ? metrics24h.passRate + '%' : '—' }}</p>
            <div v-if="metrics24h" class="mt-3">
              <div class="w-full bg-border-default rounded-full h-2 border-default">
                <div class="bg-primary h-2 rounded-full transition-all duration-300" :style="{ width: metrics24h.passRate + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
            <Target class="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Open Bugs<HelpTooltip text="Bugs discovered by automated tests that haven't been resolved yet. Critical and high-severity bugs are highlighted — view details in Bug Reports." /></p>
            <p class="text-3xl font-bold text-danger">{{ openBugsCount }}</p>
            <p class="text-body text-muted mt-3">
              <span class="text-danger font-medium">{{ criticalHighCount }}</span> critical/high
            </p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-danger-soft flex items-center justify-center">
            <Bug class="w-5 h-5 text-danger" />
          </div>
        </div>
      </div>
    </div>

    <!-- Tabbed Chart Card -->
    <div class="card !p-0">
      <div class="flex items-center border-b border-default overflow-x-auto">
        <button
          v-for="tab in chartTabs"
          :key="tab.key"
          @click="activeChartTab = tab.key"
          :class="[
            'px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors flex-shrink-0',
            activeChartTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-heading'
          ]"
        >
          {{ tab.label }}
        </button>
        <!-- Timeline-only controls on the right -->
        <div v-if="activeChartTab === 'timeline'" class="ml-auto flex items-center gap-2 px-4 flex-shrink-0 py-2">
          <select
            v-model="selectedInitiativeId"
            @change="selectedPackId = ''; handleFilterChange()"
            class="form-select text-sm py-1 h-8"
            style="min-width: 140px"
          >
            <option value="">All Initiatives</option>
            <option v-for="ini in initiatives" :key="ini.id" :value="ini.id">{{ ini.name }}</option>
          </select>
          <select
            v-model="selectedPackId"
            @change="selectedInitiativeId = ''; handleFilterChange()"
            class="form-select text-sm py-1 h-8"
            style="min-width: 140px"
          >
            <option value="">All Test Packs</option>
            <option v-for="pack in testPacks" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
          </select>
          <button
            v-if="selectedInitiativeId || selectedPackId"
            @click="clearFilters"
            class="text-xs text-muted hover:text-heading px-2 py-1 rounded border border-default"
          >
            Clear
          </button>
          <select
            :value="selectedHours"
            @change="handleHoursChange(Number($event.target.value))"
            class="form-select text-sm py-1 h-8"
            style="min-width: 110px"
          >
            <option v-for="opt in hourOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <div class="p-6">
        <!-- Execution tab -->
        <template v-if="activeChartTab === 'timeline'">
          <div v-if="loading" class="flex items-center justify-center h-80 text-muted">
            <p class="font-medium">Loading chart data...</p>
          </div>
          <div v-else-if="!timelineData" class="flex items-center justify-center h-80 text-muted text-sm">
            No test runs in the selected time window — execute a test pack to see results here.
          </div>
          <div v-else :key="chartKey" style="position: relative; height: 320px;">
            <Line :data="timelineData" :options="chartOptions" />
          </div>
        </template>

        <!-- AI Quality tab -->
        <template v-else-if="activeChartTab === 'ai-quality'">
          <div v-if="aiTelemetry.loading.value" class="flex items-center justify-center h-80 text-muted">
            <p class="font-medium">Loading AI data...</p>
          </div>
          <div v-else-if="!aiTelemetry.acceptanceChartData.value" class="flex items-center justify-center h-80 text-muted text-sm">
            No AI activity yet — start generating tests to see quality metrics here.
          </div>
          <div v-else style="position: relative; height: 320px;">
            <Bar :data="aiTelemetry.acceptanceChartData.value" :options="acceptanceChartOptions" />
          </div>
        </template>

        <!-- AI Spend tab -->
        <template v-else-if="activeChartTab === 'ai-spend'">
          <div v-if="aiTelemetry.loading.value" class="flex items-center justify-center h-80 text-muted">
            <p class="font-medium">Loading AI data...</p>
          </div>
          <div v-else-if="!aiTelemetry.summary.value" class="flex items-center justify-center h-80 text-muted text-sm">
            No AI activity yet — start generating tests to see cost breakdown here.
          </div>
          <template v-else>
            <div class="grid grid-cols-3 gap-4 mb-6">
              <div class="rounded-lg p-4 bg-primary-soft border border-default">
                <p class="text-label text-label-color uppercase tracking-wider mb-1">Total Tokens</p>
                <p class="text-2xl font-bold text-heading">{{ (aiTelemetry.summary.value.totalTokens ?? 0).toLocaleString() }}</p>
              </div>
              <div class="rounded-lg p-4 bg-success-soft border border-default">
                <p class="text-label text-label-color uppercase tracking-wider mb-1">Estimated Cost</p>
                <p class="text-2xl font-bold text-heading">{{ aiTelemetry.summary.value.estimatedCostUsd ? '£' + Number(aiTelemetry.summary.value.estimatedCostUsd).toFixed(4) : '—' }}</p>
              </div>
              <div class="rounded-lg p-4 bg-info-soft border border-default">
                <p class="text-label text-label-color uppercase tracking-wider mb-1">Avg Latency</p>
                <p class="text-2xl font-bold text-heading">{{ aiTelemetry.summary.value.avgLatencyMs ? Math.round(aiTelemetry.summary.value.avgLatencyMs) + 'ms' : '—' }}</p>
              </div>
            </div>
            <div style="position: relative; height: 240px;">
              <Doughnut v-if="aiTelemetry.costChartData.value" :data="aiTelemetry.costChartData.value" :options="costDoughnutOptions" />
              <div v-else class="flex items-center justify-center h-full text-muted text-sm">No cost data yet</div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- CBA Card -->

    <div class="card">
      <div class="card-header flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <h2 class="card-title">Time & Effort Savings</h2>
          <span class="text-xs text-muted font-normal">Last 30 days</span>
          <HelpTooltip text="Estimates assume £55/hr QA rate (≈ £440/day). Counts accepted, edited, and pending AI outputs — only explicitly rejected interactions are excluded." />
        </div>
      </div>
      <div class="card-body">
        <div v-if="aiTelemetry.loading.value" class="flex items-center justify-center h-32 text-muted">
          <p class="font-medium">Loading...</p>
        </div>
        <div v-else-if="!aiTelemetry.cbaSavings.value.length" class="flex items-center justify-center h-32 text-muted text-sm">
          Complete your first AI generation to see ROI here.
        </div>
        <template v-else>
          <!-- CBA chart -->
          <div style="height: 200px;" class="mb-6">
            <Bar :data="aiTelemetry.cbaChartData.value" :options="cbaChartOptions" />
          </div>
          <!-- CBA table -->
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th class="text-left">Feature</th>
                  <th class="text-right">Used</th>
                  <th class="text-right">Est. Time Saved</th>
                  <th class="text-right">AI Cost</th>
                  <th class="text-right">Net Saving</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in aiTelemetry.cbaSavings.value" :key="row.key">
                  <td class="font-medium text-heading">{{ row.label }}</td>
                  <td class="text-right text-muted">{{ row.used }}</td>
                  <td class="text-right font-medium text-heading">{{ formatHours(row.hrs) }}</td>
                  <td class="text-right text-muted">{{ formatGBP(row.cost) }}</td>
                  <td class="text-right font-medium text-success">{{ formatGBP(row.net) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-default">
                  <td class="py-3 font-semibold text-heading">Totals</td>
                  <td class="py-3 text-right font-semibold text-heading">{{ cbaTotals.used }}</td>
                  <td class="py-3 text-right font-semibold text-heading">{{ formatHours(cbaTotals.hrs) }}</td>
                  <td class="py-3 text-right font-semibold text-muted">{{ formatGBP(cbaTotals.cost) }}</td>
                  <td class="py-3 text-right font-semibold text-success">{{ formatGBP(cbaTotals.net) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
