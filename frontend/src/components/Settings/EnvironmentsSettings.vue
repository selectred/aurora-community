<template>
  <div class="space-y-6" data-testid="page-environments">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-body text-body-color">
          Define named environments (Local, Staging, Production) with a base URL and variables.
          Test packs substitute <code class="text-xs bg-muted px-1 py-0.5 rounded">&#123;&#123;BASE_URL&#125;&#125;</code> and
          <code class="text-xs bg-muted px-1 py-0.5 rounded">&#123;&#123;VAR_NAME&#125;&#125;</code> tokens at run time using the active environment.
        </p>
      </div>
      <button @click="openCreate" class="btn btn-primary shrink-0">
        <Plus :size="18" />
        New Environment
      </button>
    </div>

    <!-- Environment list -->
    <div v-if="environments.length === 0" class="card">
      <div class="card-body flex flex-col items-center gap-3 py-12 text-center">
        <Globe :size="40" class="text-muted" />
        <p class="text-muted">No environments yet. Create one to run packs against different targets.</p>
        <button @click="openCreate" class="btn btn-primary mt-2">
          <Plus :size="16" />
          Create First Environment
        </button>
      </div>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="env in environments"
        :key="env.id"
        class="card"
        :class="env.isActive ? 'ring-2 ring-primary' : ''"
      >
        <div class="card-body">
          <div class="flex items-start gap-4">
            <!-- Color dot + name -->
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <span class="w-3 h-3 rounded-full shrink-0" :class="colorClass(env.color)"></span>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold text-heading">{{ env.name }}</h3>
                  <span v-if="env.isActive" class="text-xs px-2 py-0.5 rounded-full bg-primary text-white font-medium">Active</span>
                </div>
                <p class="text-sm text-muted truncate">{{ env.baseUrl || 'No base URL set' }}</p>
              </div>
            </div>

            <!-- Variable count -->
            <div class="text-sm text-muted shrink-0">
              {{ varCount(env) }} variable{{ varCount(env) !== 1 ? 's' : '' }}
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="!env.isActive"
                @click="activate(env)"
                class="btn btn-secondary text-xs py-1 px-3"
                title="Set as active environment"
              >
                Set Active
              </button>
              <button
                v-else
                @click="deactivate(env)"
                class="btn btn-secondary text-xs py-1 px-3"
                title="Deactivate"
              >
                Deactivate
              </button>
              <button @click="openEdit(env)" class="p-1.5 rounded hover:bg-muted text-muted hover:text-heading transition-colors">
                <Pencil :size="16" />
              </button>
              <button @click="confirmDelete(env)" class="p-1.5 rounded hover:bg-danger-soft text-muted hover:text-danger transition-colors">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <!-- Variables preview -->
          <div v-if="varCount(env) > 0" class="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
            <span
              v-for="[k] in parsedVars(env)"
              :key="k"
              class="text-xs px-2 py-0.5 rounded bg-muted text-muted font-mono"
            >
              {{ tokenLabel(k) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Usage hint -->
    <div class="card bg-muted border-0">
      <div class="card-body text-sm text-muted space-y-1">
        <p class="font-medium text-heading text-sm">How to use environment variables in test code</p>
        <p>In spec URLs: <code class="bg-background px-1 rounded">&#123;&#123;BASE_URL&#125;&#125;/login</code></p>
        <p>In generated Playwright code: <code class="bg-background px-1 rounded">await page.goto('&#123;&#123;BASE_URL&#125;&#125;/dashboard')</code></p>
        <p>Custom variables: <code class="bg-background px-1 rounded">await page.fill('#username', '&#123;&#123;USERNAME&#125;&#125;')</code></p>
        <p class="text-xs pt-1">Tokens are replaced at run time — the stored code stays portable across environments.</p>
      </div>
    </div>

    <!-- Create / Edit modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-lg z-10">
        <div class="p-6 border-b border-border flex items-center justify-between">
          <h2 class="font-semibold text-heading text-lg">{{ editing ? 'Edit Environment' : 'New Environment' }}</h2>
          <button @click="closeModal" class="text-muted hover:text-heading"><X :size="20" /></button>
        </div>
        <div class="p-6 space-y-4">
          <!-- Name + Color -->
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <input v-model="form.name" class="form-input" placeholder="e.g. Local, Staging, Production" />
            </div>
            <div>
              <label class="form-label">Colour</label>
              <div class="flex gap-2 mt-1">
                <button
                  v-for="c in colors"
                  :key="c"
                  @click="form.color = c"
                  class="w-6 h-6 rounded-full border-2 transition-all"
                  :class="[dotColor(c), form.color === c ? 'border-heading scale-125' : 'border-transparent']"
                ></button>
              </div>
            </div>
          </div>

          <!-- Base URL -->
          <div>
            <label class="form-label">Base URL</label>
            <input v-model="form.baseUrl" type="url" class="form-input" placeholder="http://localhost:8081" />
            <p class="text-xs text-muted mt-1">Available as <code>{{BASE_URL}}</code> in spec URLs and generated code</p>
          </div>

          <!-- Variables -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="form-label mb-0">Variables</label>
              <button @click="addVar" class="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus :size="12" /> Add variable
              </button>
            </div>
            <div class="space-y-2">
              <div v-for="(pair, i) in form.variables" :key="i" class="flex gap-2">
                <input v-model="pair.key" class="form-input font-mono text-sm" placeholder="VAR_NAME" />
                <input v-model="pair.value" class="form-input text-sm" placeholder="value" />
                <button @click="form.variables.splice(i, 1)" class="text-muted hover:text-danger shrink-0">
                  <X :size="16" />
                </button>
              </div>
            </div>
            <p class="text-xs text-muted mt-1">Use as <code>&#123;&#123;VAR_NAME&#125;&#125;</code> in spec code</p>
          </div>

          <!-- Set active -->
          <div class="flex items-center gap-3">
            <input type="checkbox" id="setActive" v-model="form.setActive" class="w-4 h-4 text-primary" />
            <label for="setActive" class="text-sm text-body">Set as active environment</label>
          </div>

          <div v-if="formError" class="p-3 bg-danger-soft rounded text-danger text-sm">{{ formError }}</div>
        </div>
        <div class="p-6 border-t border-border flex justify-end gap-3">
          <button @click="closeModal" class="btn btn-secondary">Cancel</button>
          <button @click="save" :disabled="saving" class="btn btn-primary">
            <Loader2 v-if="saving" :size="16" class="animate-spin" />
            {{ editing ? 'Save Changes' : 'Create Environment' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="deleteTarget = null"></div>
      <div class="relative bg-surface rounded-xl shadow-xl w-full max-w-sm z-10 p-6 space-y-4">
        <h2 class="font-semibold text-heading">Delete Environment?</h2>
        <p class="text-sm text-body">Delete <strong>{{ deleteTarget.name }}</strong>? This cannot be undone.</p>
        <div class="flex justify-end gap-3">
          <button @click="deleteTarget = null" class="btn btn-secondary">Cancel</button>
          <button @click="doDelete" :disabled="saving" class="btn btn-danger">
            <Loader2 v-if="saving" :size="16" class="animate-spin" />
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/lib/api'
import { Globe, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-vue-next'

const environments = ref([])
const showModal = ref(false)
const editing = ref(null)
const saving = ref(false)
const formError = ref('')
const deleteTarget = ref(null)

const colors = ['blue', 'green', 'orange', 'purple', 'red']

const form = ref({ name: '', baseUrl: '', variables: [], color: 'blue', setActive: false })

function colorClass(c) {
  return { blue: 'bg-blue-500', green: 'bg-green-500', orange: 'bg-orange-400', purple: 'bg-purple-500', red: 'bg-red-500' }[c] || 'bg-blue-500'
}
function dotColor(c) {
  return { blue: 'bg-blue-500', green: 'bg-green-500', orange: 'bg-orange-400', purple: 'bg-purple-500', red: 'bg-red-500' }[c] || 'bg-blue-500'
}

function tokenLabel(k) { return `{{${k}}}` }

function parsedVars(env) {
  try { return Object.entries(JSON.parse(env.variables || '{}')) } catch { return [] }
}
function varCount(env) { return parsedVars(env).length }

async function load() {
  try {
    const { data } = await api.get('/api/environments')
    environments.value = data
  } catch (e) {
    environments.value = []
  }
}

function openCreate() {
  editing.value = null
  form.value = { name: '', baseUrl: '', variables: [], color: 'blue', setActive: environments.value.length === 0 }
  formError.value = ''
  showModal.value = true
}

function openEdit(env) {
  editing.value = env
  form.value = {
    name: env.name,
    baseUrl: env.baseUrl,
    color: env.color || 'blue',
    setActive: env.isActive,
    variables: parsedVars(env).map(([k, v]) => ({ key: k, value: v }))
  }
  formError.value = ''
  showModal.value = true
}

function closeModal() { showModal.value = false; editing.value = null }

function addVar() { form.value.variables.push({ key: '', value: '' }) }

async function save() {
  if (!form.value.name.trim()) { formError.value = 'Name is required'; return }
  saving.value = true
  formError.value = ''
  try {
    const vars = {}
    for (const { key, value } of form.value.variables) {
      if (key.trim()) vars[key.trim()] = value
    }
    const payload = {
      name: form.value.name.trim(),
      baseUrl: form.value.baseUrl.trim(),
      variables: vars,
      color: form.value.color,
      setActive: form.value.setActive
    }
    if (editing.value) {
      await api.put(`/api/environments/${editing.value.id}`, payload)
      if (form.value.setActive) await api.post(`/api/environments/${editing.value.id}/activate`)
    } else {
      await api.post('/api/environments', payload)
    }
    await load()
    closeModal()
  } catch (e) {
    formError.value = e.response?.data?.error || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function activate(env) {
  try {
    await api.post(`/api/environments/${env.id}/activate`)
    await load()
  } catch {}
}

async function deactivate(env) {
  try {
    await api.post(`/api/environments/${env.id}/deactivate`)
    await load()
  } catch {}
}

function confirmDelete(env) { deleteTarget.value = env }

async function doDelete() {
  if (!deleteTarget.value) return
  saving.value = true
  try {
    await api.delete(`/api/environments/${deleteTarget.value.id}`)
    deleteTarget.value = null
    await load()
  } catch {} finally { saving.value = false }
}

onMounted(load)
</script>
