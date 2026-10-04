<script setup>
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { Line, Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { useThemeStore } from '@/stores/themeStore'
import { Users, TrendingUp, AlertTriangle, Target } from 'lucide-vue-next'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const themeStore = useThemeStore()

// ── State ────────────────────────────────────────────────────────────
const loading = ref(true)
const metrics = ref(null)
const teams = ref([])
const qualityTrends = ref([])
const weeklyTrend = ref([])

// ── Computed ─────────────────────────────────────────────────────────
const teamMembers = computed(() =>
  teams.value.flatMap(t =>
    (t.members || []).map(m => ({
      name: m.name,
      team: t.name,
      tests: m.stats?.testsExecuted || m.stats?.testsCreated || 0,
      passRate: m.stats?.passRate || 0,
      coverage: m.stats?.coverage || 0
    }))
  )
)

const totalMembers = computed(() => teamMembers.value.length)
const passRate = computed(() => metrics.value ? `${metrics.value.passRate}%` : '--')
const flakyCount = computed(() => metrics.value?.flaky ?? '--')
const hasData = computed(() => weeklyTrend.value.some(w => w.total > 0))
const hasQualityData = computed(() => qualityTrends.value.length > 0)

// ── Chart data (computed so they react to loaded state) ───────────────
const performanceTrendChartData = computed(() => ({
  labels: weeklyTrend.value.map(w => w.label),
  datasets: [
    {
      label: 'Failed Tests',
      data: weeklyTrend.value.map(w => w.failed),
      borderColor: '#EA5455',
      backgroundColor: '#EA5455',
      tension: 0.4,
      borderWidth: 2
    },
    {
      label: 'Pass Rate %',
      data: weeklyTrend.value.map(w => w.passRate),
      borderColor: '#28C76F',
      backgroundColor: '#28C76F',
      tension: 0.4,
      borderWidth: 2
    },
    {
      label: 'Tests Run',
      data: weeklyTrend.value.map(w => w.total),
      borderColor: '#00CFE8',
      backgroundColor: '#00CFE8',
      tension: 0.4,
      borderWidth: 2
    }
  ]
}))

const qualityTrendsChartData = computed(() => ({
  labels: qualityTrends.value.map(m => m.month),
  datasets: [
    {
      label: 'Tests Passed',
      data: qualityTrends.value.map(m => m.passed),
      backgroundColor: '#28C76F',
      borderRadius: 6
    },
    {
      label: 'Tests Failed',
      data: qualityTrends.value.map(m => m.failed),
      backgroundColor: '#EA5455',
      borderRadius: 6
    },
    {
      label: 'Tests Skipped',
      data: qualityTrends.value.map(m => m.skipped),
      backgroundColor: '#FF9F43',
      borderRadius: 6
    }
  ]
}))

const performanceTrendChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        color: themeStore.isDark ? '#9ca3af' : '#4b5563',
        font: { family: 'Inter, system-ui, sans-serif' },
        padding: 16
      }
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: themeStore.isDark ? '#1F2937' : '#FFFFFF',
      titleColor: themeStore.isDark ? '#f3f4f6' : '#1f2937',
      bodyColor: themeStore.isDark ? '#d1d5db' : '#4b5563',
      borderColor: themeStore.isDark ? '#374151' : '#E5E7EB',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: themeStore.isDark ? '#374151' : '#E5E7EB' },
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } }
    },
    x: {
      grid: { display: false },
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } }
    }
  }
}))

const qualityTrendsChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        color: themeStore.isDark ? '#9ca3af' : '#4b5563',
        font: { family: 'Inter, system-ui, sans-serif' },
        padding: 16
      }
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: themeStore.isDark ? '#1F2937' : '#FFFFFF',
      titleColor: themeStore.isDark ? '#f3f4f6' : '#1f2937',
      bodyColor: themeStore.isDark ? '#d1d5db' : '#4b5563',
      borderColor: themeStore.isDark ? '#374151' : '#E5E7EB',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: themeStore.isDark ? '#374151' : '#E5E7EB' },
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } }
    },
    x: {
      grid: { display: false },
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } }
    }
  }
}))

// ── Data loading ─────────────────────────────────────────────────────
function groupTimelineByWeek(timelineData) {
  const weeks = [
    { label: 'Week 1', passed: 0, failed: 0, total: 0 },
    { label: 'Week 2', passed: 0, failed: 0, total: 0 },
    { label: 'Week 3', passed: 0, failed: 0, total: 0 },
    { label: 'Week 4', passed: 0, failed: 0, total: 0 }
  ]
  const now = Date.now()
  Object.entries(timelineData).forEach(([dateKey, hours]) => {
    const daysAgo = Math.floor((now - new Date(dateKey).getTime()) / 86400000)
    const idx = Math.min(3, Math.floor(daysAgo / 7))
    const week = weeks[3 - idx]
    Object.values(hours).forEach(slot => {
      week.passed += slot.passed
      week.failed += slot.failed
      week.total += slot.total
    })
  })
  return weeks.map(w => ({
    ...w,
    passRate: w.total > 0 ? Math.round((w.passed / w.total) * 100) : 0
  }))
}

async function loadData() {
  loading.value = true
  try {
    const [metricsRes, teamsRes, trendsRes, timelineRes] = await Promise.all([
      axios.get('/api/tests/metrics?timeRange=month'),
      axios.get('/api/teams'),
      axios.get('/api/tests/quality-trends'),
      axios.get('/api/tests/timeline?dateRange=28')
    ])
    metrics.value = metricsRes.data.metrics
    teams.value = teamsRes.data.teams || []
    qualityTrends.value = trendsRes.data.trends || []
    weeklyTrend.value = groupTimelineByWeek(timelineRes.data.data || {})
  } catch {
    // non-fatal — show empty state
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Monitor team performance and quality metrics</p>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <!-- Team Members Card -->
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Team Members</p>
            <p class="text-3xl font-bold text-heading">{{ loading ? '…' : totalMembers }}</p>
            <p class="text-body text-muted mt-3">Active contributors</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-info-soft flex items-center justify-center">
            <Users class="w-5 h-5 text-info" />
          </div>
        </div>
      </div>

      <!-- Pass Rate Card -->
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Pass Rate</p>
            <p class="text-3xl font-bold text-heading">{{ loading ? '…' : passRate }}</p>
            <p class="text-xs text-muted mt-3">Last 30 days</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-success-soft flex items-center justify-center">
            <TrendingUp class="w-5 h-5 text-success" />
          </div>
        </div>
      </div>

      <!-- Flaky Tests Card -->
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Flaky Tests</p>
            <p class="text-3xl font-bold text-heading">{{ loading ? '…' : flakyCount }}</p>
            <p class="text-xs text-muted mt-3">Last 30 days</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-warning-soft flex items-center justify-center">
            <AlertTriangle class="w-5 h-5 text-warning" />
          </div>
        </div>
      </div>

      <!-- Total Tests Card -->
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Tests Run</p>
            <p class="text-3xl font-bold text-heading">{{ loading ? '…' : (metrics?.total ?? 0).toLocaleString() }}</p>
            <p class="text-body text-muted mt-3">Last 30 days</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
            <Target class="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>
    </div>

    <!-- Performance Trend -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Team Performance Trend</h2>
      </div>
      <div class="card-body">
        <div v-if="!loading && !hasData" class="flex items-center justify-center h-48 text-muted text-sm">
          No test results yet — run your first test pack to see trends here.
        </div>
        <div v-else style="height: 300px;">
          <Line :data="performanceTrendChartData" :options="performanceTrendChartOptions" />
        </div>
      </div>
    </div>

    <!-- Quality Trends -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Quality Trends (Last 4 Months)</h2>
      </div>
      <div class="card-body">
        <div v-if="!loading && !hasQualityData" class="flex items-center justify-center h-48 text-muted text-sm">
          No test history yet — quality trends will appear once tests have been run.
        </div>
        <div v-else style="height: 300px;">
          <Bar :data="qualityTrendsChartData" :options="qualityTrendsChartOptions" />
        </div>
      </div>
    </div>

    <!-- Team Members Table -->
    <div class="card !p-0 overflow-hidden">
      <div class="card-header !border-b-0 !mb-0 px-6 py-4 border-b border-default">
        <h2 class="card-title">Team Member Performance</h2>
      </div>
      <div v-if="!loading && teamMembers.length === 0" class="px-6 py-8 text-center text-muted text-sm">
        No team members yet — add members in the Teams section to track their performance.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th class="text-left">Team Member</th>
              <th class="text-left">Team</th>
              <th class="text-center">Tests Run</th>
              <th class="text-center">Pass Rate</th>
              <th class="text-center">Coverage</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(member, i) in teamMembers" :key="i">
              <td class="font-medium text-heading">{{ member.name }}</td>
              <td class="text-muted text-sm">{{ member.team }}</td>
              <td class="text-center">
                <span class="badge badge-info">{{ member.tests }}</span>
              </td>
              <td class="text-center">
                <span class="font-semibold" :class="member.passRate >= 95 ? 'text-success' : member.passRate > 0 ? 'text-info' : 'text-muted'">
                  {{ member.passRate > 0 ? member.passRate + '%' : 'N/A' }}
                </span>
              </td>
              <td class="text-center">
                <div v-if="member.coverage > 0" class="flex items-center justify-center gap-2">
                  <div class="w-20 h-2 rounded-full overflow-hidden bg-border-default">
                    <div class="h-full bg-primary transition-all duration-300" :style="{ width: member.coverage + '%' }"></div>
                  </div>
                  <span class="font-medium text-heading text-sm">{{ member.coverage }}%</span>
                </div>
                <span v-else class="text-muted text-sm">N/A</span>
              </td>
              <td class="text-center">
                <span v-if="member.tests > 0" class="badge badge-success">Active</span>
                <span v-else class="badge badge-secondary">No runs</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
