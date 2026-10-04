<template>
  <div class="space-y-6" data-testid="page-teams">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Manage your QA teams</p>
    </div>

    <!-- Teams Section -->
    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h2 class="card-title flex items-center gap-2">
            <Boxes :size="20" class="text-primary" />
            Teams
          </h2>
          <button
            @click="showCreateTeamModal = true"
            class="btn btn-primary flex items-center gap-2"
          >
            <Plus :size="16" />
            New Team
          </button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="loadingTeams" class="text-center py-8 text-muted">Loading teams...</div>
        <div v-else-if="teams.length === 0" class="text-center py-8 text-muted">
          No features found. Create your first feature.
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="team in teams"
            :key="team.id"
            class="p-4 border border-default rounded-lg"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
                  :style="{ backgroundColor: team.color || '#7367F0' }"
                >
                  {{ team.name.substring(0, 2).toUpperCase() }}
                </div>
                <div>
                  <h3 class="font-bold text-heading">{{ team.name }}</h3>
                  <p class="text-sm text-muted">{{ team.description || 'No description' }}</p>
                </div>
              </div>
            </div>
            <div class="space-y-1.5 text-sm mb-3">
              <div class="flex items-center justify-between">
                <span class="text-muted">Pass Rate</span>
                <span class="font-medium text-heading">{{ team.metrics?.passRate || 0 }}%</span>
              </div>
            </div>
            <div class="flex gap-2 pt-3 border-t border-default">
              <button @click="editTeam(team)" class="flex-1 btn btn-sm btn-secondary">Edit</button>
              <button @click="confirmDelete(team)" class="btn btn-sm btn-danger">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Team Modal -->
    <div v-if="showCreateTeamModal || showEditTeamModal" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="modal-title">{{ showEditTeamModal ? 'Edit Team' : 'Create New Team' }}</h3>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Team Name *</label>
            <input v-model="teamForm.name" type="text" class="form-input" placeholder="e.g. Mobile App" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea v-model="teamForm.description" rows="2" class="form-input" placeholder="Team or product description..."></textarea>
          </div>
          <div>
            <label class="form-label">Team Colour</label>
            <div class="flex gap-2 mt-2">
              <button
                v-for="color in teamColors"
                :key="color"
                @click="teamForm.color = color"
                class="w-8 h-8 rounded-lg border-2 transition-all"
                :class="teamForm.color === color ? 'border-heading scale-110' : 'border-transparent'"
                :style="{ backgroundColor: color }"
              ></button>
            </div>
          </div>
          <p v-if="teamFormError" class="text-danger text-sm">{{ teamFormError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeTeamModal" class="btn btn-secondary">Cancel</button>
          <button @click="saveTeam" :disabled="savingTeam" class="btn btn-primary">
            {{ savingTeam ? 'Saving...' : (showEditTeamModal ? 'Update' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteConfirm" class="modal-overlay">
      <div class="modal-content max-w-sm">
        <div class="modal-header">
          <h3 class="modal-title">Confirm Delete</h3>
        </div>
        <div class="modal-body">
          <p class="text-body-color">
            Are you sure you want to delete <strong class="text-heading">{{ deleteTarget?.name }}</strong>?
            This cannot be undone.
          </p>
        </div>
        <div class="modal-footer">
          <button @click="showDeleteConfirm = false" class="btn btn-secondary">Cancel</button>
          <button @click="executeDelete" :disabled="deleting" class="btn btn-danger">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Boxes, Plus, Trash2 } from 'lucide-vue-next'
import api from '@/lib/api'

const teamColors = ['#7367F0', '#28C76F', '#FF9F43', '#EA5455', '#00CFE8', '#9C27B0', '#FF5722', '#607D8B']

const loadingTeams = ref(false)
const teams = ref([])

const showCreateTeamModal = ref(false)
const showEditTeamModal = ref(false)
const showDeleteConfirm = ref(false)

const savingTeam = ref(false)
const deleting = ref(false)

const teamFormError = ref('')
const deleteTarget = ref(null)

const teamForm = ref({
  id: null,
  name: '',
  description: '',
  color: '#7367F0'
})

onMounted(async () => {
  await fetchTeams()
})

async function fetchTeams() {
  loadingTeams.value = true
  try {
    const response = await api.get('/api/teams')
    teams.value = response.data.teams || []
  } catch (error) {
    console.error('Failed to fetch features:', error)
  } finally {
    loadingTeams.value = false
  }
}

function editTeam(team) {
  teamForm.value = {
    id: team.id,
    name: team.name,
    description: team.description || '',
    color: team.color || '#7367F0'
  }
  showEditTeamModal.value = true
}

function closeTeamModal() {
  showCreateTeamModal.value = false
  showEditTeamModal.value = false
  teamFormError.value = ''
  teamForm.value = {
    id: null,
    name: '',
    description: '',
    color: '#7367F0'
  }
}

async function saveTeam() {
  teamFormError.value = ''

  if (!teamForm.value.name) {
    teamFormError.value = 'Team name is required'
    return
  }

  savingTeam.value = true

  try {
    const payload = {
      name: teamForm.value.name,
      description: teamForm.value.description,
      color: teamForm.value.color
    }

    if (showEditTeamModal.value) {
      await api.put(`/api/teams/${teamForm.value.id}`, payload)
    } else {
      await api.post('/api/teams', payload)
    }

    await fetchTeams()
    closeTeamModal()
  } catch (error) {
    teamFormError.value = error.response?.data?.message || 'Failed to save feature'
  } finally {
    savingTeam.value = false
  }
}

function confirmDelete(team) {
  deleteTarget.value = team
  showDeleteConfirm.value = true
}

async function executeDelete() {
  deleting.value = true
  try {
    await api.delete(`/api/teams/${deleteTarget.value.id}`)
    await fetchTeams()
    showDeleteConfirm.value = false
    deleteTarget.value = null
  } catch (error) {
    alert(error.response?.data?.message || 'Failed to delete')
  } finally {
    deleting.value = false
  }
}
</script>
