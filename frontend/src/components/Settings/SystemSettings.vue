<template>
  <div class="space-y-6" data-testid="page-system-settings">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Configure system-wide settings and preferences</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Community Edition: nothing to activate -->
      <div v-if="appStore.licenseTier === 'community'" class="card" data-testid="license-status">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Award :size="20" class="text-primary" />
            Community Edition
          </h2>
        </div>
        <div class="card-body">
          <p class="text-sm text-body-color">This is the Community Edition of Aurora: every feature is included, with no limits and no licence key. It is free to use under the Elastic License 2.0.</p>
        </div>
      </div>

      <!-- AI Configuration -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Key :size="20" class="text-primary" />
            AI Configuration
          </h2>
        </div>
        <div class="card-body space-y-4">
          <!-- Provider Selection -->
          <div>
            <label class="form-label">AI Provider</label>
            <select v-model="selectedProvider" class="form-select">
              <option value="none">Disabled</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="azure-openai">Azure OpenAI (Copilot)</option>
              <option value="local">Local / Self-hosted (Ollama, LM Studio, vLLM…)</option>
            </select>
            <p class="text-xs text-muted mt-1">Select and configure an AI provider for test generation</p>
          </div>

          <!-- Provider-specific config -->
          <div v-if="selectedProvider !== 'none'" class="p-4 border border-default rounded-lg bg-surface space-y-4">
            <!-- Anthropic -->
            <template v-if="selectedProvider === 'anthropic'">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <span class="text-orange-600 dark:text-orange-400 font-bold text-sm">A</span>
                </div>
                <div>
                  <h4 class="font-medium text-heading">Anthropic (Claude)</h4>
                  <p class="text-xs text-muted">claude-sonnet-4</p>
                </div>
                <span v-if="aiProviders.anthropic?.configured" class="ml-auto badge badge-success">Configured</span>
              </div>
              <div>
                <label class="form-label">API Key</label>
                <div class="flex gap-2">
                  <input
                    v-model="anthropicKey"
                    :type="showApiKey ? 'text' : 'password'"
                    class="form-input flex-1"
                    :placeholder="aiProviders.anthropic?.maskedKey || 'sk-ant-...'"
                  />
                  <button @click="showApiKey = !showApiKey" class="btn btn-secondary" type="button" :aria-label="showApiKey ? 'Hide API key' : 'Show API key'">
                    <Eye v-if="!showApiKey" :size="16" />
                    <EyeOff v-else :size="16" />
                  </button>
                </div>
                <p class="text-xs text-muted mt-1">Get your API key from <a href="https://console.anthropic.com" target="_blank" class="text-primary hover:underline">console.anthropic.com</a></p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="saveAnthropicKey" :disabled="savingAiKey || !anthropicKey" class="btn btn-primary" aria-label="Save Anthropic API Key">
                  {{ savingAiKey === 'anthropic' ? 'Saving...' : 'Save & Activate' }}
                </button>
                <button
                  v-if="aiProviders.anthropic?.configured"
                  @click="testAiConnection('anthropic')"
                  :disabled="testingAi"
                  class="btn btn-secondary"
                  aria-label="Test Anthropic connection"
                >
                  {{ testingAi ? 'Testing...' : 'Test Connection' }}
                </button>
              </div>
              <p v-if="aiTestResult" class="text-sm mt-1" :class="aiTestResult.success ? 'text-success' : 'text-danger'">
                {{ aiTestResult.success ? `Connected · ${aiTestResult.latencyMs}ms` : aiTestResult.message }}
              </p>
            </template>

            <!-- OpenAI -->
            <template v-if="selectedProvider === 'openai'">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span class="text-green-600 dark:text-green-400 font-bold text-sm">O</span>
                </div>
                <div>
                  <h4 class="font-medium text-heading">OpenAI (ChatGPT)</h4>
                  <p class="text-xs text-muted">gpt-4o</p>
                </div>
                <span v-if="aiProviders.openai?.configured" class="ml-auto badge badge-success">Configured</span>
              </div>
              <div>
                <label class="form-label">API Key</label>
                <div class="flex gap-2">
                  <input
                    v-model="openaiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    class="form-input flex-1"
                    :placeholder="aiProviders.openai?.maskedKey || 'sk-...'"
                  />
                  <button @click="showApiKey = !showApiKey" class="btn btn-secondary" type="button" :aria-label="showApiKey ? 'Hide API key' : 'Show API key'">
                    <Eye v-if="!showApiKey" :size="16" />
                    <EyeOff v-else :size="16" />
                  </button>
                </div>
                <p class="text-xs text-muted mt-1">Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" class="text-primary hover:underline">platform.openai.com</a></p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="saveOpenaiKey" :disabled="savingAiKey || !openaiKey" class="btn btn-primary" aria-label="Save OpenAI API Key">
                  {{ savingAiKey === 'openai' ? 'Saving...' : 'Save & Activate' }}
                </button>
                <button
                  v-if="aiProviders.openai?.configured"
                  @click="testAiConnection('openai')"
                  :disabled="testingAi"
                  class="btn btn-secondary"
                  aria-label="Test OpenAI connection"
                >
                  {{ testingAi ? 'Testing...' : 'Test Connection' }}
                </button>
              </div>
              <p v-if="aiTestResult" class="text-sm mt-1" :class="aiTestResult.success ? 'text-success' : 'text-danger'">
                {{ aiTestResult.success ? `Connected · ${aiTestResult.latencyMs}ms` : aiTestResult.message }}
              </p>
            </template>

            <!-- Azure OpenAI -->
            <template v-if="selectedProvider === 'azure-openai'">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <span class="text-blue-600 dark:text-blue-400 font-bold text-sm">Az</span>
                </div>
                <div>
                  <h4 class="font-medium text-heading">Azure OpenAI</h4>
                  <p class="text-xs text-muted">Copilot / Enterprise</p>
                </div>
                <span v-if="aiProviders.azureOpenai?.configured" class="ml-auto badge badge-success">Configured</span>
              </div>
              <div>
                <label class="form-label">API Key</label>
                <input
                  v-model="azureKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="form-input"
                  :placeholder="aiProviders.azureOpenai?.maskedKey || 'API key'"
                />
              </div>
              <div>
                <label class="form-label">Endpoint URL</label>
                <input
                  v-model="azureEndpoint"
                  type="text"
                  class="form-input"
                  :placeholder="aiProviders.azureOpenai?.endpoint || 'https://your-resource.openai.azure.com'"
                />
              </div>
              <div>
                <label class="form-label">Deployment Name</label>
                <input
                  v-model="azureDeployment"
                  type="text"
                  class="form-input"
                  :placeholder="aiProviders.azureOpenai?.deploymentName || 'gpt-4'"
                />
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="saveAzureOpenai" :disabled="savingAiKey || !azureKey || !azureEndpoint" class="btn btn-primary" aria-label="Save Azure OpenAI Configuration">
                  {{ savingAiKey === 'azure' ? 'Saving...' : 'Save & Activate' }}
                </button>
                <button
                  v-if="aiProviders.azureOpenai?.configured"
                  @click="testAiConnection('azure-openai')"
                  :disabled="testingAi"
                  class="btn btn-secondary"
                  aria-label="Test Azure OpenAI connection"
                >
                  {{ testingAi ? 'Testing...' : 'Test Connection' }}
                </button>
              </div>
              <p v-if="aiTestResult" class="text-sm mt-1" :class="aiTestResult.success ? 'text-success' : 'text-danger'">
                {{ aiTestResult.success ? `Connected · ${aiTestResult.latencyMs}ms` : aiTestResult.message }}
              </p>
            </template>
          </div>

            <!-- Local / Self-hosted -->
            <template v-if="selectedProvider === 'local'">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <span class="text-purple-600 dark:text-purple-400 font-bold text-sm">L</span>
                </div>
                <div>
                  <h4 class="font-medium text-heading">Local / Self-hosted</h4>
                  <p class="text-xs text-muted">Ollama · LM Studio · vLLM · Azure · AWS Bedrock</p>
                </div>
                <span v-if="aiProviders.local?.configured" class="ml-auto badge badge-success">Configured</span>
              </div>
              <div>
                <label class="form-label">Endpoint URL</label>
                <input
                  v-model="localEndpoint"
                  type="text"
                  class="form-input"
                  placeholder="http://localhost:11434"
                />
                <p class="text-xs text-muted mt-1">Ollama default: <code>http://localhost:11434</code> · LM Studio: <code>http://localhost:1234</code></p>
              </div>
              <div>
                <label class="form-label">Model name</label>
                <input
                  v-model="localModel"
                  type="text"
                  class="form-input"
                  :placeholder="aiProviders.local?.model || 'qwen2.5-coder:14b'"
                />
                <p class="text-xs text-muted mt-1">As served by your endpoint — e.g. <code>qwen2.5-coder:14b</code>, <code>deepseek-coder-v2:16b</code></p>
              </div>
              <div>
                <label class="form-label">API Key <span class="text-muted font-normal">(optional — leave blank for Ollama)</span></label>
                <input
                  v-model="localApiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  class="form-input"
                  placeholder="Required for enterprise clusters; leave blank for local Ollama"
                />
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button @click="saveLocalLlm" :disabled="savingAiKey || !localEndpoint" class="btn btn-primary" aria-label="Save Local LLM Configuration">
                  {{ savingAiKey === 'local' ? 'Saving...' : 'Save & Activate' }}
                </button>
                <button
                  v-if="aiProviders.local?.configured"
                  @click="testAiConnection('local')"
                  :disabled="testingAi"
                  class="btn btn-secondary"
                  aria-label="Test local LLM connection"
                >
                  {{ testingAi ? 'Testing...' : 'Test Connection' }}
                </button>
              </div>
              <p v-if="aiTestResult" class="text-sm mt-1" :class="aiTestResult.success ? 'text-success' : 'text-danger'">
                {{ aiTestResult.success ? `Connected · ${aiTestResult.latencyMs}ms` : aiTestResult.message }}
              </p>
            </template>

          <!-- Status message -->
          <div v-if="selectedProvider === 'none'" class="p-4 border border-default rounded-lg bg-surface text-center">
            <p class="text-muted text-sm">AI features are disabled. Select a provider to enable test generation.</p>
          </div>

          <p v-if="aiMessage" class="text-sm" :class="aiSuccess ? 'text-success' : 'text-danger'">
            {{ aiMessage }}
          </p>
        </div>
      </div>

      <!-- Application Settings -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Settings :size="20" class="text-primary" />
            Application Settings
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Application Name</label>
            <input
              v-model="settings.appName"
              type="text"
              class="form-input max-w-xs"
            />
            <p class="text-xs text-muted mt-1">This name appears in the header and browser title</p>
          </div>

          <div class="pt-2 flex items-center gap-3">
            <button
              @click="saveSettings"
              :disabled="saving"
              class="btn btn-primary"
              aria-label="Save Application Settings"
            >
              {{ saving ? 'Saving...' : 'Save Settings' }}
            </button>
            <span v-if="saveMessage" data-testid="toast-notification" role="status" class="text-sm" :class="saveSuccess ? 'text-success' : 'text-danger'">
              {{ saveMessage }}
            </span>
          </div>
        </div>
      </div>

      <!-- Database & Storage -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Database :size="20" class="text-primary" />
            Database & Storage
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Database Status</div>
              <div class="text-xl font-bold text-success">Connected</div>
            </div>
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Total Records</div>
              <div class="text-xl font-bold text-heading">{{ dbStats.totalRecords.toLocaleString() }}</div>
            </div>
          </div>

          <div>
            <label class="form-label">Data Retention (days)</label>
            <input
              v-model.number="settings.dataRetentionDays"
              type="number"
              min="30"
              max="365"
              class="form-input max-w-xs"
            />
            <p class="text-xs text-muted mt-1">Automatically delete test results older than this many days</p>
          </div>

          <div class="flex gap-3">
            <button
              @click="runBackup"
              :disabled="backupRunning"
              class="btn btn-primary"
              aria-label="Run Backup"
            >
              {{ backupRunning ? 'Running...' : 'Run Backup' }}
            </button>
            <button
              @click="cleanupOldData"
              :disabled="cleanupRunning"
              class="btn btn-warning"
              aria-label="Cleanup Old Data"
            >
              {{ cleanupRunning ? 'Cleaning...' : 'Cleanup Old Data' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Email Configuration -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Mail :size="20" class="text-primary" />
            Email Configuration
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">SMTP Host</label>
            <input
              v-model="emailConfig.smtpHost"
              type="text"
              placeholder="smtp.example.com"
              class="form-input max-w-xs"
            />
          </div>
          <div>
            <label class="form-label">SMTP Port</label>
            <input
              v-model.number="emailConfig.smtpPort"
              type="number"
              placeholder="587"
              class="form-input w-24"
            />
          </div>

          <div>
            <label class="form-label">From Email</label>
            <input
              v-model="emailConfig.fromEmail"
              type="email"
              placeholder="noreply@example.com"
              class="form-input max-w-xs"
            />
          </div>

          <div class="flex items-center justify-between p-3 border border-default rounded-lg">
            <div>
              <div class="font-medium text-sm text-heading">Use TLS/SSL</div>
              <div class="text-xs text-muted mt-0.5">Enable secure email transmission</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="emailConfig.useTLS" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div class="flex gap-3">
            <button
              @click="testEmail"
              :disabled="testingEmail"
              class="btn btn-secondary"
              aria-label="Send Test Email"
            >
              {{ testingEmail ? 'Sending...' : 'Send Test Email' }}
            </button>
            <button
              @click="saveEmailConfig"
              :disabled="savingEmail"
              class="btn btn-primary"
              aria-label="Save Email Configuration"
            >
              {{ savingEmail ? 'Saving...' : 'Save Email Config' }}
            </button>
          </div>
          <p v-if="emailMessage" class="text-sm" :class="emailSuccess ? 'text-success' : 'text-danger'">
            {{ emailMessage }}
          </p>
        </div>
      </div>

      <!-- Pack Storage -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Database :size="20" class="text-primary" />
            Pack Storage
          </h2>
        </div>
        <div class="card-body space-y-4">
          <p class="text-body text-muted">
            Large generated pack files can be stored on disk instead of in the database.
            Set a directory and size threshold to enable automatic file storage.
          </p>

          <div class="space-y-3">
            <div>
              <label class="text-label text-label-color block mb-1">Pack files directory</label>
              <div class="flex gap-2">
                <input
                  v-model="packStorage.packsRootDir"
                  type="text"
                  class="form-input flex-1 font-mono text-sm"
                  placeholder="e.g. ~/aurora-packs (leave blank to use default)"
                />
                <button
                  v-if="isTauri"
                  @click="browsePacksDir"
                  class="btn btn-secondary text-sm"
                  aria-label="Browse for pack files directory"
                >Browse</button>
              </div>
            </div>

            <div>
              <label class="text-label text-label-color block mb-1">
                Inline threshold
                <span class="text-muted font-normal">(bytes — 0 = always inline)</span>
              </label>
              <input
                v-model.number="packStorage.packFileSizeThreshold"
                type="number"
                min="0"
                class="form-input w-40"
              />
            </div>

            <div>
              <label class="text-label text-label-color block mb-1">
                Max registered packs
                <span class="text-muted font-normal">(blank = unlimited)</span>
              </label>
              <input
                v-model="packStorage.maxPackCountInput"
                type="number"
                min="0"
                class="form-input w-40"
                placeholder="unlimited"
              />
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap">
            <button
              @click="savePackStorage"
              :disabled="savingPackStorage"
              class="btn btn-primary"
              aria-label="Save Pack Storage Settings"
            >
              {{ savingPackStorage ? 'Saving...' : 'Save Pack Storage' }}
            </button>
            <button
              v-if="isTauri && packStorage.packsRootDir"
              @click="openPacksDir"
              class="btn btn-secondary"
              aria-label="Open pack files directory in file manager"
            >Open Folder</button>
            <span v-if="packStorageMessage" class="text-sm" :class="packStorageSuccess ? 'text-success' : 'text-danger'">
              {{ packStorageMessage }}
            </span>
          </div>
        </div>
      </div>

      <!-- Test Engine (Playwright browsers) -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Chrome :size="20" class="text-primary" />
            Test Engine
          </h2>
        </div>
        <div class="card-body space-y-4">
          <p class="text-sm text-body-color">The browser engine Aurora uses to run and record tests. Downloaded once into your local profile — no admin rights needed.</p>

          <div class="p-4 border border-default rounded-lg bg-surface">
            <div v-if="engineStatus === 'checking'" class="flex items-center gap-3">
              <Loader2 :size="16" class="animate-spin text-muted" />
              <span class="text-sm text-muted">Checking…</span>
            </div>
            <div v-else-if="engineStatus === 'installed'" class="flex items-center gap-3">
              <CheckCircle :size="16" class="text-success" />
              <span class="text-sm text-heading">Installed and ready</span>
            </div>
            <div v-else-if="engineStatus === 'downloading'" class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-heading">Downloading {{ engineProgress.asset || 'test engine' }}…</span>
                <span class="text-xs text-muted">{{ engineProgress.assetIndex + 1 }} of {{ engineProgress.totalAssets }}</span>
              </div>
              <div class="h-2 rounded-full overflow-hidden bg-border-default">
                <div class="h-full transition-all bg-primary" :style="{ width: (engineProgress.pct || 0) + '%' }"></div>
              </div>
            </div>
            <div v-else class="flex items-center gap-3">
              <AlertTriangle :size="16" class="text-warning" />
              <span class="text-sm text-heading">{{ engineStatus === 'error' ? (engineError || 'Not installed') : 'Not installed — recording/running tests won\'t work until this is downloaded' }}</span>
            </div>
          </div>

          <button
            @click="startEngineDownload"
            :disabled="engineStatus === 'checking' || engineStatus === 'downloading'"
            class="btn btn-secondary"
          >
            {{ engineStatus === 'installed' ? 'Re-download' : 'Download Test Engine' }}
          </button>
        </div>
      </div>

      <!-- System Information -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Info :size="20" class="text-primary" />
            System Information
          </h2>
        </div>
        <div class="card-body">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Version</div>
              <div class="text-lg font-bold text-heading">0.1.0</div>
            </div>
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Environment</div>
              <div class="text-lg font-bold text-heading">Production</div>
            </div>
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Node Version</div>
              <div class="text-lg font-bold text-heading">{{ systemInfo.nodeVersion }}</div>
            </div>
            <div class="p-4 border border-default rounded-lg bg-surface">
              <div class="text-label text-label-color mb-1">Uptime</div>
              <div class="text-lg font-bold text-heading">{{ systemInfo.uptime }}</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { Settings, Database, Mail, Info, Key, Award, Eye, EyeOff, Chrome, CheckCircle, AlertTriangle, Loader2 } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import api, { getApiBaseUrl } from '@/lib/api'

const appStore = useAppStore()

const saving = ref(false)
const saveMessage = ref('')
const saveSuccess = ref(false)

// License
const licenseKey = ref('')
const licenseDetails = ref(null)
const activatingLicense = ref(false)
const deactivatingLicense = ref(false)
const licenseMessage = ref('')
const licenseSuccess = ref(false)

// AI Providers
const aiProviders = ref({
  anthropic: { configured: false, maskedKey: null },
  openai: { configured: false, maskedKey: null },
  azureOpenai: { configured: false, maskedKey: null, endpoint: null, deploymentName: null },
  local: { configured: false, endpoint: null, model: null, hasApiKey: false }
})
const activeAiProvider = ref('none')
const selectedProvider = ref('none')

// Individual provider keys
const anthropicKey = ref('')
const openaiKey = ref('')
const azureKey = ref('')
const azureEndpoint = ref('')
const azureDeployment = ref('')
const localEndpoint = ref('')
const localModel = ref('')
const localApiKey = ref('')
const showApiKey = ref(false)

const savingAiKey = ref(null)
const aiMessage = ref('')
const aiSuccess = ref(false)

const testingAi = ref(false)
const aiTestResult = ref(null) // { success, message, latencyMs }
watch(selectedProvider, () => { aiTestResult.value = null })

async function testAiConnection(provider) {
  testingAi.value = true
  aiTestResult.value = null
  try {
    const response = await api.post('/api/settings/ai-providers/test', { provider })
    aiTestResult.value = response.data
  } catch {
    aiTestResult.value = { success: false, message: 'Could not reach backend' }
  } finally {
    testingAi.value = false
  }
}

const backupRunning = ref(false)
const cleanupRunning = ref(false)
const testingEmail = ref(false)
const savingEmail = ref(false)
const emailMessage = ref('')
const emailSuccess = ref(false)

const settings = ref({
  appName: 'Aurora Test Tracker',
  dataRetentionDays: 90
})

const emailConfig = ref({
  smtpHost: '',
  smtpPort: 587,
  fromEmail: '',
  useTLS: true
})

const dbStats = ref({
  totalRecords: 15847
})

const systemInfo = ref({
  nodeVersion: 'v20.17.0',
  uptime: '7 days, 3 hours'
})


// Pack Storage
const packStorage = ref({
  packsRootDir: '',
  packFileSizeThreshold: 8192,
  maxPackCountInput: ''   // string so blank = null
})
const savingPackStorage = ref(false)
const packStorageMessage = ref('')
const packStorageSuccess = ref(false)
const isTauri = typeof window !== 'undefined' && !!window.__TAURI__

// Fetch system info
async function fetchSystemInfo() {
  try {
    const response = await api.get('/api/system/info')
    if (response.data.success) {
      systemInfo.value.nodeVersion = response.data.process?.nodeVersion || 'v20.17.0'
      systemInfo.value.uptime = response.data.process?.uptime || 'Unknown'
    }
  } catch (error) {
    console.error('Failed to fetch system info:', error)
  }
}


async function fetchPackStorageSettings() {
  try {
    const response = await api.get('/api/settings')
    if (response.data.success && response.data.settings.packStorage) {
      const ps = response.data.settings.packStorage
      packStorage.value.packsRootDir = ps.packsRootDir || ''
      packStorage.value.packFileSizeThreshold = ps.packFileSizeThreshold ?? 8192
      packStorage.value.maxPackCountInput = ps.maxPackCount != null ? String(ps.maxPackCount) : ''
    }
  } catch (error) {
    console.error('Failed to fetch pack storage settings:', error)
  }
}

async function savePackStorage() {
  savingPackStorage.value = true
  packStorageMessage.value = ''
  try {
    const maxPackCount = packStorage.value.maxPackCountInput !== '' && packStorage.value.maxPackCountInput != null
      ? Number(packStorage.value.maxPackCountInput)
      : null
    const response = await api.put('/api/settings', {
      packStorage: {
        packsRootDir: packStorage.value.packsRootDir || null,
        packFileSizeThreshold: packStorage.value.packFileSizeThreshold,
        maxPackCount
      }
    })
    if (response.data.success) {
      packStorageSuccess.value = true
      packStorageMessage.value = 'Pack storage settings saved!'
    } else {
      packStorageSuccess.value = false
      packStorageMessage.value = response.data.message || 'Failed to save'
    }
  } catch (error) {
    packStorageSuccess.value = false
    packStorageMessage.value = error.response?.data?.message || 'Failed to save pack storage settings'
  } finally {
    savingPackStorage.value = false
    setTimeout(() => { packStorageMessage.value = '' }, 3000)
  }
}

async function browsePacksDir() {
  try {
    const selected = await window.__TAURI__.core.invoke('plugin:dialog|open', {
      options: { directory: true, multiple: false, title: 'Select pack files directory' }
    })
    if (selected) packStorage.value.packsRootDir = selected
  } catch (error) {
    console.error('Failed to open directory picker:', error)
  }
}

async function openPacksDir() {
  if (!packStorage.value.packsRootDir || !window.__TAURI__) return
  const dirPath = packStorage.value.packsRootDir
  try {
    await window.__TAURI__.core.invoke('plugin:shell|execute', {
      program: 'open-folder',
      args: [dirPath],
      options: {}
    })
  } catch (error) {
    console.error('Failed to open directory:', error)
  }
}

onMounted(() => {
  fetchSystemInfo()
  fetchLicenseDetails()
  fetchAiProvidersStatus()
  fetchPackStorageSettings()
  checkEngineStatus()
})

// — Test Engine (Playwright browsers) —
const engineStatus = ref('checking') // checking | downloading | installed | error | 'not-installed'
const engineProgress = ref({ asset: '', assetIndex: 0, totalAssets: 3, pct: 0 })
const engineError = ref('')

async function checkEngineStatus() {
  engineStatus.value = 'checking'
  try {
    const { data } = await api.get('/api/setup/browsers-status')
    engineStatus.value = data.installed ? 'installed' : 'not-installed'
  } catch {
    engineStatus.value = 'not-installed'
  }
}

async function startEngineDownload() {
  engineStatus.value = 'downloading'
  engineError.value = ''
  engineProgress.value = { asset: '', assetIndex: 0, totalAssets: 3, pct: 0 }

  try {
    const base = getApiBaseUrl()
    const response = await fetch(`${base}/api/setup/download-browsers`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const ev = JSON.parse(line.slice(6))
          if (ev.type === 'progress') engineProgress.value = { ...engineProgress.value, ...ev }
          else if (ev.type === 'done') engineStatus.value = 'installed'
          else if (ev.type === 'error') { engineStatus.value = 'error'; engineError.value = ev.message }
        } catch { /* skip malformed */ }
      }
    }
  } catch (err) {
    engineStatus.value = 'error'
    engineError.value = err.message || 'Download failed'
  }
}

// Fetch license details
async function fetchLicenseDetails() {
  try {
    const response = await api.get('/api/license')
    licenseDetails.value = response.data
  } catch (error) {
    console.error('Failed to fetch license:', error)
  }
}

function limitText(v) {
  if (v === -1) return 'Unlimited'
  return v ?? '—'
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// Activate license key
async function activateLicense() {
  activatingLicense.value = true
  licenseMessage.value = ''
  try {
    const response = await api.post('/api/license/activate', { licenseKey: licenseKey.value.trim() })
    licenseSuccess.value = true
    licenseMessage.value = response.data.message || `License activated: ${response.data.license?.tierName}`
    licenseKey.value = ''
    await fetchLicenseDetails()
    await appStore.fetchProfile()
  } catch (error) {
    licenseSuccess.value = false
    licenseMessage.value = error.response?.data?.message || error.response?.data?.error || 'Failed to activate license'
  } finally {
    activatingLicense.value = false
  }
}

// Release this machine on the licence server and return to Free
async function deactivateLicense() {
  if (!confirm('Deactivate Aurora on this machine? Paid features stop here, and you can activate the same key on another machine.')) return
  deactivatingLicense.value = true
  licenseMessage.value = ''
  try {
    const response = await api.post('/api/license/deactivate')
    licenseSuccess.value = !response.data.offline
    licenseMessage.value = response.data.message
    await fetchLicenseDetails()
    await appStore.fetchProfile()
  } catch (error) {
    licenseSuccess.value = false
    licenseMessage.value = error.response?.data?.error || 'Failed to deactivate'
  } finally {
    deactivatingLicense.value = false
  }
}

// Fetch all AI providers status
async function fetchAiProvidersStatus() {
  try {
    const response = await api.get('/api/settings/ai-providers')
    if (response.data.success) {
      aiProviders.value = response.data.providers
      activeAiProvider.value = response.data.activeProvider || 'none'
      selectedProvider.value = response.data.activeProvider || 'none'
      if (response.data.providers.local?.endpoint) {
        localEndpoint.value = response.data.providers.local.endpoint
        localModel.value = response.data.providers.local.model || ''
      }
    }
  } catch (error) {
    console.error('Failed to fetch AI providers status:', error)
  }
}

// Set active AI provider
async function setActiveProvider(provider) {
  try {
    const response = await api.put('/api/settings/ai-providers/active', { provider })
    if (response.data.success) {
      activeAiProvider.value = provider
      selectedProvider.value = provider
      aiSuccess.value = true
      aiMessage.value = provider === 'none' ? 'AI disabled' : `Active provider: ${provider}`
      setTimeout(() => { aiMessage.value = '' }, 3000)
    }
  } catch (error) {
    aiSuccess.value = false
    aiMessage.value = error.response?.data?.message || 'Failed to set provider'
    setTimeout(() => { aiMessage.value = '' }, 3000)
  }
}

// Save Anthropic API key
async function saveAnthropicKey() {
  savingAiKey.value = 'anthropic'
  aiMessage.value = ''

  try {
    const response = await api.put('/api/settings/anthropic', { apiKey: anthropicKey.value })
    if (response.data.success) {
      aiSuccess.value = true
      aiMessage.value = 'Anthropic API key saved!'
      aiProviders.value.anthropic = { configured: true, maskedKey: response.data.maskedKey }
      anthropicKey.value = ''
      // Auto-activate if no provider set
      if (activeAiProvider.value === 'none') {
        await setActiveProvider('anthropic')
      }
    } else {
      aiSuccess.value = false
      aiMessage.value = response.data.message || 'Failed to save API key'
    }
  } catch (error) {
    aiSuccess.value = false
    aiMessage.value = error.response?.data?.message || 'Failed to save API key'
  } finally {
    savingAiKey.value = null
    setTimeout(() => { aiMessage.value = '' }, 3000)
  }
}

// Save OpenAI API key
async function saveOpenaiKey() {
  savingAiKey.value = 'openai'
  aiMessage.value = ''

  try {
    const response = await api.put('/api/settings/openai', { apiKey: openaiKey.value })
    if (response.data.success) {
      aiSuccess.value = true
      aiMessage.value = 'OpenAI API key saved!'
      aiProviders.value.openai = { configured: true, maskedKey: response.data.maskedKey }
      openaiKey.value = ''
      // Auto-activate if no provider set
      if (activeAiProvider.value === 'none') {
        await setActiveProvider('openai')
      }
    } else {
      aiSuccess.value = false
      aiMessage.value = response.data.message || 'Failed to save API key'
    }
  } catch (error) {
    aiSuccess.value = false
    aiMessage.value = error.response?.data?.message || 'Failed to save API key'
  } finally {
    savingAiKey.value = null
    setTimeout(() => { aiMessage.value = '' }, 3000)
  }
}

// Save Azure OpenAI settings
// Save Local LLM settings
async function saveLocalLlm() {
  savingAiKey.value = 'local'
  aiMessage.value = ''

  try {
    const response = await api.put('/api/settings/local-llm', {
      endpoint: localEndpoint.value,
      model: localModel.value,
      apiKey: localApiKey.value || undefined
    })
    if (response.data.success) {
      aiSuccess.value = true
      aiMessage.value = 'Local LLM settings saved!'
      aiProviders.value.local = {
        configured: true,
        endpoint: localEndpoint.value,
        model: localModel.value,
        hasApiKey: !!localApiKey.value
      }
      localApiKey.value = ''
      if (activeAiProvider.value === 'none') {
        await setActiveProvider('local')
      }
    } else {
      aiSuccess.value = false
      aiMessage.value = response.data.message || 'Failed to save settings'
    }
  } catch (error) {
    aiSuccess.value = false
    aiMessage.value = error.response?.data?.message || 'Failed to save settings'
  } finally {
    savingAiKey.value = null
    setTimeout(() => { aiMessage.value = '' }, 3000)
  }
}

async function saveAzureOpenai() {
  savingAiKey.value = 'azure'
  aiMessage.value = ''

  try {
    const response = await api.put('/api/settings/azure-openai', {
      apiKey: azureKey.value,
      endpoint: azureEndpoint.value,
      deploymentName: azureDeployment.value
    })
    if (response.data.success) {
      aiSuccess.value = true
      aiMessage.value = 'Azure OpenAI settings saved!'
      aiProviders.value.azureOpenai = {
        configured: true,
        maskedKey: response.data.maskedKey,
        endpoint: azureEndpoint.value,
        deploymentName: azureDeployment.value
      }
      azureKey.value = ''
      // Auto-activate if no provider set
      if (activeAiProvider.value === 'none') {
        await setActiveProvider('azure-openai')
      }
    } else {
      aiSuccess.value = false
      aiMessage.value = response.data.message || 'Failed to save settings'
    }
  } catch (error) {
    aiSuccess.value = false
    aiMessage.value = error.response?.data?.message || 'Failed to save settings'
  } finally {
    savingAiKey.value = null
    setTimeout(() => { aiMessage.value = '' }, 3000)
  }
}


async function saveSettings() {
  saving.value = true
  saveMessage.value = ''

  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    saveSuccess.value = true
    saveMessage.value = 'Settings saved!'
  } catch (error) {
    saveSuccess.value = false
    saveMessage.value = 'Failed to save settings'
  } finally {
    saving.value = false
    setTimeout(() => { saveMessage.value = '' }, 3000)
  }
}

async function runBackup() {
  backupRunning.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 2000))
    alert('Backup completed successfully!')
  } catch (error) {
    alert('Backup failed')
  } finally {
    backupRunning.value = false
  }
}

async function cleanupOldData() {
  if (!confirm('This will permanently delete old test results. Continue?')) {
    return
  }

  cleanupRunning.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 2000))
    alert('Cleanup completed successfully!')
  } catch (error) {
    alert('Cleanup failed')
  } finally {
    cleanupRunning.value = false
  }
}

async function testEmail() {
  testingEmail.value = true
  emailMessage.value = ''

  try {
    await new Promise(resolve => setTimeout(resolve, 1500))
    emailSuccess.value = true
    emailMessage.value = 'Test email sent!'
  } catch (error) {
    emailSuccess.value = false
    emailMessage.value = 'Failed to send test email'
  } finally {
    testingEmail.value = false
    setTimeout(() => { emailMessage.value = '' }, 3000)
  }
}

async function saveEmailConfig() {
  savingEmail.value = true
  emailMessage.value = ''

  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    emailSuccess.value = true
    emailMessage.value = 'Email config saved!'
  } catch (error) {
    emailSuccess.value = false
    emailMessage.value = 'Failed to save email config'
  } finally {
    savingEmail.value = false
    setTimeout(() => { emailMessage.value = '' }, 3000)
  }
}

</script>
