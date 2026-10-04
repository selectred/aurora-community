<template>
  <div class="space-y-6" data-testid="page-initiatives">
    <div>
      <p class="text-body text-body-color">Manage strategic initiatives and the features within them. Features hold test packs — the hierarchy flows Initiative → Feature → Test Pack.</p>
    </div>

    <!-- Initiatives List -->
    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h2 class="card-title flex items-center gap-2">
            <Target :size="20" class="text-primary" />
            Initiatives
          </h2>
          <button @click="openCreateModal" class="btn btn-primary flex items-center gap-2">
            <Plus :size="16" />
            New Initiative
          </button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="loading" class="text-center py-8 text-muted">Loading initiatives...</div>
        <div v-else-if="initiatives.length === 0" class="text-center py-8 text-muted">
          No initiatives found. Create your first strategic initiative.
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="initiative in initiatives"
            :key="initiative.id"
            class="rounded-lg border border-default overflow-hidden"
          >
            <!-- Initiative header -->
            <div class="p-5">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-bold text-heading">{{ initiative.name }}</h3>
                    <span :class="['badge', getPriorityBadgeClass(initiative.priority)]">{{ initiative.priority }}</span>
                    <span :class="['badge', getStatusBadgeClass(initiative.status)]">{{ formatStatus(initiative.status) }}</span>
                  </div>
                  <p class="text-sm text-muted mb-3">{{ initiative.description }}</p>
                  <div class="flex flex-wrap gap-4 text-xs text-muted">
                    <span v-if="initiative.targetDate">
                      <strong>Target:</strong> {{ formatDate(initiative.targetDate) }}
                    </span>
                    <span v-if="initiative.targetQuarter">
                      <strong>Quarter:</strong> {{ initiative.targetQuarter }}
                    </span>
                    <span>
                      <strong>Features:</strong> {{ featuresFor(initiative.id).length }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2 ml-4">
                  <div class="text-right mr-4">
                    <p class="text-2xl font-black text-primary">{{ initiative.progress }}%</p>
                    <p class="text-xs text-muted">Progress</p>
                  </div>
                  <button @click="generateInitiativeReport(initiative)" :disabled="generatingReportId === initiative.id" class="btn btn-sm btn-secondary flex items-center gap-1" title="Download a PDF test health report spanning every feature/pack in this initiative">
                    <Loader2 v-if="generatingReportId === initiative.id" :size="14" class="animate-spin" />
                    <FileDown v-else :size="14" />
                    {{ generatingReportId === initiative.id ? 'Generating…' : 'Generate Report' }}
                  </button>
                  <button @click="openEditModal(initiative)" class="btn btn-sm btn-secondary">Edit</button>
                  <button @click="confirmDelete(initiative)" class="btn btn-sm btn-danger">Delete</button>
                  <button
                    @click="toggleFeatures(initiative.id)"
                    class="btn btn-sm btn-secondary flex items-center gap-1"
                  >
                    <Layers :size="14" />
                    Features
                    <ChevronDown :size="14" :class="expandedInitiatives.has(initiative.id) ? 'rotate-180' : ''" class="transition-transform" />
                  </button>
                </div>
              </div>
              <!-- Progress bar -->
              <div class="mt-4">
                <div class="h-2 rounded-full overflow-hidden bg-border-default">
                  <div
                    :class="['h-full transition-all', initiative.progress >= 80 ? 'bg-success' : initiative.progress >= 50 ? 'bg-info' : 'bg-warning']"
                    :style="{ width: initiative.progress + '%' }"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Features sub-panel -->
            <div v-if="expandedInitiatives.has(initiative.id)" class="border-t border-default bg-surface">
              <div class="p-4">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-sm font-medium text-heading flex items-center gap-2">
                    <Layers :size="15" class="text-primary" />
                    Features
                  </p>
                  <button @click="openAddFeature(initiative.id)" class="btn btn-sm btn-primary flex items-center gap-1">
                    <Plus :size="13" />
                    Add Feature
                  </button>
                </div>

                <div v-if="featuresFor(initiative.id).length === 0" class="text-sm text-muted py-3 text-center">
                  No features yet — add a feature to start assigning test packs.
                </div>

                <div v-else class="space-y-2">
                  <div
                    v-for="feature in featuresFor(initiative.id)"
                    :key="feature.id"
                    class="flex items-center justify-between p-3 rounded-lg bg-card border border-default"
                  >
                    <div class="flex items-center gap-3">
                      <div class="w-2 h-2 rounded-full bg-primary flex-shrink-0"></div>
                      <div>
                        <p class="text-sm font-medium text-heading">{{ feature.name }}</p>
                        <p v-if="feature.description" class="text-xs text-muted">{{ feature.description }}</p>
                        <p v-if="feature.team" class="text-xs text-muted">
                          <span class="w-2 h-2 rounded-full inline-block mr-1" :style="{ background: feature.team.color || '#7367F0' }"></span>
                          {{ feature.team.name }}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="generateFeatureReport(feature)" :disabled="generatingReportId === feature.id" class="btn btn-xs btn-secondary flex items-center gap-1" title="Download a PDF test health report for this feature">
                        <Loader2 v-if="generatingReportId === feature.id" :size="12" class="animate-spin" />
                        <FileDown v-else :size="12" />
                        {{ generatingReportId === feature.id ? 'Generating…' : 'Report' }}
                      </button>
                      <button @click="openEditFeature(feature)" class="btn btn-xs btn-secondary">Edit</button>
                      <button @click="confirmDeleteFeature(feature)" class="btn btn-xs btn-danger">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Initiative Modal -->
    <Teleport to="body">
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content max-w-4xl max-h-[90vh] overflow-y-auto">
        <div class="modal-header bg-primary-soft">
          <div class="flex items-center justify-between w-full">
            <h3 class="modal-title">{{ editingInitiative ? 'Edit Initiative' : 'Create New Initiative' }}</h3>
            <button @click="closeModal" class="text-muted hover:text-heading text-2xl">&times;</button>
          </div>
        </div>

        <form @submit.prevent="saveInitiative" class="modal-body space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="form-label">Initiative Name *</label>
              <input v-model="form.name" type="text" required class="form-input" placeholder="e.g., Platform Launch Q2" />
            </div>
            <div class="col-span-2">
              <label class="form-label">Description</label>
              <textarea v-model="form.description" rows="3" class="form-input" placeholder="Describe the initiative goals and scope..."></textarea>
            </div>
          </div>

          <div class="grid grid-cols-4 gap-4">
            <div>
              <label class="form-label">Start Date</label>
              <input v-model="form.startDate" type="date" class="form-input" />
            </div>
            <div>
              <label class="form-label">Target Date *</label>
              <input v-model="form.targetDate" type="date" required class="form-input" />
            </div>
            <div>
              <label class="form-label">Target Quarter</label>
              <select v-model="form.targetQuarter" class="form-select">
                <option value="">Select Quarter</option>
                <option value="Q1 2025">Q1 2025</option>
                <option value="Q2 2025">Q2 2025</option>
                <option value="Q3 2025">Q3 2025</option>
                <option value="Q4 2025">Q4 2025</option>
                <option value="Q1 2026">Q1 2026</option>
                <option value="Q2 2026">Q2 2026</option>
                <option value="Q3 2026">Q3 2026</option>
                <option value="Q4 2026">Q4 2026</option>
              </select>
            </div>
            <div>
              <label class="form-label">Progress (%)</label>
              <input v-model.number="form.progress" type="number" min="0" max="100" class="form-input" />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="form-label">Priority *</label>
              <select v-model="form.priority" required class="form-select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label class="form-label">Status *</label>
              <select v-model="form.status" required class="form-select">
                <option value="planning">Planning</option>
                <option value="in-progress">In Progress</option>
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label class="form-label">Tags (comma-separated)</label>
              <input v-model="form.tagsInput" type="text" class="form-input" placeholder="e.g., automation, api" />
            </div>
          </div>

          <!-- Milestones -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-bold text-heading">Milestones</h4>
              <button type="button" @click="addMilestone" class="btn btn-sm btn-secondary">+ Add Milestone</button>
            </div>
            <div v-if="form.milestones.length === 0" class="text-sm text-center py-4 rounded-lg bg-surface text-muted">
              No milestones added yet
            </div>
            <div v-else class="space-y-3">
              <div v-for="(milestone, index) in form.milestones" :key="index" class="flex items-center gap-3 p-3 rounded-lg bg-surface">
                <input v-model="milestone.name" type="text" placeholder="Milestone name" class="form-input flex-1 text-sm" />
                <input v-model="milestone.targetDate" type="date" class="form-input text-sm" />
                <select v-model="milestone.status" class="form-select text-sm">
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
                <button type="button" @click="removeMilestone(index)" class="p-2 text-danger hover:bg-danger-soft rounded-lg">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>
          </div>
        </form>

        <div class="modal-footer">
          <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
          <button @click="saveInitiative" :disabled="saving" class="btn btn-primary">
            {{ saving ? 'Saving...' : (editingInitiative ? 'Update Initiative' : 'Create Initiative') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Add/Edit Feature Modal -->
    <Teleport to="body">
    <div v-if="showFeatureModal" class="modal-overlay" @click.self="closeFeatureModal">
      <div class="modal-content max-w-lg">
        <div class="modal-header">
          <h3 class="modal-title flex items-center gap-2">
            <Layers :size="18" />
            {{ editingFeature ? 'Edit Feature' : 'Add Feature' }}
          </h3>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Feature Name *</label>
            <input v-model="featureForm.name" type="text" required class="form-input" placeholder="e.g., User Authentication" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <input v-model="featureForm.description" type="text" class="form-input" placeholder="Optional description" />
          </div>
          <div>
            <label class="form-label">Owning Team</label>
            <select v-model="featureForm.teamId" class="form-select">
              <option value="">No team assigned</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeFeatureModal" class="btn btn-secondary">Cancel</button>
          <button @click="saveFeature" :disabled="savingFeature" class="btn btn-primary">
            {{ savingFeature ? 'Saving...' : (editingFeature ? 'Update Feature' : 'Add Feature') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Delete Initiative Modal -->
    <Teleport to="body">
    <div v-if="showDeleteModal" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="modal-title">Delete Initiative</h3>
        </div>
        <div class="modal-body">
          <p class="text-body-color">Are you sure you want to delete "<strong class="text-heading">{{ deletingInitiative?.name }}</strong>"? All features within it will also be deleted.</p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="deleteInitiative" :disabled="deleting" class="btn btn-danger">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Delete Feature Modal -->
    <Teleport to="body">
    <div v-if="showDeleteFeatureModal" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="modal-title">Delete Feature</h3>
        </div>
        <div class="modal-body">
          <p class="text-body-color">Delete "<strong class="text-heading">{{ deletingFeature?.name }}</strong>"? Test packs will be unlinked but not deleted.</p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteFeatureModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="deleteFeature" :disabled="deletingFeatureLoading" class="btn btn-danger">
            {{ deletingFeatureLoading ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Target, Plus, Trash2, Layers, ChevronDown, FileDown, Loader2 } from 'lucide-vue-next'
import api from '@/lib/api'

const loading = ref(true)
const saving = ref(false)
const deleting = ref(false)
const initiatives = ref([])
const features = ref([])
const teams = ref([])
const expandedInitiatives = ref(new Set())
const generatingReportId = ref(null)

const showModal = ref(false)
const showDeleteModal = ref(false)
const editingInitiative = ref(null)
const deletingInitiative = ref(null)

const showFeatureModal = ref(false)
const savingFeature = ref(false)
const editingFeature = ref(null)
const featureInitiativeId = ref(null)
const showDeleteFeatureModal = ref(false)
const deletingFeature = ref(null)
const deletingFeatureLoading = ref(false)

const defaultForm = {
  name: '', description: '', startDate: '', targetDate: '', targetQuarter: '',
  progress: 0, priority: 'medium', status: 'planning', tagsInput: '', milestones: []
}
const form = ref({ ...defaultForm })

const defaultFeatureForm = { name: '', description: '', teamId: '' }
const featureForm = ref({ ...defaultFeatureForm })

const featuresFor = (initiativeId) => features.value.filter(f => f.initiativeId === initiativeId)

const toggleFeatures = (initiativeId) => {
  const s = new Set(expandedInitiatives.value)
  if (s.has(initiativeId)) { s.delete(initiativeId) } else { s.add(initiativeId) }
  expandedInitiatives.value = s
}

const fetchInitiatives = async () => {
  const response = await api.get('/api/initiatives')
  if (response.data.success) initiatives.value = response.data.initiatives
}

const fetchFeatures = async () => {
  const response = await api.get('/api/features')
  if (response.data.success) features.value = response.data.features
}

const fetchTeams = async () => {
  const response = await api.get('/api/teams')
  if (response.data.success) teams.value = response.data.teams
}

onMounted(async () => {
  try {
    await Promise.all([fetchInitiatives(), fetchFeatures(), fetchTeams()])
  } catch (e) {
    console.error('Failed to load initiatives page:', e)
  } finally {
    loading.value = false
  }
})

// — Initiative CRUD —
const openCreateModal = () => {
  editingInitiative.value = null
  form.value = { ...defaultForm, milestones: [] }
  showModal.value = true
}

const openEditModal = (initiative) => {
  editingInitiative.value = initiative
  form.value = {
    name: initiative.name, description: initiative.description || '',
    startDate: initiative.startDate ? initiative.startDate.split('T')[0] : '',
    targetDate: initiative.targetDate ? initiative.targetDate.split('T')[0] : '',
    targetQuarter: initiative.targetQuarter || '',
    progress: initiative.progress || 0, priority: initiative.priority || 'medium',
    status: initiative.status || 'planning',
    tagsInput: initiative.tags ? initiative.tags.join(', ') : '',
    milestones: initiative.milestones ? initiative.milestones.map(m => ({
      name: m.name, targetDate: m.targetDate ? m.targetDate.split('T')[0] : '', status: m.status
    })) : []
  }
  showModal.value = true
}

const closeModal = () => { showModal.value = false; editingInitiative.value = null }

const addMilestone = () => form.value.milestones.push({ name: '', targetDate: '', status: 'pending' })
const removeMilestone = (index) => form.value.milestones.splice(index, 1)

const saveInitiative = async () => {
  saving.value = true
  try {
    const payload = {
      name: form.value.name, description: form.value.description,
      startDate: form.value.startDate || null, targetDate: form.value.targetDate,
      targetQuarter: form.value.targetQuarter, progress: form.value.progress,
      priority: form.value.priority, status: form.value.status,
      tags: form.value.tagsInput ? form.value.tagsInput.split(',').map(t => t.trim()).filter(t => t) : [],
      milestones: form.value.milestones.filter(m => m.name).map(m => ({ name: m.name, targetDate: m.targetDate || null, status: m.status }))
    }
    const url = editingInitiative.value ? `/api/initiatives/${editingInitiative.value.id}` : '/api/initiatives'
    const response = editingInitiative.value ? await api.put(url, payload) : await api.post(url, payload)
    if (response.data.success) { await fetchInitiatives(); closeModal() }
    else alert(response.data.message || 'Failed to save initiative')
  } catch { alert('Failed to save initiative') }
  finally { saving.value = false }
}

async function downloadReportPdf(url, filenameBase, reportKey) {
  generatingReportId.value = reportKey
  try {
    const resp = await api.get(url, { responseType: 'blob', timeout: 120000 })
    const dlUrl = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = dlUrl
    a.download = `${filenameBase.replace(/[^a-z0-9]+/gi, '-')}-report.pdf`
    a.click()
    URL.revokeObjectURL(dlUrl)
  } catch (e) {
    console.error('Failed to generate report:', e)
    alert('Failed to generate report')
  } finally {
    generatingReportId.value = null
  }
}

const generateInitiativeReport = (initiative) =>
  downloadReportPdf(`/api/initiatives/${initiative.id}/report`, initiative.name, initiative.id)

const generateFeatureReport = (feature) =>
  downloadReportPdf(`/api/features/${feature.id}/report`, feature.name, feature.id)

const confirmDelete = (initiative) => { deletingInitiative.value = initiative; showDeleteModal.value = true }

const deleteInitiative = async () => {
  deleting.value = true
  try {
    await api.delete(`/api/initiatives/${deletingInitiative.value.id}`)
    await Promise.all([fetchInitiatives(), fetchFeatures()])
    showDeleteModal.value = false; deletingInitiative.value = null
  } catch { alert('Failed to delete initiative') }
  finally { deleting.value = false }
}

// — Feature CRUD —
const openAddFeature = (initiativeId) => {
  editingFeature.value = null
  featureInitiativeId.value = initiativeId
  featureForm.value = { ...defaultFeatureForm }
  showFeatureModal.value = true
}

const openEditFeature = (feature) => {
  editingFeature.value = feature
  featureInitiativeId.value = feature.initiativeId
  featureForm.value = { name: feature.name, description: feature.description || '', teamId: feature.teamId || '' }
  showFeatureModal.value = true
}

const closeFeatureModal = () => { showFeatureModal.value = false; editingFeature.value = null }

const saveFeature = async () => {
  if (!featureForm.value.name.trim()) return
  savingFeature.value = true
  try {
    if (editingFeature.value) {
      await api.put(`/api/features/${editingFeature.value.id}`, {
        name: featureForm.value.name.trim(),
        description: featureForm.value.description || null,
        teamId: featureForm.value.teamId || null
      })
    } else {
      await api.post('/api/features', {
        name: featureForm.value.name.trim(),
        description: featureForm.value.description || null,
        initiativeId: featureInitiativeId.value,
        teamId: featureForm.value.teamId || null
      })
    }
    await fetchFeatures()
    closeFeatureModal()
  } catch { alert('Failed to save feature') }
  finally { savingFeature.value = false }
}

const confirmDeleteFeature = (feature) => { deletingFeature.value = feature; showDeleteFeatureModal.value = true }

const deleteFeature = async () => {
  deletingFeatureLoading.value = true
  try {
    await api.delete(`/api/features/${deletingFeature.value.id}`)
    await fetchFeatures()
    showDeleteFeatureModal.value = false; deletingFeature.value = null
  } catch { alert('Failed to delete feature') }
  finally { deletingFeatureLoading.value = false }
}

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString()
}

const formatStatus = (status) => {
  const labels = { 'planning': 'Planning', 'in-progress': 'In Progress', 'on-track': 'On Track', 'at-risk': 'At Risk', 'completed': 'Completed', 'cancelled': 'Cancelled' }
  return labels[status] || status
}

const getPriorityBadgeClass = (priority) => {
  return { critical: 'badge-danger', high: 'badge-warning', medium: 'badge-info', low: 'badge-secondary' }[priority] || 'badge-info'
}

const getStatusBadgeClass = (status) => {
  return { planning: 'badge-warning', 'in-progress': 'badge-info', 'on-track': 'badge-success', 'at-risk': 'badge-danger', completed: 'badge-success', cancelled: 'badge-secondary' }[status] || 'badge-secondary'
}
</script>
