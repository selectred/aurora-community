<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/lib/api'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { useThemeStore } from '@/stores/themeStore'
import { Play, CheckCircle, Target, Globe, AlertTriangle } from 'lucide-vue-next'
import HelpTooltip from '@/components/HelpTooltip.vue'
import { useAiTelemetry } from '@/composables/useAiTelemetry'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend
)

const themeStore = useThemeStore()
const aiTelemetry = useAiTelemetry()

// ── Chart tabs ────────────────────────────────────────────────────────
const activeChartTab = ref('pass-rate')
const chartTabs = [
  { key: 'pass-rate', label: 'Pass Rate' },
  { key: 'trend',     label: 'Trend' },
  { key: 'ai-gen',    label: 'AI Generation' },
]

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

// ── State ────────────────────────────────────────────────────────────
const loading = ref(true)
const metrics = ref(null)
const apiSpecs = ref([])
const dailyTrend = ref([])

// ── Computed ─────────────────────────────────────────────────────────
const passRate = computed(() => {
  if (!metrics.value || metrics.value.total === 0) return '0.0%'
  return metrics.value.passRate + '%'
})

const specsReady = computed(() => apiSpecs.value.filter(s => s.status === 'ready').length)
const specsDraft = computed(() => apiSpecs.value.filter(s => s.status !== 'ready').length)
const totalSpecs = computed(() => apiSpecs.value.length)

const hasTrendData = computed(() => dailyTrend.value.some(d => d.total > 0))
const hasSpecData  = computed(() => apiSpecs.value.length > 0)

// Pass Rate chart
const coverageChartData = computed(() => ({
  labels: apiSpecs.value.map(s => s.name.length > 20 ? s.name.slice(0, 20) + '…' : s.name),
  datasets: [{
    label: 'Pass Rate %',
    data: apiSpecs.value.map(s => s.passRate ?? 0),
    backgroundColor: '#7367F0',
    borderRadius: 8
  }]
}))

const coverageChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      ...tooltipBase.value,
      callbacks: { label: ctx => 'Pass Rate: ' + ctx.parsed.y + '%' }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      grid:  { color: gridColor.value },
      ticks: { color: labelColor.value, font: { size: 11 } }
    },
    x: {
      grid:  { display: false },
      ticks: { color: labelColor.value, font: { size: 11 } }
    }
  }
}))

// Execution Trend chart
const testTrendChartData = computed(() => ({
  labels: dailyTrend.value.map(d => d.day),
  datasets: [
    { label: 'Passed', data: dailyTrend.value.map(d => d.passed), backgroundColor: '#28C76F', borderRadius: 8 },
    { label: 'Failed', data: dailyTrend.value.map(d => d.failed), backgroundColor: '#EA5455', borderRadius: 8 }
  ]
}))

const testTrendChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: labelColor.value, font: { family: 'Inter, system-ui, sans-serif' }, padding: 16 }
    },
    tooltip: { ...tooltipBase.value, mode: 'index', intersect: false }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid:  { color: gridColor.value },
      ticks: { color: labelColor.value, font: { size: 11 } }
    },
    x: {
      grid:  { display: false },
      ticks: { color: labelColor.value, font: { size: 11 } }
    }
  }
}))

// AI Generation chart options (grouped bar)
const aiGenChartOptions = computed(() => ({
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
      beginAtZero: true,
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { color: gridColor.value }
    },
    x: {
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { display: false }
    }
  }
}))

// ── Data loading ─────────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildDailyTrend(timelineData) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const label = DAY_LABELS[d.getDay()]
    const slots = timelineData[key] ? Object.values(timelineData[key]) : []
    const passed = slots.reduce((s, x) => s + x.passed, 0)
    const failed = slots.reduce((s, x) => s + x.failed, 0)
    const total  = slots.reduce((s, x) => s + x.total, 0)
    days.push({ day: label, passed, failed, total })
  }
  return days
}

async function loadData() {
  loading.value = true
  try {
    const [metricsRes, specsRes, timelineRes] = await Promise.all([
      api.get('/api/tests/metrics?timeRange=24h&testType=api'),
      api.get('/api/agent-tests/specs?testType=api'),
      api.get('/api/tests/timeline?hours=168&testType=api')
    ])

    metrics.value = metricsRes.data.metrics
    dailyTrend.value = buildDailyTrend(timelineRes.data.data || {})

    const specs = Array.isArray(specsRes.data) ? specsRes.data : []
    apiSpecs.value = specs.map(s => ({
      ...s,
      passRate: s.status === 'ready' ? 100 : s.status === 'failed' ? 0 : null
    }))
  } catch {
    // non-fatal
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadData(); aiTelemetry.load() })
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Endpoint testing and integration validation</p>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">API Tests Run<HelpTooltip text="Total API test executions in the last 24 hours." /></p>
            <p class="text-2xl font-bold text-heading">{{ loading ? '…' : (metrics?.total ?? 0).toLocaleString() }}</p>
            <p class="text-xs text-muted mt-2">Last 24 hours</p>
          </div>
          <div class="w-9 h-9 rounded-lg bg-success-soft flex items-center justify-center">
            <Play class="w-4 h-4 text-success" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Pass Rate<HelpTooltip text="Percentage of API tests that passed in the last 24 hours." /></p>
            <p class="text-2xl font-bold text-heading">{{ loading ? '…' : passRate }}</p>
            <p class="text-xs font-medium mt-2" :class="parseFloat(metrics?.passRate) >= 95 ? 'text-success' : 'text-muted'">
              {{ parseFloat(metrics?.passRate) >= 95 ? 'Excellent' : 'Last 24 hours' }}
            </p>
          </div>
          <div class="w-9 h-9 rounded-lg bg-success-soft flex items-center justify-center">
            <CheckCircle class="w-4 h-4 text-success" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">API Test Cases<HelpTooltip text="Total API test specs defined in your library." /></p>
            <p class="text-2xl font-bold text-heading">{{ loading ? '…' : totalSpecs }}</p>
            <p class="text-xs text-muted mt-2">Defined specs</p>
          </div>
          <div class="w-9 h-9 rounded-lg bg-info-soft flex items-center justify-center">
            <Target class="w-4 h-4 text-info" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Ready<HelpTooltip text="API test specs with generated code ready to run." /></p>
            <p class="text-2xl font-bold text-heading">{{ loading ? '…' : specsReady }}</p>
            <p class="text-xs text-muted mt-2">
              {{ totalSpecs > 0 ? Math.round((specsReady / totalSpecs) * 100) + '% of specs' : 'No specs yet' }}
            </p>
          </div>
          <div class="w-9 h-9 rounded-lg bg-primary-soft flex items-center justify-center">
            <Globe class="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Not Ready<HelpTooltip text="API test specs still in draft or failed state — generate code to make them runnable." /></p>
            <p class="text-2xl font-bold text-heading">{{ loading ? '…' : specsDraft }}</p>
            <p class="text-xs text-muted mt-2">Need code generation</p>
          </div>
          <div class="w-9 h-9 rounded-lg bg-warning-soft flex items-center justify-center">
            <AlertTriangle class="w-4 h-4 text-warning" />
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
      </div>
      <div class="p-6">
        <!-- Pass Rate tab -->
        <template v-if="activeChartTab === 'pass-rate'">
          <div v-if="!loading && !hasSpecData" class="flex items-center justify-center h-48 text-muted text-sm">
            No API test specs yet — create one in the Test Generator to get started.
          </div>
          <div v-else style="height: 300px;">
            <Bar :data="coverageChartData" :options="coverageChartOptions" />
          </div>
        </template>

        <!-- Trend tab -->
        <template v-else-if="activeChartTab === 'trend'">
          <div v-if="!loading && !hasTrendData" class="flex items-center justify-center h-48 text-muted text-sm">
            No API test runs in the last 7 days.
          </div>
          <div v-else style="height: 300px;">
            <Bar :data="testTrendChartData" :options="testTrendChartOptions" />
          </div>
        </template>

        <!-- AI Generation tab -->
        <template v-else-if="activeChartTab === 'ai-gen'">
          <div v-if="aiTelemetry.loading.value" class="flex items-center justify-center h-48 text-muted text-sm">
            Loading AI data...
          </div>
          <div v-else-if="!aiTelemetry.outcomeChartData('TestGen')" class="flex items-center justify-center h-48 text-muted text-sm">
            No AI test generation activity yet — generate an API test spec to see quality data here.
          </div>
          <template v-else>
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="rounded-lg p-4 bg-primary-soft border border-default">
                <p class="text-label text-label-color uppercase tracking-wider mb-1">Avg Generation Latency</p>
                <p class="text-2xl font-bold text-heading">
                  {{ aiTelemetry.byFeature.value.TestGen?.avgLatencyMs ? Math.round(aiTelemetry.byFeature.value.TestGen.avgLatencyMs) + 'ms' : '—' }}
                </p>
              </div>
              <div class="rounded-lg p-4 bg-info-soft border border-default">
                <p class="text-label text-label-color uppercase tracking-wider mb-1">Total Tokens Used</p>
                <p class="text-2xl font-bold text-heading">
                  {{ (aiTelemetry.byFeature.value.TestGen?.totalTokens ?? 0).toLocaleString() }}
                </p>
              </div>
            </div>
            <div style="height: 220px;">
              <Bar :data="aiTelemetry.outcomeChartData('TestGen')" :options="aiGenChartOptions" />
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- API Test Specs Table -->
    <div class="card !p-0 overflow-hidden">
      <div class="card-header !border-b-0 !mb-0 px-6 py-4 border-b border-default bg-info-soft">
        <h2 class="card-title">API Test Specs</h2>
      </div>
      <div v-if="!loading && !hasSpecData" class="px-6 py-8 text-center text-muted text-sm">
        No API test specs defined yet. Use the Test Generator with type "API" to create your first spec.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th class="text-left">Test Spec</th>
              <th class="text-left">Status</th>
              <th class="text-left">URL</th>
              <th class="text-left">Method</th>
              <th class="text-center">Expected</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(spec, i) in apiSpecs" :key="i">
              <td class="font-medium text-heading">{{ spec.name }}</td>
              <td>
                <span :class="[
                  'badge',
                  spec.status === 'ready' ? 'badge-success' :
                  spec.status === 'failed' ? 'badge-danger' :
                  'badge-warning'
                ]">
                  {{ spec.status === 'ready' ? '✓ Ready' : spec.status === 'failed' ? '✗ Failed' : spec.status }}
                </span>
              </td>
              <td class="text-muted text-sm max-w-xs truncate">{{ spec.url }}</td>
              <td>
                <span class="font-mono text-xs font-semibold text-info">{{ spec.method || 'GET' }}</span>
              </td>
              <td class="text-center">
                <span class="font-mono text-xs text-muted">{{ spec.expectedStatus || 200 }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
