<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Configure browser environments and data retention policies</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Browser & Environment Configuration -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Monitor :size="20" class="text-info" />
            Browser & Environment Configuration
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Default Browsers</label>
            <div class="space-y-2">
              <div v-for="browser in availableBrowsers" :key="browser.id" class="flex items-center justify-between p-3 border border-default rounded-lg">
                <div class="flex items-center gap-3">
                  <component :is="browser.icon" :size="20" class="text-muted" />
                  <div>
                    <div class="font-medium text-sm text-heading">{{ browser.name }}</div>
                    <div class="text-xs text-muted">{{ browser.description }}</div>
                  </div>
                </div>
                <label class="toggle">
                  <input v-model="settings.browsers[browser.id]" type="checkbox" class="sr-only peer" />
                  <div class="toggle-track"></div>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label class="form-label">Test Environments</label>
            <div class="space-y-2">
              <div v-for="env in availableEnvironments" :key="env.id" class="flex items-center justify-between p-3 border border-default rounded-lg">
                <div>
                  <div class="font-medium text-sm text-heading">{{ env.name }}</div>
                  <div class="text-xs text-muted">{{ env.description }}</div>
                </div>
                <label class="toggle">
                  <input v-model="settings.environments[env.id]" type="checkbox" class="sr-only peer" />
                  <div class="toggle-track"></div>
                </label>
              </div>
            </div>
          </div>

          <div>
            <label class="form-label">Default Timeout (seconds)</label>
            <input
              v-model.number="settings.defaultTimeout"
              type="number"
              min="10"
              max="300"
              step="5"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">Default timeout for test execution</p>
          </div>

          <div>
            <label class="form-label">Retry Count</label>
            <input
              v-model.number="settings.retryCount"
              type="number"
              min="0"
              max="5"
              step="1"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">Number of retries for failed tests before marking as failed</p>
          </div>

          <div class="pt-2">
            <button
              @click="saveBrowserSettings"
              :disabled="savingBrowser"
              class="btn btn-primary"
            >
              {{ savingBrowser ? 'Saving...' : 'Save Browser Settings' }}
            </button>
            <span v-if="browserMessage" class="ml-3 text-sm" :class="browserSuccess ? 'text-success' : 'text-danger'">
              {{ browserMessage }}
            </span>
          </div>
        </div>
      </div>

      <!-- Data Retention -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Database :size="20" class="text-success" />
            Data Retention
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Test Results Retention (days)</label>
            <input
              v-model.number="settings.retention.testResults"
              type="number"
              min="7"
              max="365"
              step="1"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">How long to keep individual test results</p>
          </div>

          <div>
            <label class="form-label">Failure Evidence Retention (days)</label>
            <input
              v-model.number="evidenceSettings.evidenceRetentionDays"
              type="number"
              min="1"
              max="365"
              step="1"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">How long to keep failure evidence bundles (screenshot/video/trace) before the daily cleanup job prunes them</p>
          </div>

          <div>
            <label class="form-label">RAG Red Threshold (%)</label>
            <input
              v-model.number="evidenceSettings.ragRedThresholdPct"
              type="number"
              min="1"
              max="99"
              step="1"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">A Feature's pass rate below this drops its health status to Red on the Test Health report</p>
          </div>

          <div>
            <label class="form-label">Aggregated Metrics Retention (days)</label>
            <input
              v-model.number="settings.retention.metrics"
              type="number"
              min="30"
              max="730"
              step="30"
              class="form-input w-24"
            />
            <p class="text-xs text-muted mt-1">How long to keep aggregated metrics and trends</p>
          </div>

          <div class="flex items-center justify-between p-3 border border-default rounded-lg">
            <div>
              <div class="font-medium text-sm text-heading">Auto-cleanup Enabled</div>
              <div class="text-xs text-muted mt-0.5">Automatically delete old data based on retention settings</div>
            </div>
            <label class="toggle">
              <input v-model="settings.retention.autoCleanup" type="checkbox" class="sr-only peer" />
              <div class="toggle-track"></div>
            </label>
          </div>

          <div>
            <label class="form-label">Cleanup Schedule (Cron Expression)</label>
            <input
              v-model="settings.retention.cleanupSchedule"
              type="text"
              placeholder="0 2 * * *"
              class="form-input max-w-xs"
            />
            <p class="text-xs text-muted mt-1">Default: Daily at 2 AM. Format: minute hour day month weekday</p>
          </div>

          <div class="pt-2">
            <button
              @click="saveRetentionSettings"
              :disabled="savingRetention"
              class="btn btn-primary"
            >
              {{ savingRetention ? 'Saving...' : 'Save Retention Settings' }}
            </button>
            <span v-if="retentionMessage" class="ml-3 text-sm" :class="retentionSuccess ? 'text-success' : 'text-danger'">
              {{ retentionMessage }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Monitor, Database, Globe, Smartphone } from 'lucide-vue-next'
import api from '@/lib/api'

const savingBrowser = ref(false)
const savingRetention = ref(false)

// Real, backend-persisted evidence settings (the rest of this panel's fields below are
// still a UI-only mock — see saveBrowserSettings/saveRetentionSettings)
const evidenceSettings = ref({ evidenceRetentionDays: 30, ragRedThresholdPct: 50 })

onMounted(async () => {
  try {
    const { data } = await api.get('/api/settings')
    if (data.success && data.settings.evidenceSettings) {
      evidenceSettings.value = {
        evidenceRetentionDays: data.settings.evidenceSettings.evidenceRetentionDays,
        ragRedThresholdPct: data.settings.evidenceSettings.ragRedThresholdPct
      }
    }
  } catch (e) {
    console.error('Failed to load evidence settings:', e)
  }
})

const browserMessage = ref('')
const browserSuccess = ref(false)
const retentionMessage = ref('')
const retentionSuccess = ref(false)

const availableBrowsers = [
  { id: 'chromium', name: 'Chromium', description: 'Chrome-based browser engine', icon: Globe },
  { id: 'firefox', name: 'Firefox', description: 'Mozilla Firefox browser', icon: Globe },
  { id: 'webkit', name: 'WebKit', description: 'Safari browser engine', icon: Globe },
  { id: 'mobile', name: 'Mobile Chrome', description: 'Mobile device emulation', icon: Smartphone }
]

const availableEnvironments = [
  { id: 'development', name: 'Development', description: 'Local development environment' },
  { id: 'staging', name: 'Staging', description: 'Pre-production staging environment' },
  { id: 'production', name: 'Production', description: 'Live production environment' }
]

const settings = ref({
  browsers: {
    chromium: true,
    firefox: true,
    webkit: false,
    mobile: false
  },
  environments: {
    development: true,
    staging: true,
    production: false
  },
  defaultTimeout: 30,
  retryCount: 2,
  retention: {
    testResults: 90,
    metrics: 365,
    autoCleanup: true,
    cleanupSchedule: '0 2 * * *'
  }
})

async function saveBrowserSettings() {
  savingBrowser.value = true
  browserMessage.value = ''

  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    browserSuccess.value = true
    browserMessage.value = 'Saved!'
  } catch (error) {
    browserSuccess.value = false
    browserMessage.value = 'Failed to save'
  } finally {
    savingBrowser.value = false
    setTimeout(() => { browserMessage.value = '' }, 3000)
  }
}

async function saveRetentionSettings() {
  savingRetention.value = true
  retentionMessage.value = ''

  try {
    // Only evidenceSettings is real/backend-persisted today — the rest of this card's
    // fields (testResults/metrics retention, autoCleanup, cleanupSchedule) are still a
    // UI-only mock, unchanged by this save.
    await api.put('/api/settings', { evidenceSettings: evidenceSettings.value })
    retentionSuccess.value = true
    retentionMessage.value = 'Saved!'
  } catch (error) {
    retentionSuccess.value = false
    retentionMessage.value = 'Failed to save'
  } finally {
    savingRetention.value = false
    setTimeout(() => { retentionMessage.value = '' }, 3000)
  }
}
</script>
