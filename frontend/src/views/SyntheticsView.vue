<template>
  <div class="p-6 flex flex-col gap-8" data-testid="page-synthetics">

    <!-- Action bar -->
    <div class="flex items-center justify-between">
      <p class="text-sm text-muted">Last updated: {{ lastRefresh || '—' }}</p>
      <div class="flex gap-3">
        <button
          @click="refreshData"
          :disabled="loading"
          class="btn btn-secondary"
          aria-label="Refresh"
        >
          <RefreshCw :size="15" :class="{ 'animate-spin': loading }" />
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button
          @click="runAllTests"
          :disabled="running || loading"
          class="btn btn-primary"
          aria-label="Run All Tests"
        >
          <Play :size="15" />
          {{ running ? 'Running…' : 'Run All Tests' }}
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- overflow-hidden moved to inner overlay so tooltips can escape the card boundary -->
      <div class="relative rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
        <div class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div class="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
        </div>
        <div class="relative z-10 text-center">
          <div class="text-blue-100 text-xs font-semibold uppercase tracking-wider mb-3">
            Total Transactions
            <HelpTooltip text="The total number of times your synthetic monitors have run — each run is one transaction." position="bottom" />
          </div>
          <div class="text-4xl font-black">{{ summary.totalRuns }}</div>
        </div>
      </div>
      <div class="relative rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
        <div class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div class="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
        </div>
        <div class="relative z-10 text-center">
          <div class="text-emerald-100 text-xs font-semibold uppercase tracking-wider mb-3">
            Pass Rate
            <HelpTooltip text="The percentage of monitor runs that completed successfully. A healthy application should be close to 100%." position="bottom" />
          </div>
          <div class="text-4xl font-black">{{ summary.passRate }}%</div>
        </div>
      </div>
      <div class="relative rounded-2xl bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
        <div class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div class="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
        </div>
        <div class="relative z-10 text-center">
          <div class="text-purple-100 text-xs font-semibold uppercase tracking-wider mb-3">
            Avg Execution Time
            <HelpTooltip text="How long the average monitor run takes from start to finish. Sudden increases can indicate your application is slowing down." position="bottom" />
          </div>
          <div class="text-4xl font-black">{{ formatDuration(summary.avgDuration) }}</div>
        </div>
      </div>
      <div class="relative rounded-2xl bg-gradient-to-br from-red-400 via-red-500 to-rose-600 p-5 text-white shadow-lg hover:shadow-xl transition-shadow">
        <div class="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div class="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
        </div>
        <div class="relative z-10 text-center">
          <div class="text-red-100 text-xs font-semibold uppercase tracking-wider mb-3">
            Failed Tests
            <HelpTooltip text="The number of monitor runs that detected a problem. Click into a transaction below to see screenshots and error details." position="bottom" />
          </div>
          <div class="text-4xl font-black">{{ summary.failedRuns }}</div>
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
        <!-- Performance tab -->
        <template v-if="activeChartTab === 'performance'">
          <p class="text-sm text-muted mb-4">Duration, FCP, and TTI — Last 24 Hours</p>
          <div v-if="loading" class="text-center py-12 text-muted">Loading metrics…</div>
          <div v-else-if="recentResults.length === 0" class="text-center py-12 text-muted">No performance data available</div>
          <div v-else style="height: 320px;">
            <PerformanceMetricsChart :results="recentResults" />
          </div>
        </template>

        <!-- Reliability tab -->
        <template v-else-if="activeChartTab === 'reliability'">
          <p class="text-sm text-muted mb-4">Test execution success rate over the last 7 days</p>
          <div v-if="trendsData.length > 0" style="height: 320px;">
            <TrendsChart :data="trendsData" />
          </div>
          <div v-else class="text-center py-12 text-muted">No trend data available</div>
        </template>

        <!-- AI Heals tab -->
        <template v-else-if="activeChartTab === 'ai-heals'">
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="rounded-lg p-4 bg-primary-soft border border-default">
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Synthetic Specs</p>
              <p class="text-2xl font-bold text-heading">{{ syntheticSpecs.length }}</p>
            </div>
            <div class="rounded-lg p-4 bg-warning-soft border border-default">
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Total Heals</p>
              <p class="text-2xl font-bold text-heading">{{ totalSyntheticHeals }}</p>
              <p class="text-xs text-muted mt-1">Across all synthetic monitors</p>
            </div>
          </div>
          <div v-if="!healChartData" class="text-center py-8 text-muted text-sm">
            No locator heals recorded yet — heals are triggered when a synthetic monitor fails to find an element.
          </div>
          <div v-else style="height: 240px;">
            <Bar :data="healChartData" :options="healsChartOptions" />
          </div>
        </template>
      </div>
    </div>

    <!-- Latest Results -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Latest Test Results</h2>
        <p class="text-sm text-muted mt-1">Most recent execution for each synthetic transaction</p>
      </div>
      <div class="card-body">
        <div v-if="loading" class="text-center py-12 text-muted">Loading results…</div>
        <div v-else-if="latestResults.length === 0" class="text-center py-12 text-muted">No synthetic test results yet</div>
        <div v-else class="space-y-4">
          <TransactionCard
            v-for="result in latestResults"
            :key="result._id"
            :result="result"
            @click="viewDetails(result)"
          />
        </div>
      </div>
    </div>

  </div>

  <!-- Details Modal -->
  <TransactionDetails
    v-if="selectedResult"
    :result="selectedResult"
    @close="selectedResult = null"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Play } from 'lucide-vue-next'
import api from '@/lib/api'
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, Title, Tooltip, Legend } from 'chart.js'
import TransactionCard from '@/components/Synthetics/TransactionCard.vue'
import TrendsChart from '@/components/Synthetics/TrendsChart.vue'
import PerformanceMetricsChart from '@/components/Synthetics/PerformanceMetricsChart.vue'
import TransactionDetails from '@/components/Synthetics/TransactionDetails.vue'
import HelpTooltip from '@/components/HelpTooltip.vue'
import { useThemeStore } from '@/stores/themeStore'

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, Title, Tooltip, Legend)

const themeStore = useThemeStore()

// ── Chart tabs ────────────────────────────────────────────────────────
const activeChartTab = ref('performance')
const chartTabs = [
  { key: 'performance', label: 'Performance' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'ai-heals',   label: 'AI Heals' },
]

// ── Theme helpers ─────────────────────────────────────────────────────
const gridColor  = computed(() => themeStore.isDark ? '#374151' : '#E5E7EB')
const labelColor = computed(() => themeStore.isDark ? '#9ca3af' : '#6b7280')

const healsChartOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: themeStore.isDark ? '#1F2937' : '#FFFFFF',
      titleColor:      themeStore.isDark ? '#f3f4f6' : '#1f2937',
      bodyColor:       themeStore.isDark ? '#d1d5db' : '#4b5563',
      borderColor:     gridColor.value,
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      callbacks: { label: ctx => ' ' + ctx.parsed.x + ' heals' }
    }
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { color: labelColor.value, font: { size: 11 }, stepSize: 1 },
      grid:  { color: gridColor.value }
    },
    y: {
      ticks: { color: labelColor.value, font: { size: 11 } },
      grid:  { display: false }
    }
  }
}))

const loading = ref(false)
const running = ref(false)
const latestResults = ref([])
const recentResults = ref([])
const trendsData = ref([])
const syntheticSpecs = ref([])
const summary = ref({
  totalRuns: 0,
  passedRuns: 0,
  failedRuns: 0,
  avgDuration: 0,
  passRate: 0
})
const selectedResult = ref(null)
const lastRefresh = ref('')

// Heal stats derived from synthetic specs
const totalSyntheticHeals = computed(() =>
  syntheticSpecs.value.reduce((s, sp) => s + (sp.healCount ?? 0), 0)
)

const healChartData = computed(() => {
  const withHeals = [...syntheticSpecs.value]
    .filter(s => (s.healCount ?? 0) > 0)
    .sort((a, b) => (b.healCount ?? 0) - (a.healCount ?? 0))
    .slice(0, 5)
  if (!withHeals.length) return null
  return {
    labels: withHeals.map(s => s.name.length > 30 ? s.name.slice(0, 30) + '…' : s.name),
    datasets: [{
      label: 'Heal Count',
      data: withHeals.map(s => s.healCount ?? 0),
      backgroundColor: '#FF9F43',
      borderRadius: 6,
    }]
  }
})

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const fetchLatestResults = async () => {
  try {
    const response = await api.get('/api/synthetics/results/latest')
    latestResults.value = response.data
  } catch (error) {
    console.error('Failed to fetch latest results:', error)
  }
}

const fetchSummary = async () => {
  try {
    const response = await api.get('/api/synthetics/summary')
    summary.value = response.data
  } catch (error) {
    console.error('Failed to fetch summary:', error)
  }
}

const fetchTrends = async () => {
  try {
    const response = await api.get('/api/synthetics/trends')
    trendsData.value = response.data
  } catch (error) {
    console.error('Failed to fetch trends:', error)
  }
}

const fetchRecentResults = async () => {
  try {
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)
    const response = await api.get('/api/synthetics/results', {
      params: { startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: 100 }
    })
    recentResults.value = response.data.results || []
  } catch (error) {
    console.error('Failed to fetch recent results:', error)
  }
}

const fetchSyntheticSpecs = async () => {
  try {
    const res = await api.get('/api/agent-tests/specs?isSynthetic=true')
    syntheticSpecs.value = Array.isArray(res.data) ? res.data : []
  } catch {
    // non-fatal
  }
}

const refreshData = async () => {
  loading.value = true
  try {
    await Promise.all([fetchLatestResults(), fetchSummary(), fetchTrends(), fetchRecentResults(), fetchSyntheticSpecs()])
    lastRefresh.value = new Date().toLocaleTimeString()
  } finally {
    loading.value = false
  }
}

const runAllTests = async () => {
  running.value = true
  try {
    await api.post('/api/synthetics/run')
    await refreshData()
  } catch (error) {
    console.error('Failed to run all tests:', error)
    alert('Failed to run tests: ' + (error.response?.data?.message || error.message))
  } finally {
    running.value = false
  }
}

const viewDetails = (result) => {
  selectedResult.value = result
}

onMounted(async () => {
  await refreshData()
})
</script>
