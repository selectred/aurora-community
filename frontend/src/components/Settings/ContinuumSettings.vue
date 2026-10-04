<template>
  <div class="space-y-6" data-testid="page-continuum-settings">
    <div>
      <p class="text-body text-body-color">Connect Aurora to an Aurora Continuum instance to push test results automatically.</p>
    </div>

    <!-- Pro gate -->
    <div v-if="!canUseContinuum" class="card">
      <div class="card-body flex items-center gap-4 p-6">
        <div class="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
          <Lock :size="20" class="text-warning" />
        </div>
        <div>
          <h3 class="font-semibold text-heading">Pro license required</h3>
          <p class="text-sm text-muted mt-0.5">Continuum integration is available on the Pro and Unlimited plans. You are currently on the <strong>{{ appStore.licenseTierName }}</strong> plan.</p>
        </div>
      </div>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Connection -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Link2 :size="20" class="text-primary" />
            Continuum Connection
          </h2>
        </div>
        <div class="card-body space-y-4">

          <!-- Enable toggle -->
          <div class="flex items-center justify-between p-3 border border-default rounded-lg">
            <div>
              <div class="font-medium text-sm text-heading">Enable Continuum push</div>
              <div class="text-xs text-muted mt-0.5">Automatically push test results to Continuum after each run</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="form.enabled" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- URL -->
          <div>
            <label class="form-label">Continuum URL</label>
            <input
              v-model="form.url"
              type="url"
              class="form-input"
              placeholder="http://localhost:3002"
              :disabled="!form.enabled"
            />
            <p class="text-xs text-muted mt-1">Base URL of your Continuum backend API</p>
          </div>

          <!-- API Key -->
          <div>
            <label class="form-label">API Key</label>
            <div class="flex gap-2">
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                class="form-input flex-1"
                placeholder="Paste your Continuum project API key"
                :disabled="!form.enabled"
              />
              <button @click="showKey = !showKey" class="btn btn-secondary" type="button" :aria-label="showKey ? 'Hide API key' : 'Show API key'">
                <Eye v-if="!showKey" :size="16" />
                <EyeOff v-else :size="16" />
              </button>
            </div>
            <p class="text-xs text-muted mt-1">Found in Continuum under Settings → Team Management → your team → Aurora Key (key icon)</p>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              @click="saveSettings"
              :disabled="saving"
              class="btn btn-primary"
              aria-label="Save Continuum settings"
            >
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
            <button
              @click="testConnection"
              :disabled="testing || !form.url"
              class="btn btn-secondary"
              aria-label="Test Continuum connection"
            >
              {{ testing ? 'Testing...' : 'Test Connection' }}
            </button>
            <button
              @click="syncPipeline"
              :disabled="syncing || !form.enabled || !form.url"
              class="btn btn-secondary"
              title="Push your initiative and feature structure to Continuum so results route correctly"
              aria-label="Sync initiative structure to Continuum"
            >
              {{ syncing ? 'Syncing...' : 'Sync to Continuum' }}
            </button>
            <span v-if="message" class="text-sm" :class="messageSuccess ? 'text-success' : 'text-danger'">
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
              <span class="text-muted">Integration</span>
              <span :class="form.enabled ? 'badge badge-success' : 'badge badge-secondary'">
                {{ form.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Continuum URL</span>
              <span class="text-heading font-mono text-xs truncate max-w-40">{{ form.url || '—' }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">API Key</span>
              <span class="text-heading">{{ form.apiKey ? '••••••••' : '—' }}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Last test</span>
              <span :class="lastTestResult === 'ok' ? 'text-success' : lastTestResult === 'fail' ? 'text-danger' : 'text-muted'">
                {{ lastTestResult === 'ok' ? 'Connected' : lastTestResult === 'fail' ? 'Failed' : 'Not tested' }}
              </span>
            </div>
          </div>

          <p class="text-xs text-muted">
            Aurora will push test run results to Continuum via the
            <code class="font-mono bg-surface px-1 rounded">/api/imports/results</code> endpoint using your API key as a Bearer token.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Link2, Activity, Eye, EyeOff, Lock } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import api from '@/lib/api'

const appStore = useAppStore()

const canUseContinuum = computed(() =>
  appStore.licenseTier === 'pro' || appStore.licenseTier === 'unlimited'
)

const form = ref({ enabled: false, url: '', apiKey: '' })
const showKey = ref(false)
const saving = ref(false)
const testing = ref(false)
const syncing = ref(false)
const message = ref('')
const messageSuccess = ref(false)
const lastTestResult = ref(null) // null | 'ok' | 'fail'

function showMessage(text, success, duration = 4000) {
  message.value = text
  messageSuccess.value = success
  setTimeout(() => { message.value = '' }, duration)
}

async function fetchSettings() {
  try {
    const response = await api.get('/api/settings')
    const ci = response.data?.settings?.continuumIntegration
    if (ci) {
      form.value.enabled = ci.enabled ?? false
      form.value.url     = ci.url     ?? ''
      form.value.apiKey  = ci.apiKey  ?? ''
    }
  } catch (error) {
    console.error('Failed to load Continuum settings:', error)
  }
}

async function saveSettings() {
  saving.value = true
  try {
    const response = await api.put('/api/settings', {
      continuumIntegration: {
        enabled: form.value.enabled,
        url:     form.value.url,
        apiKey:  form.value.apiKey
      }
    })
    if (response.data?.success) {
      showMessage('Settings saved!', true)
    } else {
      showMessage(response.data?.message || 'Failed to save', false)
    }
  } catch (error) {
    showMessage(error.response?.data?.message || 'Failed to save settings', false)
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  lastTestResult.value = null
  try {
    const baseUrl = form.value.url.replace(/\/$/, '')
    const response = await api.post('/api/settings/test-continuum', {
      url:    baseUrl,
      apiKey: form.value.apiKey
    })
    if (response.data?.success) {
      lastTestResult.value = 'ok'
      showMessage('Connection successful!', true)
    } else {
      lastTestResult.value = 'fail'
      showMessage(response.data?.message || 'Connection failed', false)
    }
  } catch (error) {
    lastTestResult.value = 'fail'
    showMessage(error.response?.data?.message || 'Could not reach Continuum', false)
  } finally {
    testing.value = false
  }
}

async function syncPipeline() {
  syncing.value = true
  try {
    const response = await api.post('/api/settings/sync-continuum')
    if (response.data?.success) {
      showMessage(response.data.message, true)
    } else {
      showMessage(response.data?.message || 'Sync failed', false)
    }
  } catch (error) {
    showMessage(error.response?.data?.message || 'Could not sync to Continuum', false)
  } finally {
    syncing.value = false
  }
}

onMounted(fetchSettings)
</script>
