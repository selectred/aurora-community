<script setup>
import { ref, onMounted, computed } from 'vue'
import { Line, Pie } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/themeStore'
import { BarChart3, TrendingUp, TrendingDown, Target, Flag, X } from 'lucide-vue-next'
import api from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

const themeStore = useThemeStore()
const loading = ref(true)
const teamMetrics = ref([])
const initiatives = ref([])
const initiativesSummary = ref({})
const selectedInitiative = ref(null)

// Fetch team metrics from API
const fetchTeamMetrics = async () => {
  try {
    const response = await api.get('/api/teams/metrics')
    if (response.data.success) {
      teamMetrics.value = response.data.teams
    }
  } catch (error) {
    console.error('Failed to fetch team metrics:', error)
  }
}

// Fetch strategic initiatives from API
const fetchInitiatives = async () => {
  try {
    const response = await api.get('/api/initiatives/summary')
    if (response.data.success) {
      initiatives.value = response.data.initiatives
      initiativesSummary.value = response.data.summary
    }
  } catch (error) {
    console.error('Failed to fetch initiatives:', error)
  }
}

onMounted(async () => {
  await Promise.all([fetchTeamMetrics(), fetchInitiatives()])
  loading.value = false
})

// Computed totals from team metrics
const totalTests = computed(() => teamMetrics.value.reduce((sum, t) => sum + (t.total || 0), 0))
const totalPassed = computed(() => teamMetrics.value.reduce((sum, t) => sum + (t.passed || 0), 0))
const totalFailed = computed(() => teamMetrics.value.reduce((sum, t) => sum + (t.failed || 0), 0))
const overallPassRate = computed(() => totalTests.value > 0 ? ((totalPassed.value / totalTests.value) * 100).toFixed(1) : 0)
const overallFailRate = computed(() => totalTests.value > 0 ? ((totalFailed.value / totalTests.value) * 100).toFixed(1) : 0)
const averageCoverage = computed(() => {
  if (teamMetrics.value.length === 0) return 0
  return Math.round(teamMetrics.value.reduce((sum, t) => sum + (t.coverage || 0), 0) / teamMetrics.value.length)
})

// Chart data
const teamPerformanceData = {
  labels: ['Q1 2024', 'Q2 2024', 'Q3 2024', 'Q4 2024'],
  datasets: [
    {
      label: 'Test Count',
      data: [4520, 5230, 6140, 7560],
      borderColor: '#00CFE8',
      backgroundColor: 'rgba(0, 207, 232, 0.1)',
      tension: 0.3,
      yAxisID: 'y'
    },
    {
      label: 'Failure Rate %',
      data: [3.2, 2.5, 1.8, 1.2],
      borderColor: '#EA5455',
      backgroundColor: 'rgba(234, 84, 85, 0.1)',
      tension: 0.3,
      yAxisID: 'y1'
    },
    {
      label: 'Pass Rate %',
      data: [92, 94, 96, 97],
      borderColor: '#28C76F',
      backgroundColor: 'rgba(40, 199, 111, 0.1)',
      tension: 0.3,
      yAxisID: 'y2'
    }
  ]
}

const testStatusData = computed(() => ({
  labels: ['Passed', 'Failed', 'Skipped'],
  datasets: [{
    data: [totalPassed.value, totalFailed.value, Math.round(totalTests.value * 0.01)],
    backgroundColor: ['#28C76F', '#EA5455', '#FF9F43'],
    borderWidth: 0
  }]
}))

const lineChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false
  },
  plugins: {
    legend: {
      display: true,
      position: 'top',
      labels: {
        boxWidth: 12,
        padding: 15,
        font: { size: 12, family: 'Inter, system-ui, sans-serif' },
        color: themeStore.isDark ? '#9ca3af' : '#4b5563'
      }
    },
    tooltip: {
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
      type: 'linear',
      display: true,
      position: 'left',
      beginAtZero: true,
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } },
      grid: { color: themeStore.isDark ? '#374151' : '#E5E7EB', drawBorder: false }
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      beginAtZero: true,
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } },
      grid: { display: false }
    },
    y2: {
      type: 'linear',
      display: false,
      beginAtZero: true
    },
    x: {
      ticks: { color: themeStore.isDark ? '#9ca3af' : '#6b7280', font: { size: 11 } },
      grid: { display: false, drawBorder: false }
    }
  }
}))

const pieChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        padding: 15,
        font: { size: 12, family: 'Inter, system-ui, sans-serif' },
        color: themeStore.isDark ? '#9ca3af' : '#4b5563'
      }
    },
    tooltip: {
      backgroundColor: themeStore.isDark ? '#1F2937' : '#FFFFFF',
      titleColor: themeStore.isDark ? '#f3f4f6' : '#1f2937',
      bodyColor: themeStore.isDark ? '#d1d5db' : '#4b5563',
      borderColor: themeStore.isDark ? '#374151' : '#E5E7EB',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12
    }
  }
}))

const formatNumber = (num) => {
  return num?.toLocaleString() || '0'
}

const getStatusBadge = (status) => {
  const badges = {
    'completed': { class: 'badge-success', label: 'Completed' },
    'on-track': { class: 'badge-success', label: 'On Track' },
    'in-progress': { class: 'badge-info', label: 'In Progress' },
    'at-risk': { class: 'badge-danger', label: 'At Risk' },
    'planning': { class: 'badge-warning', label: 'Planning' }
  }
  return badges[status] || badges['planning']
}

const getPriorityBadge = (priority) => {
  const badges = {
    'critical': 'badge-danger',
    'high': 'badge-warning',
    'medium': 'badge-info',
    'low': 'badge-primary'
  }
  return badges[priority] || badges['medium']
}

const showInitiativeDetails = (initiative) => {
  selectedInitiative.value = initiative
}

const closeModal = () => {
  selectedInitiative.value = null
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Team-level testing metrics and strategic oversight</p>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
    </div>

    <template v-else>
      <!-- Key KPIs -->
      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <!-- Total Test Cases -->
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Total Test Cases</p>
              <p class="text-2xl font-bold text-heading">{{ formatNumber(totalTests) }}</p>
              <p class="text-xs text-muted mt-2">Across all teams</p>
            </div>
            <div class="w-9 h-9 rounded-lg bg-info-soft flex items-center justify-center">
              <BarChart3 class="w-4 h-4 text-info" />
            </div>
          </div>
        </div>

        <!-- Pass Rate -->
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Pass Rate</p>
              <p class="text-2xl font-bold text-heading">{{ overallPassRate }}%</p>
              <p class="text-xs text-success font-medium mt-2">{{ formatNumber(totalPassed) }} passed</p>
            </div>
            <div class="w-9 h-9 rounded-lg bg-success-soft flex items-center justify-center">
              <TrendingUp class="w-4 h-4 text-success" />
            </div>
          </div>
        </div>

        <!-- Failure Rate -->
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Failure Rate</p>
              <p class="text-2xl font-bold text-heading">{{ overallFailRate }}%</p>
              <p class="text-xs text-danger font-medium mt-2">{{ formatNumber(totalFailed) }} failed</p>
            </div>
            <div class="w-9 h-9 rounded-lg bg-danger-soft flex items-center justify-center">
              <TrendingDown class="w-4 h-4 text-danger" />
            </div>
          </div>
        </div>

        <!-- Avg Coverage -->
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Avg Coverage</p>
              <p class="text-2xl font-bold text-heading">{{ averageCoverage }}%</p>
              <p class="text-xs text-muted mt-2">Across teams</p>
            </div>
            <div class="w-9 h-9 rounded-lg bg-primary-soft flex items-center justify-center">
              <Target class="w-4 h-4 text-primary" />
            </div>
          </div>
        </div>

        <!-- Initiatives -->
        <div class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-label text-label-color uppercase tracking-wider mb-1">Initiatives</p>
              <p class="text-2xl font-bold text-heading">{{ initiativesSummary.total || 0 }}</p>
              <p class="text-xs text-success font-medium mt-2">{{ initiativesSummary.onTrack || 0 }} on track</p>
            </div>
            <div class="w-9 h-9 rounded-lg bg-warning-soft flex items-center justify-center">
              <Flag class="w-4 h-4 text-warning" />
            </div>
          </div>
        </div>
      </div>

      <!-- Team Performance Trend -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Team Performance Trend (YTD)</h2>
        </div>
        <div class="card-body">
          <div style="position: relative; height: 300px;">
            <Line :data="teamPerformanceData" :options="lineChartOptions" />
          </div>
        </div>
      </div>

      <!-- Two Column Section -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Team Metrics -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Team Metrics</h2>
          </div>
          <div class="card-body space-y-4">
            <div v-if="teamMetrics.length === 0" class="text-center py-8 text-muted">
              No team data available
            </div>
            <div v-for="(team, i) in teamMetrics" :key="i" class="p-4 rounded-lg border border-default bg-surface">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="font-semibold text-heading">{{ team.name }}</p>
                  <p class="text-xs text-muted">{{ team.memberCount || 0 }} member(s)</p>
                </div>
                <span class="text-2xl font-bold text-primary">{{ team.coverage || 0 }}%</span>
              </div>
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <p class="text-label text-label-color uppercase">Passed</p>
                  <p class="text-lg font-bold text-success">{{ formatNumber(team.passed) }}</p>
                </div>
                <div>
                  <p class="text-label text-label-color uppercase">Failed</p>
                  <p class="text-lg font-bold text-danger">{{ formatNumber(team.failed) }}</p>
                </div>
                <div>
                  <p class="text-label text-label-color uppercase">Total</p>
                  <p class="text-lg font-bold text-heading">{{ formatNumber(team.total) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Test Status Distribution -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Test Status Distribution</h2>
          </div>
          <div class="card-body">
            <div style="position: relative; height: 280px;">
              <Pie :data="testStatusData" :options="pieChartOptions" />
            </div>
          </div>
        </div>
      </div>

      <!-- Strategic Initiatives -->
      <div class="card !p-0 overflow-hidden">
        <div class="card-header !border-b-0 !mb-0 px-6 py-4 border-b border-default flex-wrap gap-4">
          <div>
            <h2 class="card-title">Strategic Initiatives Progress</h2>
            <p class="text-body text-muted mt-1">{{ initiativesSummary.averageProgress || 0 }}% average progress across {{ initiativesSummary.total || 0 }} initiatives</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <span class="badge badge-success">{{ initiativesSummary.onTrack || 0 }} On Track</span>
            <span class="badge badge-info">{{ initiativesSummary.inProgress || 0 }} In Progress</span>
            <span class="badge badge-warning">{{ initiativesSummary.planning || 0 }} Planning</span>
          </div>
        </div>
        <div class="divide-y divide-border-default">
          <div v-if="initiatives.length === 0" class="p-8 text-center text-muted">
            No initiatives found
          </div>
          <div
            v-for="(init, i) in initiatives"
            :key="i"
            class="p-6 transition-colors cursor-pointer hover:bg-surface"
            @click="showInitiativeDetails(init)"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <p class="font-semibold text-heading">{{ init.name }}</p>
                  <span :class="['badge', getPriorityBadge(init.priority)]">
                    {{ init.priority }}
                  </span>
                </div>
                <p class="text-body text-muted mt-1">{{ init.description }}</p>
                <div class="flex items-center gap-4 mt-2 text-xs text-muted">
                  <span>Target: {{ init.targetQuarter }}</span>
                  <span v-if="init.team">Team: {{ init.team.name }}</span>
                  <span v-if="init.assignee">Assignee: {{ init.assignee.name }}</span>
                </div>
              </div>
              <span :class="['badge', getStatusBadge(init.status).class]">
                {{ getStatusBadge(init.status).label }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex-1 h-2 rounded-full overflow-hidden bg-border-default">
                <div :class="[
                  'h-full transition-all duration-300',
                  init.progress >= 80 ? 'bg-success' :
                  init.progress >= 50 ? 'bg-info' :
                  'bg-warning'
                ]" :style="{ width: init.progress + '%' }"></div>
              </div>
              <span class="text-lg font-bold text-heading min-w-12 text-right">{{ init.progress }}%</span>
            </div>
            <!-- Milestones preview -->
            <div v-if="init.milestones && init.milestones.length > 0" class="mt-4 flex gap-2 flex-wrap">
              <span
                v-for="(milestone, mi) in init.milestones.slice(0, 4)"
                :key="mi"
                :class="[
                  'badge',
                  milestone.status === 'completed' ? 'badge-success' :
                  milestone.status === 'in-progress' ? 'badge-info' :
                  'badge-primary'
                ]"
              >
                {{ milestone.status === 'completed' ? '✓' : milestone.status === 'in-progress' ? '→' : '○' }}
                {{ milestone.name }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Executive Summary -->
      <div class="card bg-primary !border-primary">
        <h3 class="text-section-title text-white mb-6">Executive Summary</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Test Health</p>
            <p class="text-2xl font-bold text-white">{{ overallPassRate >= 95 ? 'Excellent' : overallPassRate >= 85 ? 'Good' : 'Needs Attention' }}</p>
            <p class="text-sm text-white/70 mt-2">{{ overallPassRate }}% pass rate achieved across all teams</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Coverage Status</p>
            <p class="text-2xl font-bold text-white">{{ averageCoverage >= 90 ? 'Strong' : averageCoverage >= 75 ? 'Moderate' : 'Low' }}</p>
            <p class="text-sm text-white/70 mt-2">{{ averageCoverage }}% average coverage across teams</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Initiative Progress</p>
            <p class="text-2xl font-bold text-white">{{ initiativesSummary.averageProgress || 0 }}%</p>
            <p class="text-sm text-white/70 mt-2">{{ initiativesSummary.onTrack || 0 }} of {{ initiativesSummary.total || 0 }} initiatives on track</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Initiative Details Modal -->
    <Teleport to="body">
      <div v-if="selectedInitiative" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="closeModal">
        <div class="card max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto !p-0">
          <div class="bg-primary px-6 py-4 rounded-t-lg">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-xl font-bold text-white">{{ selectedInitiative.name }}</h3>
                  <span :class="['badge', getPriorityBadge(selectedInitiative.priority)]">
                    {{ selectedInitiative.priority }}
                  </span>
                </div>
                <p class="text-white/80 mt-1">{{ selectedInitiative.description }}</p>
              </div>
              <button @click="closeModal" class="text-white/80 hover:text-white p-1 transition-colors">
                <X :size="24" />
              </button>
            </div>
          </div>

          <div class="p-6 space-y-6">
            <!-- Progress -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium text-body-color">Overall Progress</span>
                <span :class="['badge', getStatusBadge(selectedInitiative.status).class]">
                  {{ getStatusBadge(selectedInitiative.status).label }}
                </span>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex-1 h-3 rounded-full overflow-hidden bg-border-default">
                  <div :class="[
                    'h-full transition-all duration-300',
                    selectedInitiative.progress >= 80 ? 'bg-success' :
                    selectedInitiative.progress >= 50 ? 'bg-info' :
                    'bg-warning'
                  ]" :style="{ width: selectedInitiative.progress + '%' }"></div>
                </div>
                <span class="text-2xl font-bold text-heading">{{ selectedInitiative.progress }}%</span>
              </div>
            </div>

            <!-- Details Grid -->
            <div class="grid grid-cols-2 gap-4">
              <div class="rounded-lg p-4 bg-surface border border-default">
                <p class="text-label text-label-color uppercase">Target Quarter</p>
                <p class="text-lg font-semibold text-heading">{{ selectedInitiative.targetQuarter }}</p>
              </div>
              <div class="rounded-lg p-4 bg-surface border border-default">
                <p class="text-label text-label-color uppercase">Team</p>
                <p class="text-lg font-semibold text-heading">{{ selectedInitiative.team?.name || 'Unassigned' }}</p>
              </div>
              <div class="rounded-lg p-4 bg-surface border border-default">
                <p class="text-label text-label-color uppercase">Assignee</p>
                <p class="text-lg font-semibold text-heading">{{ selectedInitiative.assignee?.name || 'Unassigned' }}</p>
              </div>
              <div class="rounded-lg p-4 bg-surface border border-default">
                <p class="text-label text-label-color uppercase">Tags</p>
                <div class="flex gap-1 flex-wrap mt-1">
                  <span v-for="tag in selectedInitiative.tags" :key="tag" class="badge badge-primary">{{ tag }}</span>
                </div>
              </div>
            </div>

            <!-- Metrics -->
            <div v-if="selectedInitiative.metrics">
              <h4 class="font-semibold text-heading mb-3">Metrics</h4>
              <div class="grid grid-cols-5 gap-3">
                <div class="bg-info-soft rounded-lg p-3 text-center">
                  <p class="text-xl font-bold text-info">{{ selectedInitiative.metrics.testsAutomated }}</p>
                  <p class="text-xs text-info">Automated</p>
                </div>
                <div class="bg-success-soft rounded-lg p-3 text-center">
                  <p class="text-xl font-bold text-success">{{ selectedInitiative.metrics.coverageCurrent }}%</p>
                  <p class="text-xs text-success">Current</p>
                </div>
                <div class="bg-primary-soft rounded-lg p-3 text-center">
                  <p class="text-xl font-bold text-primary">{{ selectedInitiative.metrics.coverageTarget }}%</p>
                  <p class="text-xs text-primary">Target</p>
                </div>
                <div class="bg-primary-soft rounded-lg p-3 text-center">
                  <p class="text-xl font-bold text-primary">{{ selectedInitiative.metrics.testsCreated }}</p>
                  <p class="text-xs text-primary">Created</p>
                </div>
                <div class="bg-warning-soft rounded-lg p-3 text-center">
                  <p class="text-xl font-bold text-warning">{{ selectedInitiative.metrics.testsRemaining }}</p>
                  <p class="text-xs text-warning">Remaining</p>
                </div>
              </div>
            </div>

            <!-- Milestones -->
            <div v-if="selectedInitiative.milestones && selectedInitiative.milestones.length > 0">
              <h4 class="font-semibold text-heading mb-3">Milestones</h4>
              <div class="space-y-2">
                <div
                  v-for="(milestone, mi) in selectedInitiative.milestones"
                  :key="mi"
                  :class="[
                    'p-4 rounded-lg border',
                    milestone.status === 'completed' ? 'bg-success-soft border-success/30' :
                    milestone.status === 'in-progress' ? 'bg-info-soft border-info/30' :
                    milestone.status === 'delayed' ? 'bg-danger-soft border-danger/30' :
                    'bg-surface border-default'
                  ]"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span :class="[
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white',
                        milestone.status === 'completed' ? 'bg-success' :
                        milestone.status === 'in-progress' ? 'bg-info' :
                        milestone.status === 'delayed' ? 'bg-danger' :
                        'bg-muted'
                      ]">
                        {{ milestone.status === 'completed' ? '✓' : milestone.status === 'in-progress' ? '→' : mi + 1 }}
                      </span>
                      <span class="font-medium text-heading">{{ milestone.name }}</span>
                    </div>
                    <span class="text-sm text-muted">
                      {{ milestone.completedDate ? 'Completed' : 'Target' }}:
                      {{ new Date(milestone.completedDate || milestone.targetDate).toLocaleDateString() }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
