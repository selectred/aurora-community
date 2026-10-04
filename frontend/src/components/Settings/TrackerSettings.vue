<template>
  <div class="space-y-6" data-testid="page-tracker-settings">
    <div>
      <p class="text-body text-body-color">
        Connect Jira or Azure DevOps to import requirements into the ambiguity gate and push bug reports as tickets.
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Connection -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Ticket :size="20" class="text-primary" />
            Tracker Connection
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Tracker</label>
            <div class="flex gap-2" role="radiogroup" aria-label="Issue tracker">
              <button
                v-for="opt in providerOptions"
                :key="opt.id"
                type="button"
                class="btn btn-sm"
                :class="form.provider === opt.id ? 'btn-primary' : 'btn-secondary'"
                :aria-pressed="form.provider === opt.id"
                :data-testid="`tracker-provider-${opt.id}`"
                @click="selectProvider(opt.id)"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- Jira -->
          <template v-if="form.provider === 'jira'">
            <div>
              <label class="form-label">Deployment</label>
              <select v-model="form.config.deployment" class="form-input">
                <option value="cloud">Jira Cloud (atlassian.net)</option>
                <option value="server">Jira Server / Data Center</option>
              </select>
            </div>
            <div>
              <label class="form-label">Site URL</label>
              <input v-model="form.config.baseUrl" type="url" class="form-input" placeholder="https://your-company.atlassian.net" />
            </div>
            <div v-if="form.config.deployment !== 'server'">
              <label class="form-label">Account email</label>
              <input v-model="form.config.email" type="email" class="form-input" placeholder="you@company.com" />
              <p class="text-xs text-muted mt-1">The Atlassian account that owns the API token.</p>
            </div>
          </template>

          <!-- Azure DevOps -->
          <template v-if="form.provider === 'ado'">
            <div>
              <label class="form-label">Organisation URL</label>
              <input v-model="form.config.orgUrl" type="url" class="form-input" placeholder="https://dev.azure.com/your-org" />
              <p class="text-xs text-muted mt-1">For Azure DevOps Server, use the collection URL, e.g. https://ado.company.local/DefaultCollection.</p>
            </div>
          </template>

          <!-- Token (both) -->
          <div v-if="form.provider !== 'none'">
            <label class="form-label">{{ tokenLabel }}</label>
            <div class="flex gap-2">
              <input
                v-model="form.token"
                :type="showToken ? 'text' : 'password'"
                class="form-input flex-1"
                :placeholder="hasToken ? 'Saved — leave blank to keep the current token' : tokenPlaceholder"
                autocomplete="off"
              />
              <button @click="showToken = !showToken" class="btn btn-secondary" type="button" :aria-label="showToken ? 'Hide token' : 'Show token'">
                <Eye v-if="!showToken" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
            <p class="text-xs text-muted mt-1">{{ tokenHint }}</p>
          </div>

          <div v-if="form.provider !== 'none'" class="flex items-center gap-3 flex-wrap pt-1">
            <button @click="testConnection" :disabled="testing" class="btn btn-secondary" data-testid="tracker-test">
              {{ testing ? 'Testing...' : 'Test Connection' }}
            </button>
          </div>

          <!-- Project + defaults, once connected -->
          <template v-if="form.provider !== 'none'">
            <div>
              <label class="form-label">Default project</label>
              <select v-if="projects.length" v-model="form.config.defaultProject" class="form-input">
                <option value="">— Choose a project —</option>
                <option v-for="p in projects" :key="p.key" :value="p.key">{{ p.name }}{{ p.name !== p.key ? ` (${p.key})` : '' }}</option>
              </select>
              <input v-else v-model="form.config.defaultProject" class="form-input" :placeholder="form.provider === 'jira' ? 'e.g. PAY' : 'e.g. Shop'" />
              <p class="text-xs text-muted mt-1">Used for requirement imports and for bug tickets. Test the connection to pick from a list.</p>
            </div>
            <div v-if="form.provider === 'jira'" class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">Issue type for bugs</label>
                <input v-model="form.config.issueType" class="form-input" placeholder="Bug" />
              </div>
              <div>
                <label class="form-label">Acceptance criteria field</label>
                <input v-model="form.config.acField" class="form-input" placeholder="e.g. customfield_10035" />
              </div>
              <p class="col-span-2 text-xs text-muted -mt-1">
                Leave the field blank if acceptance criteria live in the description under an "Acceptance Criteria" heading.
              </p>
            </div>
            <div v-if="form.provider === 'ado'">
              <label class="form-label">Work item type for bugs</label>
              <input v-model="form.config.workItemType" class="form-input" placeholder="Bug" />
              <p class="text-xs text-muted mt-1">Projects on the Basic process have no Bug type — use "Issue".</p>
            </div>
          </template>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button @click="save" :disabled="saving" class="btn btn-primary" data-testid="tracker-save">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
            <span v-if="message" class="text-sm" :class="messageSuccess ? 'text-success' : 'text-danger'" role="status">
              {{ message }}
            </span>
          </div>
        </div>
      </div>

      <!-- Status -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Activity :size="20" class="text-primary" />
            Status
          </h2>
        </div>
        <div class="card-body space-y-3">
          <div class="p-4 border border-default rounded-lg bg-surface space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Saved tracker</span>
              <span :class="savedProvider !== 'none' ? 'badge badge-success' : 'badge badge-secondary'">
                {{ labelFor(savedProvider) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Token</span>
              <span class="text-heading">{{ hasToken ? '••••••••' : '—' }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Last test</span>
              <span :class="lastTest?.ok ? 'text-success' : lastTest ? 'text-danger' : 'text-muted'">
                {{ lastTest?.ok ? `Connected as ${lastTest.user}` : lastTest ? 'Failed' : 'Not tested' }}
              </span>
            </div>
          </div>
          <p class="text-xs text-muted">
            The token is stored on this machine only and is never shown again after saving.
            Requirements are imported from <strong>Requirements → {{ labelFor(savedProvider) === 'None' ? 'Jira / Azure DevOps' : labelFor(savedProvider) }}</strong>;
            bugs are pushed from each bug report.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Ticket, Activity, Eye, EyeOff } from 'lucide-vue-next'
import api from '@/lib/api'

const providerOptions = [
  { id: 'none', label: 'None' },
  { id: 'jira', label: 'Jira' },
  { id: 'ado', label: 'Azure DevOps' }
]
const DEFAULTS = {
  jira: { deployment: 'cloud', baseUrl: '', email: '', defaultProject: '', issueType: 'Bug', acField: '' },
  ado: { orgUrl: '', defaultProject: '', workItemType: 'Bug' },
  none: {}
}

const form = ref({ provider: 'none', config: {}, token: '' })
const savedProvider = ref('none')
const hasToken = ref(false)
const projects = ref([])
const showToken = ref(false)
const saving = ref(false)
const testing = ref(false)
const lastTest = ref(null)
const message = ref('')
const messageSuccess = ref(false)

const labelFor = id => providerOptions.find(o => o.id === id)?.label || 'None'

const tokenLabel = computed(() =>
  form.value.provider === 'ado' ? 'Personal access token'
    : form.value.config.deployment === 'server' ? 'Personal access token' : 'API token')
const tokenPlaceholder = computed(() => form.value.provider === 'ado' ? 'Paste a PAT with Work Items (Read & Write)' : 'Paste your token')
const tokenHint = computed(() => {
  if (form.value.provider === 'ado') return 'Create it under User settings → Personal access tokens, with the Work Items (Read & write) scope.'
  if (form.value.config.deployment === 'server') return 'Create it under your Jira profile → Personal Access Tokens.'
  return 'Create it at id.atlassian.com → Security → API tokens.'
})

function showMessage (text, success, duration = 5000) {
  message.value = text
  messageSuccess.value = success
  setTimeout(() => { message.value = '' }, duration)
}

function selectProvider (id) {
  if (form.value.provider === id) return
  form.value = { provider: id, config: { ...DEFAULTS[id] }, token: '' }
  projects.value = []
  lastTest.value = null
}

function draftBody () {
  return { provider: form.value.provider, config: form.value.config, token: form.value.token || undefined }
}

async function load () {
  try {
    const { data } = await api.get('/api/tracker/config')
    savedProvider.value = data.provider
    hasToken.value = data.hasToken
    form.value = { provider: data.provider, config: { ...DEFAULTS[data.provider], ...data.config }, token: '' }
  } catch (error) {
    showMessage(error.response?.data?.message || 'Failed to load tracker settings', false)
  }
}

async function testConnection () {
  testing.value = true
  lastTest.value = null
  try {
    const { data } = await api.post('/api/tracker/test', draftBody())
    lastTest.value = data
    showMessage(`Connected as ${data.user}`, true)
    const res = await api.post('/api/tracker/projects', draftBody())
    projects.value = res.data.projects || []
  } catch (error) {
    lastTest.value = { ok: false }
    showMessage(error.response?.data?.message || 'Connection failed', false, 8000)
  } finally {
    testing.value = false
  }
}

async function save () {
  saving.value = true
  try {
    const { data } = await api.put('/api/tracker/config', draftBody())
    savedProvider.value = data.provider
    hasToken.value = data.hasToken
    form.value.token = ''
    showMessage(data.provider === 'none' ? 'Tracker disconnected' : 'Settings saved', true)
  } catch (error) {
    showMessage(error.response?.data?.message || 'Failed to save settings', false)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
