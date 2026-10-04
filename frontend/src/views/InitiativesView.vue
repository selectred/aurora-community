<template>
  <div class="p-6 space-y-6" data-testid="page-initiatives-view">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <Loader2 :size="28" class="animate-spin text-primary" />
    </div>

    <template v-else>
      <!-- Summary cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="card text-center p-4">
          <div class="text-2xl font-bold text-heading">{{ summary.total }}</div>
          <div class="text-xs text-muted mt-1">Total</div>
        </div>
        <div class="card text-center p-4">
          <div class="text-2xl font-bold text-success">{{ summary.onTrack + summary.completed }}</div>
          <div class="text-xs text-muted mt-1">On Track / Done</div>
        </div>
        <div class="card text-center p-4">
          <div class="text-2xl font-bold text-warning">{{ summary.atRisk }}</div>
          <div class="text-xs text-muted mt-1">At Risk</div>
        </div>
        <div class="card text-center p-4">
          <div class="text-2xl font-bold text-primary">{{ summary.averageProgress }}%</div>
          <div class="text-xs text-muted mt-1">Avg Progress</div>
        </div>
      </div>

      <!-- Initiatives list -->
      <div v-if="initiatives.length === 0" class="card p-12 text-center text-muted">
        <Target :size="40" class="mx-auto mb-3 opacity-30" />
        <p class="font-medium">No initiatives yet</p>
        <p class="text-sm mt-1">Create strategic initiatives in <RouterLink to="/settings/initiatives" class="text-primary hover:underline">Initiative Settings</RouterLink>.</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="initiative in initiatives"
          :key="initiative.id"
          class="card hover:shadow-md transition-shadow"
        >
          <div class="card-body">
            <div class="flex items-start justify-between gap-4 mb-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-semibold text-heading">{{ initiative.name }}</h3>
                  <span class="badge" :class="statusBadge(initiative.status)">{{ formatStatus(initiative.status) }}</span>
                  <span v-if="initiative.priority === 'critical'" class="badge badge-danger">Critical</span>
                  <span v-else-if="initiative.priority === 'high'" class="badge badge-warning">High</span>
                </div>
                <p v-if="initiative.description" class="text-sm text-muted mt-1 line-clamp-2">{{ initiative.description }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <div class="text-xl font-bold text-heading">{{ initiative.progress }}%</div>
                <div class="text-xs text-muted">progress</div>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="w-full bg-surface-2 rounded-full h-2 mb-3">
              <div
                class="h-2 rounded-full transition-all"
                :class="progressColor(initiative.status)"
                :style="{ width: initiative.progress + '%' }"
              />
            </div>

            <!-- Metrics row -->
            <div class="flex items-center gap-6 flex-wrap text-sm">
              <div v-if="initiative.metrics?.testsAutomated" class="flex items-center gap-1.5">
                <TestTube2 :size="14" class="text-muted" />
                <span class="text-heading font-medium">{{ initiative.metrics.testsAutomated }}</span>
                <span class="text-muted">tests automated</span>
              </div>
              <div v-if="initiative.metrics?.coverageCurrent" class="flex items-center gap-1.5">
                <BarChart3 :size="14" class="text-muted" />
                <span class="text-heading font-medium">{{ initiative.metrics.coverageCurrent }}%</span>
                <span class="text-muted">coverage</span>
                <span v-if="initiative.metrics?.coverageTarget" class="text-muted">(target {{ initiative.metrics.coverageTarget }}%)</span>
              </div>
              <div v-if="initiative.targetQuarter" class="flex items-center gap-1.5 ml-auto">
                <CalendarClock :size="14" class="text-muted" />
                <span class="text-muted">{{ initiative.targetQuarter }}</span>
              </div>
              <div v-else-if="initiative.targetDate" class="flex items-center gap-1.5 ml-auto">
                <CalendarClock :size="14" class="text-muted" />
                <span class="text-muted">{{ formatDate(initiative.targetDate) }}</span>
              </div>
            </div>

            <!-- Feature -->
            <div v-if="initiative.team" class="flex items-center gap-1.5 mt-3 pt-3 border-t border-default text-xs text-muted">
              <Boxes :size="12" />
              {{ initiative.team.name }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Target, Loader2, TestTube2, BarChart3, CalendarClock, Boxes } from 'lucide-vue-next'
import api from '@/lib/api'

const loading = ref(true)
const initiatives = ref([])
const summary = ref({ total: 0, onTrack: 0, completed: 0, atRisk: 0, inProgress: 0, planning: 0, averageProgress: 0 })

onMounted(async () => {
  try {
    const response = await api.get('/api/initiatives/summary')
    if (response.data.success) {
      initiatives.value = response.data.initiatives
      summary.value = response.data.summary
    }
  } catch (e) {
    console.error('Failed to load initiatives:', e)
  } finally {
    loading.value = false
  }
})

function statusBadge(status) {
  const map = {
    'completed': 'badge-success',
    'on-track': 'badge-info',
    'in-progress': 'badge-primary',
    'at-risk': 'badge-warning',
    'planning': 'badge-secondary',
  }
  return map[status] || 'badge-secondary'
}

function formatStatus(status) {
  return { 'on-track': 'On Track', 'in-progress': 'In Progress', 'at-risk': 'At Risk', 'planning': 'Planning', 'completed': 'Completed' }[status] || status
}

function progressColor(status) {
  const map = { completed: 'bg-success', 'on-track': 'bg-info', 'at-risk': 'bg-warning', 'in-progress': 'bg-primary', planning: 'bg-muted' }
  return map[status] || 'bg-primary'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}
</script>
