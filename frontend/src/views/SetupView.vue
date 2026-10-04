<template>
  <div class="min-h-screen flex relative overflow-hidden">
    <!-- Full-screen Aurora background image -->
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('/Aurora06.png')"></div>
    <!-- Dark overlay -->
    <div class="absolute inset-0 bg-black/55"></div>

    <!-- Left Panel - Branding -->
    <div class="hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative z-10">
      <div class="text-center">
        <img
          :src="logoExists ? '/Logo.jpg' : '/Logo.svg'"
          alt="Aurora"
          class="w-full max-w-md h-auto mx-auto mb-8 rounded-2xl shadow-2xl"
          width="448"
          height="127"
          @error="logoExists = false"
        />
        <p class="text-white/80 max-w-md mx-auto text-lg">
          Test Results Tracker & Synthetic Monitoring Dashboard
        </p>

        <!-- Feature highlights -->
        <div class="mt-12 grid grid-cols-3 gap-6 max-w-md mx-auto">
          <div class="flex flex-col items-center">
            <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
              <Activity :size="24" class="text-white" />
            </div>
            <p class="text-sm text-white/70 text-center">Real-time Monitoring</p>
          </div>
          <div class="flex flex-col items-center">
            <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
              <Bot :size="24" class="text-white" />
            </div>
            <p class="text-sm text-white/70 text-center">AI-Powered Testing</p>
          </div>
          <div class="flex flex-col items-center">
            <div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
              <Users :size="24" class="text-white" />
            </div>
            <p class="text-sm text-white/70 text-center">Multi-Team Management</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel - Setup Form -->
    <div class="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10">
      <div class="w-full max-w-md">
        <!-- Mobile Logo -->
        <div class="lg:hidden text-center mb-8">
          <img
            :src="logoExists ? '/Logo.jpg' : '/Logo.svg'"
            alt="Aurora"
            class="w-full max-w-xs h-auto mx-auto rounded-xl"
            width="320"
            height="91"
            @error="logoExists = false"
          />
        </div>

        <!-- Loading check / backend startup -->
        <div v-if="checkingReturn" class="setup-card flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 :size="28" class="animate-spin text-primary/70" />
          <p class="text-sm" style="color:rgba(160,235,210,0.6)">Starting Aurora…</p>
        </div>

        <!-- Returning user: workspace already exists -->
        <div v-else-if="isReturningUser" class="setup-card text-center">
          <div class="mb-6">
            <div class="w-16 h-16 rounded-full bg-primary mx-auto flex items-center justify-center text-white font-bold text-xl mb-4">
              {{ returningInitials }}
            </div>
            <h2 class="setup-heading mb-1">Welcome back</h2>
            <p class="setup-subheading">{{ returningName }}</p>
          </div>

          <button @click="signIn" :disabled="loading" class="btn btn-primary w-full h-11 mb-4">
            <Loader2 v-if="loading" :size="18" class="animate-spin" />
            <span v-else>Sign In</span>
          </button>

          <button @click="isReturningUser = false" class="setup-back-btn w-full h-10 text-sm">
            Set up a new workspace instead
          </button>
        </div>

        <!-- New setup form -->
        <div v-else class="setup-card">
          <div class="mb-8">
            <h2 class="setup-heading mb-2">Welcome to Aurora</h2>
            <p class="setup-subheading">Let's set up your workspace</p>
          </div>

          <!-- Step indicator -->
          <div class="flex items-center gap-2 mb-8">
            <div
              class="flex-1 h-1 rounded-full transition-colors"
              :class="step >= 1 ? 'step-active' : 'step-inactive'"
            ></div>
            <div
              class="flex-1 h-1 rounded-full transition-colors"
              :class="step >= 2 ? 'step-active' : 'step-inactive'"
            ></div>
            <div
              class="flex-1 h-1 rounded-full transition-colors"
              :class="step >= 3 ? 'step-active' : 'step-inactive'"
            ></div>
          </div>

          <!-- Step 1: Basic Info -->
          <form v-if="step === 1" @submit.prevent="nextStep" class="space-y-5">
            <div>
              <label class="setup-label">Your Name</label>
              <input
                v-model="managerName"
                type="text"
                required
                placeholder="e.g., John Smith"
                class="setup-input"
              />
            </div>

            <div>
              <label class="setup-label">Email Address <span class="setup-optional">(optional)</span></label>
              <input
                v-model="email"
                type="email"
                placeholder="you@example.com"
                class="setup-input"
              />
              <p class="setup-hint">Used for test reports and notifications</p>
            </div>

            <button type="submit" class="btn btn-primary w-full h-11">
              Continue
              <ChevronRight :size="18" />
            </button>
          </form>

          <!-- Step 2: API Key -->
          <form v-if="step === 2" @submit.prevent="handleSetup" class="space-y-5">
            <div>
              <label class="setup-label">AI Provider API Key <span class="setup-optional">(optional — you can add this later)</span></label>
              <div class="flex gap-2 mb-2">
                <button v-for="p in aiProviders" :key="p.id" type="button"
                  @click="selectedProvider = p.id; anthropicKey = ''"
                  :class="['provider-tab', selectedProvider === p.id ? 'provider-tab-active' : '']">
                  {{ p.label }}
                </button>
              </div>
              <input
                v-model="anthropicKey"
                type="password"
                :placeholder="aiProviders.find(p => p.id === selectedProvider)?.placeholder || 'API key'"
                class="setup-input"
              />
              <p class="setup-hint">
                {{ aiProviders.find(p => p.id === selectedProvider)?.hint }}
                All providers can also be configured later in <strong style="color:rgba(160,235,210,0.75)">Settings → System</strong>.
              </p>
            </div>

            <div class="flex gap-3">
              <button type="button" @click="step = 1" class="setup-back-btn h-11 px-4">
                <ChevronLeft :size="18" />
                Back
              </button>
              <button type="submit" :disabled="loading" class="btn btn-primary flex-1 h-11">
                <span v-if="loading" class="flex items-center justify-center gap-2">
                  <Loader2 :size="18" class="animate-spin" />
                  Setting up...
                </span>
                <span v-else>{{ anthropicKey ? 'Save &amp; Continue' : 'Continue without key' }}</span>
              </button>
            </div>

            <p v-if="error" class="text-sm text-danger text-center bg-danger-soft py-2 rounded-lg">
              {{ error }}
            </p>
          </form>

          <!-- Step 3: Test Engine download -->
          <div v-if="step === 3" class="space-y-5">
            <div>
              <p class="setup-subheading mb-1">Aurora needs a browser engine to run and record tests.</p>
              <p class="setup-hint">One-time download (~250MB) into your local profile — no admin rights needed, and it won't need to run again unless the engine is updated.</p>
            </div>

            <div class="rounded-lg border p-4" style="border-color: rgba(0, 200, 140, 0.2); background: rgba(0, 35, 25, 0.4);">
              <!-- Checking -->
              <div v-if="engineStatus === 'checking'" class="flex items-center gap-3">
                <Loader2 :size="18" class="animate-spin" style="color:#00d4a0" />
                <span class="setup-hint" style="margin-top:0">Checking test engine…</span>
              </div>

              <!-- Downloading -->
              <div v-else-if="engineStatus === 'downloading'" class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-sm" style="color:rgba(160,235,210,0.85)">
                    Downloading {{ engineProgress.asset || 'test engine' }}…
                  </span>
                  <span class="text-xs setup-hint" style="margin-top:0">{{ engineProgress.assetIndex + 1 }} of {{ engineProgress.totalAssets }}</span>
                </div>
                <div class="h-2 rounded-full overflow-hidden" style="background: rgba(0, 180, 130, 0.15)">
                  <div class="h-full transition-all" style="background:#00d4a0" :style="{ width: (engineProgress.pct || 0) + '%' }"></div>
                </div>
                <p class="setup-hint">This can take a few minutes depending on your connection.</p>
              </div>

              <!-- Installed -->
              <div v-else-if="engineStatus === 'installed'" class="flex items-center gap-3">
                <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style="background:#00d4a0">
                  <Check :size="13" style="color:#03160f" />
                </div>
                <span class="text-sm" style="color:rgba(160,235,210,0.9)">Test engine ready</span>
              </div>

              <!-- Error -->
              <div v-else-if="engineStatus === 'error'" class="space-y-2">
                <p class="text-sm text-danger">{{ engineError || 'Download failed' }}</p>
                <button type="button" @click="startEngineDownload" class="setup-back-btn h-9 px-3 text-xs">Retry</button>
              </div>
            </div>

            <div class="flex gap-3">
              <button type="button" @click="step = 2" class="setup-back-btn h-11 px-4">
                <ChevronLeft :size="18" />
                Back
              </button>
              <button type="button" @click="finishSetup" :disabled="engineStatus === 'checking' || engineStatus === 'downloading'" class="btn btn-primary flex-1 h-11">
                {{ engineStatus === 'installed' ? 'Continue' : 'Skip for now' }}
              </button>
            </div>
            <p v-if="engineStatus === 'error' || engineStatus === 'downloading'" class="setup-hint text-center">
              Recording and running tests won't work until this finishes — you can also retry from Settings → System later.
            </p>
          </div>
        </div>

        <!-- Footer hint -->
        <p class="text-center text-white/60 text-sm mt-6">{{ footerLabel }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/appStore'
import { getApiBaseUrl } from '@/lib/api'
import { Activity, Bot, Users, Loader2, ChevronRight, ChevronLeft, Check } from 'lucide-vue-next'

const router = useRouter()
const appStore = useAppStore()

const step = ref(1)
const managerName = ref('')
const email = ref('')
const anthropicKey = ref('')
const selectedProvider = ref('anthropic')
const loading = ref(false)
const error = ref('')
const logoExists = ref(true)

// Step 3 — Test Engine download
const engineStatus = ref('checking') // checking | downloading | installed | error
const engineProgress = ref({ asset: '', assetIndex: 0, totalAssets: 3, pct: 0 })
const engineError = ref('')

const aiProviders = [
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-api03-...', hint: 'Claude models. Recommended for best results.' },
  { id: 'openai',    label: 'OpenAI',    placeholder: 'sk-...',            hint: 'GPT-4o and o-series models.' },
  { id: 'local',     label: 'Local LLM', placeholder: 'http://localhost:11434', hint: 'Ollama or any OpenAI-compatible endpoint.' },
]

// Returning-user detection
const checkingReturn = ref(true)
const isReturningUser = ref(false)
const returningName = ref('')
const returningInitials = computed(() => {
  const name = returningName.value || ''
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
})

// Version and edition come from the backend, so a release bump can't miss them
const footerLabel = ref('Aurora')
async function loadFooterLabel() {
  try {
    const base = getApiBaseUrl()
    const [health, status] = await Promise.all([
      fetch(`${base}/api/health`).then(r => r.json()),
      fetch(`${base}/api/auth/status`).then(r => r.json())
    ])
    const edition = status?.license?.tier === 'community' ? 'Community Edition' : 'Desktop Edition'
    footerLabel.value = `Aurora v${health.version} - ${edition}`
  } catch { /* keep the plain name */ }
}

onMounted(async () => {
  loadFooterLabel()
  const result = await appStore.checkStatus()
  if (result.success && appStore.setupCompleted) {
    returningName.value = appStore.managerName
    isReturningUser.value = true
  }
  checkingReturn.value = false
})

async function signIn() {
  loading.value = true
  router.push('/dashboard')
}

function nextStep() {
  if (managerName.value.trim()) {
    step.value = 2
  }
}

async function handleSetup() {
  loading.value = true
  error.value = ''

  const key = anthropicKey.value.trim()
  const setupPayload = {
    managerName: managerName.value.trim(),
    email: email.value.trim(),
  }
  if (key) {
    if (selectedProvider.value === 'anthropic') setupPayload.anthropicKey = key
    else if (selectedProvider.value === 'openai') setupPayload.openaiKey = key
    else if (selectedProvider.value === 'local') setupPayload.localLlmEndpoint = key
    setupPayload.activeAiProvider = selectedProvider.value
  }

  const result = await appStore.completeSetup(setupPayload)

  if (result.success) {
    step.value = 3
    checkAndStartEngineDownload()
  } else {
    error.value = result.error
  }

  loading.value = false
}

async function checkAndStartEngineDownload() {
  engineStatus.value = 'checking'
  try {
    const base = getApiBaseUrl()
    const resp = await fetch(`${base}/api/setup/browsers-status`)
    const data = await resp.json()
    if (data.success && data.installed) {
      engineStatus.value = 'installed'
      return
    }
  } catch {
    // fall through to attempt the download anyway
  }
  startEngineDownload()
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

function finishSetup() {
  router.push('/wizard')
}
</script>

<style scoped>
/* Glassmorphism card — dark teal drawn from the aurora palette */
.setup-card {
  background: rgba(3, 22, 16, 0.78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 210, 150, 0.18);
  border-radius: 12px;
  padding: 2rem;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(0, 220, 160, 0.08);
}

.setup-heading {
  font-size: 1.5rem;
  font-weight: 600;
  color: #ffffff;
}

.setup-subheading {
  font-size: 0.875rem;
  color: rgba(160, 230, 205, 0.75);
}

/* Step progress bars */
.step-active  { background-color: #00d4a0; }
.step-inactive { background-color: rgba(0, 180, 130, 0.2); }

/* Form labels */
.setup-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(160, 235, 210, 0.85);
  margin-bottom: 4px;
}

.setup-optional {
  color: rgba(120, 200, 175, 0.55);
}

/* Inputs */
.setup-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 200, 140, 0.25);
  background-color: rgba(0, 35, 25, 0.6);
  color: #ffffff;
  font-size: 0.875rem;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
}

.setup-input::placeholder {
  color: rgba(100, 185, 155, 0.45);
}

.setup-input:focus {
  outline: none;
  border-color: rgba(0, 220, 160, 0.65);
  box-shadow: 0 0 0 3px rgba(0, 220, 160, 0.15);
}

.setup-hint {
  font-size: 0.75rem;
  color: rgba(120, 200, 170, 0.6);
  margin-top: 4px;
}

/* Back button */
.setup-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  background: rgba(0, 40, 28, 0.5);
  border: 1px solid rgba(0, 200, 140, 0.25);
  color: rgba(160, 235, 210, 0.9);
}

.setup-back-btn:hover {
  background: rgba(0, 55, 38, 0.65);
  border-color: rgba(0, 220, 160, 0.45);
}

/* Provider tabs */
.provider-tab {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid rgba(0, 200, 140, 0.2);
  background: rgba(0, 30, 20, 0.5);
  color: rgba(120, 200, 175, 0.7);
  transition: all 150ms;
}
.provider-tab:hover {
  border-color: rgba(0, 220, 160, 0.4);
  color: rgba(160, 235, 210, 0.9);
}
.provider-tab-active {
  background: rgba(0, 212, 160, 0.15);
  border-color: rgba(0, 220, 160, 0.55);
  color: #00d4a0;
}
</style>
