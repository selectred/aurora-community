<template>
  <div class="space-y-6" data-testid="page-synthetic-settings">
    <div>
      <p class="text-body text-body-color">Tests you've made into monitors. Continuum runs them on their interval against your live service and alerts its webhooks when one fails and when it recovers.</p>
    </div>

    <div class="flex items-start gap-3 p-4 rounded-lg border border-default bg-surface text-sm" data-testid="monitors-run-in-continuum">
      <Info :size="18" class="text-primary flex-shrink-0 mt-0.5" />
      <div>
        <p class="text-heading font-medium">Monitors run in Continuum</p>
        <p class="text-muted mt-0.5">Aurora sends each monitor to Continuum when you create, change or remove it, so Continuum needs to be connected under Settings → Continuum. Webhooks, alert history and results are in Continuum, under Settings → Monitors and on its Synthetics page.</p>
      </div>
    </div>

    <p v-if="notice" role="status" data-testid="toast-notification" :class="['text-sm', notice.ok ? 'text-success' : 'text-warning']">{{ notice.text }}</p>

    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h2 class="card-title flex items-center gap-2">
            <Activity :size="20" class="text-success" />
            Monitors
          </h2>
          <router-link to="/tests/packs" class="text-sm text-primary hover:underline">
            Make another test a monitor →
          </router-link>
        </div>
      </div>
      <div class="card-body">
        <div v-if="loading" class="text-center py-8 text-muted">Loading monitors...</div>
        <div v-else-if="syntheticTests.length === 0" class="text-center py-8 text-muted">
          <p>No monitors yet</p>
          <p class="text-sm mt-2">
            Open a ready test in
            <router-link to="/tests/packs" class="text-primary hover:underline">Test Packs</router-link>
            and choose "Make this test a monitor".
          </p>
        </div>
        <div v-else class="space-y-3">
          <div v-for="test in syntheticTests" :key="test.id" class="p-4 border border-default rounded-lg">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-heading">{{ test.name }}</h3>
                <p class="text-sm text-muted mt-0.5 truncate">{{ test.url }}</p>
                <div class="flex flex-wrap gap-4 mt-2 text-xs text-muted">
                  <span><span class="font-medium">Every:</span> {{ intervalLabel(test.schedule) }}</span>
                  <span><span class="font-medium">Type:</span> {{ test.testType }}</span>
                  <span v-if="test.promotedToSyntheticAt">
                    <span class="font-medium">Since:</span> {{ formatDate(test.promotedToSyntheticAt) }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button @click="editSyntheticSettings(test)" class="btn btn-secondary btn-sm" title="Change interval" :aria-label="`Change ${test.name}`">
                  <Settings2 :size="14" />
                </button>
                <button
                  @click="runSyntheticTest(test.specId)"
                  :disabled="runningId === test.specId"
                  class="btn btn-secondary btn-sm"
                  title="Run the test once on this machine"
                >
                  {{ runningId === test.specId ? 'Running...' : 'Run here' }}
                </button>
                <button @click="demoteFromSynthetic(test)" class="btn btn-danger btn-sm" title="Stop monitoring" :aria-label="`Stop monitoring ${test.name}`">
                  <X :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit Monitor Modal -->
  <div v-if="showEditModal" class="modal-overlay">
    <div class="modal-content max-w-md">
      <div class="modal-header">
        <h2 class="modal-title">Change monitor</h2>
        <button @click="showEditModal = false" class="text-muted hover:text-heading">
          <X :size="24" />
        </button>
      </div>
      <div class="modal-body space-y-4">
        <p class="text-sm text-muted font-medium">{{ editingTest?.name }}</p>

        <div>
          <label class="form-label" for="edit-interval">Check every</label>
          <select id="edit-interval" v-model="editForm.schedule" class="form-input">
            <option v-for="p in schedulePresets" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showEditModal = false" class="btn btn-secondary">Cancel</button>
        <button @click="saveEditModal" :disabled="savingEdit" class="btn btn-primary">
          {{ savingEdit ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Activity, Info, Settings2, X } from 'lucide-vue-next'
import api from '@/lib/api'

// The intervals Continuum runs monitors at
const schedulePresets = [
  { label: '1 minute',   value: '*/1 * * * *' },
  { label: '5 minutes',  value: '*/5 * * * *' },
  { label: '10 minutes', value: '*/10 * * * *' },
  { label: '15 minutes', value: '*/15 * * * *' },
  { label: '30 minutes', value: '*/30 * * * *' },
  { label: '1 hour',     value: '0 * * * *' },
]

const showEditModal = ref(false)
const editingTest = ref(null)
const savingEdit = ref(false)
const editForm = reactive({ schedule: '*/15 * * * *' })

const loading = ref(false)
const runningId = ref(null)
const notice = ref(null)
const syntheticTests = ref([])

onMounted(fetchSyntheticTests)

// Older tests may hold a cron that isn't one of the intervals; Continuum uses
// the nearest interval, so show it the same way
function presetFor (schedule) {
  if (schedulePresets.some(p => p.value === schedule)) return schedule
  const m = String(schedule || '').match(/^\*\/(\d+) \* \* \* \*$/)
  const minutes = m ? Number(m[1]) : (/^\d+ \* \* \* \*$/.test(schedule || '') ? 60 : 30)
  const options = [1, 5, 10, 15, 30, 60]
  const nearest = options.reduce((best, i) => (Math.abs(i - minutes) < Math.abs(best - minutes) ? i : best))
  return nearest === 60 ? '0 * * * *' : `*/${nearest} * * * *`
}
const intervalLabel = schedule => schedulePresets.find(p => p.value === presetFor(schedule))?.label

function showResult (continuum, okText) {
  if (!continuum) return
  notice.value = continuum.synced ? { ok: true, text: okText } : { ok: false, text: `Saved in Aurora, but not in Continuum yet. ${continuum.reason}` }
  setTimeout(() => { notice.value = null }, 8000)
}

async function fetchSyntheticTests() {
  loading.value = true
  try {
    const response = await api.get('/api/agent-tests/synthetics')
    syntheticTests.value = response.data
  } catch (error) {
    console.error('Failed to fetch monitors:', error)
  } finally {
    loading.value = false
  }
}

async function runSyntheticTest(specId) {
  runningId.value = specId
  try {
    await api.post(`/api/agent-tests/specs/${specId}/run`)
    await fetchSyntheticTests()
  } catch (error) {
    console.error('Failed to run test:', error)
  } finally {
    runningId.value = null
  }
}

async function demoteFromSynthetic(test) {
  try {
    const { data } = await api.post(`/api/agent-tests/specs/${test.specId}/demote`)
    showResult(data.continuum, `Continuum has stopped monitoring ${test.name}.`)
    await fetchSyntheticTests()
  } catch (error) {
    console.error('Failed to stop monitoring:', error)
  }
}

function editSyntheticSettings(test) {
  editingTest.value = test
  editForm.schedule = presetFor(test.schedule)
  showEditModal.value = true
}

async function saveEditModal() {
  if (!editingTest.value) return
  savingEdit.value = true
  try {
    const { data } = await api.put(`/api/agent-tests/specs/${editingTest.value.specId}/synthetic-settings`, {
      schedule: editForm.schedule
    })
    showResult(data.continuum, `Continuum has the new settings for ${editingTest.value.name}.`)
    await fetchSyntheticTests()
    showEditModal.value = false
    editingTest.value = null
  } catch (error) {
    console.error('Failed to update monitor:', error)
  } finally {
    savingEdit.value = false
  }
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>
