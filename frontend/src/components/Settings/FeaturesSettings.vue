<template>
  <div class="space-y-6" data-testid="page-features">
    <div>
      <p class="text-body text-body-color">Manage product features. Features sit inside initiatives and hold test packs.</p>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h2 class="card-title flex items-center gap-2">
            <Layers :size="20" class="text-primary" />
            Features
          </h2>
          <button @click="openCreate" class="btn btn-primary flex items-center gap-2">
            <Plus :size="16" />
            New Feature
          </button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="loading" class="text-center py-8 text-muted">Loading...</div>
        <div v-else-if="features.length === 0" class="text-center py-8 text-muted">
          <Layers :size="36" class="mx-auto mb-3 opacity-30" />
          <p class="font-medium">No features yet</p>
          <p class="text-sm mt-1">Create your first feature, then link test packs to it.</p>
        </div>
        <div v-else class="space-y-6">
          <div v-for="group in grouped" :key="group.initiativeId">
            <div class="text-xs font-semibold text-muted uppercase tracking-wide mb-2 px-1">{{ group.initiativeName }}</div>
            <div class="space-y-2">
              <div
                v-for="feature in group.features"
                :key="feature.id"
                class="flex items-center justify-between p-3 rounded-lg border border-default bg-surface"
              >
                <div>
                  <p class="font-medium text-heading text-sm">{{ feature.name }}</p>
                  <p v-if="feature.description" class="text-xs text-muted mt-0.5">{{ feature.description }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <button @click="generateReport(feature)" :disabled="generatingReportId === feature.id" class="btn btn-xs btn-secondary flex items-center gap-1" title="Download a PDF test health report for this feature">
                    <Loader2 v-if="generatingReportId === feature.id" :size="12" class="animate-spin" />
                    <FileDown v-else :size="12" />
                    {{ generatingReportId === feature.id ? 'Generating…' : 'Generate Report' }}
                  </button>
                  <button @click="openEdit(feature)" class="btn btn-xs btn-secondary">Edit</button>
                  <button @click="confirmDelete(feature)" class="btn btn-xs btn-danger">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <Teleport to="body">
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="modal-title">{{ editing ? 'Edit Feature' : 'New Feature' }}</h3>
        </div>
        <div class="modal-body space-y-4">
          <div v-if="!editing">
            <label class="form-label">Initiative *</label>
            <select v-model="form.initiativeId" class="form-input" required>
              <option value="">— Select initiative —</option>
              <option v-for="i in initiatives" :key="i.id" :value="i.id">{{ i.name }}</option>
            </select>
            <p v-if="initiatives.length === 0" class="text-xs text-warning mt-1">
              No initiatives yet — create one in the Initiatives tab first.
            </p>
          </div>
          <div>
            <label class="form-label">Feature Name *</label>
            <input v-model="form.name" type="text" class="form-input" placeholder="e.g. Homepage redesign" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <input v-model="form.description" type="text" class="form-input" placeholder="Optional" />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeModal" class="btn btn-secondary">Cancel</button>
          <button
            @click="save"
            :disabled="saving || !form.name.trim() || (!editing && !form.initiativeId)"
            class="btn btn-primary"
          >
            {{ saving ? 'Saving...' : (editing ? 'Update' : 'Create Feature') }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Delete Confirm Modal -->
    <Teleport to="body">
    <div v-if="showDelete" class="modal-overlay">
      <div class="modal-content max-w-sm">
        <div class="modal-header">
          <h3 class="modal-title">Delete Feature</h3>
        </div>
        <div class="modal-body">
          <p class="text-body-color">Delete "<strong class="text-heading">{{ deleting?.name }}</strong>"? Test packs will be unlinked but not deleted.</p>
        </div>
        <div class="modal-footer">
          <button @click="showDelete = false" class="btn btn-secondary">Cancel</button>
          <button @click="executeDelete" :disabled="deletingLoading" class="btn btn-danger">
            {{ deletingLoading ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Layers, Plus, Trash2, FileDown, Loader2 } from 'lucide-vue-next'
import api from '@/lib/api'

const loading = ref(true)
const features = ref([])
const initiatives = ref([])
const generatingReportId = ref(null)

const showModal = ref(false)
const saving = ref(false)
const editing = ref(null)
const form = ref({ name: '', description: '', initiativeId: '' })

const showDelete = ref(false)
const deleting = ref(null)
const deletingLoading = ref(false)

const grouped = computed(() => {
  const map = {}
  features.value.forEach(f => {
    const key = f.initiativeId
    if (!map[key]) map[key] = { initiativeId: key, initiativeName: f.initiativeName || 'Unassigned', features: [] }
    map[key].features.push(f)
  })
  return Object.values(map)
})

onMounted(async () => {
  try {
    const [fr, ir] = await Promise.all([api.get('/api/features'), api.get('/api/initiatives')])
    if (fr.data.success) features.value = fr.data.features
    if (ir.data.success) initiatives.value = ir.data.initiatives
  } catch (e) {
    console.error('Failed to load features:', e)
  } finally {
    loading.value = false
  }
})

function openCreate() {
  editing.value = null
  form.value = { name: '', description: '', initiativeId: '' }
  showModal.value = true
}

function openEdit(feature) {
  editing.value = feature
  form.value = { name: feature.name, description: feature.description || '', initiativeId: feature.initiativeId }
  showModal.value = true
}

function closeModal() { showModal.value = false; editing.value = null }

async function save() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/api/features/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description || null
      })
    } else {
      await api.post('/api/features', {
        name: form.value.name.trim(),
        description: form.value.description || null,
        initiativeId: form.value.initiativeId
      })
    }
    const { data } = await api.get('/api/features')
    if (data.success) features.value = data.features
    closeModal()
  } catch (e) {
    console.error('Failed to save feature:', e)
    alert('Failed to save feature')
  } finally {
    saving.value = false
  }
}

async function generateReport(feature) {
  generatingReportId.value = feature.id
  try {
    const resp = await api.get(`/api/features/${feature.id}/report`, { responseType: 'blob', timeout: 120000 })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${feature.name.replace(/[^a-z0-9]+/gi, '-')}-report.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Failed to generate report:', e)
    alert('Failed to generate report')
  } finally {
    generatingReportId.value = null
  }
}

function confirmDelete(feature) { deleting.value = feature; showDelete.value = true }

async function executeDelete() {
  deletingLoading.value = true
  try {
    await api.delete(`/api/features/${deleting.value.id}`)
    const { data } = await api.get('/api/features')
    if (data.success) features.value = data.features
    showDelete.value = false; deleting.value = null
  } catch (e) {
    alert('Failed to delete feature')
  } finally {
    deletingLoading.value = false
  }
}
</script>
