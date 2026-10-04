<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden py-10">
    <!-- Background -->
    <div class="absolute inset-0 bg-cover bg-center bg-no-repeat" style="background-image: url('/Aurora06.png')"></div>
    <div class="absolute inset-0" style="background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.52) 40%, rgba(0,0,0,0.82) 100%)"></div>

    <div class="relative z-10 w-full max-w-2xl mx-auto px-4">
      <div class="wizard-card">

        <!-- ── Horizontal stepper (steps 1–5) ── -->
        <div v-if="step >= 1" class="stepper mb-8">
          <template v-for="(s, i) in steps" :key="i">
            <div class="stepper-item">
              <div class="stepper-circle"
                :class="step > i + 1 ? 'circle-done' : step === i + 1 ? 'circle-active' : 'circle-upcoming'"
              >
                <Check v-if="step > i + 1" :size="13" />
                <span v-else>{{ i + 1 }}</span>
              </div>
              <span class="stepper-label"
                :class="step === i + 1 ? 'label-active' : step > i + 1 ? 'label-done' : 'label-upcoming'"
              >{{ s }}</span>
            </div>
            <div v-if="i < steps.length - 1" class="stepper-line"
              :class="step > i + 1 ? 'line-done' : 'line-upcoming'"
            />
          </template>
        </div>

        <!-- ── Step content with slide transition ── -->
        <div class="step-area">
          <Transition :name="transitionName" mode="out-in">
            <div :key="step">

              <!-- ── Step 0: Welcome ── -->
              <div v-if="step === 0">
                <div class="text-center mb-8">
                  <div class="welcome-logo-wrap mx-auto">
                    <img src="/Logo.jpg" alt="Aurora" class="w-20 h-20 rounded-2xl shadow-2xl mx-auto welcome-logo-img" />
                    <div class="welcome-glow" />
                  </div>
                  <h1 class="welcome-heading mt-5">Welcome to Aurora</h1>
                  <p class="welcome-sub mt-2">Your AI-powered QA command centre. Let's get it set up in 5 quick steps.</p>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-8">
                  <div class="feat-card">
                    <div class="feat-icon"><Boxes :size="20" class="text-primary" /></div>
                    <h3>Features & Products</h3>
                    <p>Track test coverage across your product areas</p>
                  </div>
                  <div class="feat-card">
                    <div class="feat-icon"><Target :size="20" class="text-primary" /></div>
                    <h3>Initiatives</h3>
                    <p>Group features under goals like "Q2 Release"</p>
                  </div>
                  <div class="feat-card">
                    <div class="feat-icon"><Terminal :size="20" class="text-primary" /></div>
                    <h3>AI Test Generator</h3>
                    <p>Write Playwright specs in plain English</p>
                  </div>
                  <div class="feat-card">
                    <div class="feat-icon"><Activity :size="20" class="text-primary" /></div>
                    <h3>Synthetic Monitoring</h3>
                    <p>Scheduled uptime and performance checks</p>
                  </div>
                </div>
              </div>

              <!-- ── Step 1: Create Feature ── -->
              <div v-else-if="step === 1" class="space-y-5">
                <div class="step-hero">
                  <div class="hero-icon" :style="{ background: featureForm.color + '22', borderColor: featureForm.color + '55' }">
                    <Boxes :size="26" :style="{ color: featureForm.color }" />
                  </div>
                  <div>
                    <h2 class="step-heading">Create your first feature</h2>
                    <p class="step-sub">A feature is any area of your product you're testing — "Mobile App", "Checkout Flow", etc.</p>
                  </div>
                </div>

                <div>
                  <label class="wz-label">Feature name <span class="text-danger/70">*</span></label>
                  <input v-model="featureForm.name" type="text" class="wz-input" placeholder="e.g. Mobile App" />
                </div>
                <div>
                  <label class="wz-label">What does this feature cover? <span class="wz-opt">(optional)</span></label>
                  <input v-model="featureForm.description" type="text" class="wz-input" placeholder="e.g. iOS and Android shopping experience" />
                </div>
                <div>
                  <label class="wz-label">Colour</label>
                  <div class="flex items-center gap-2.5 mt-2">
                    <button
                      v-for="c in colorPresets" :key="c" type="button"
                      @click="featureForm.color = c"
                      class="color-dot"
                      :style="{ backgroundColor: c }"
                      :class="featureForm.color === c ? 'dot-active' : ''"
                    />
                  </div>
                </div>
                <p v-if="error" class="err-msg">{{ error }}</p>
              </div>

              <!-- ── Step 2: Initiative ── -->
              <div v-else-if="step === 2" class="space-y-5">
                <div class="step-hero">
                  <div class="hero-icon" style="background:rgba(255,159,67,0.15);border-color:rgba(255,159,67,0.35)">
                    <Target :size="26" class="text-warning" />
                  </div>
                  <div>
                    <h2 class="step-heading">Create an initiative</h2>
                    <p class="step-sub">Track a business goal alongside test coverage — "Q3 Release", "Summer Campaign", etc.</p>
                  </div>
                </div>

                <div>
                  <label class="wz-label">Initiative name <span class="text-danger/70">*</span></label>
                  <input v-model="initiativeForm.name" type="text" class="wz-input" placeholder="e.g. Q3 Platform Release" />
                </div>
                <div>
                  <label class="wz-label">Description <span class="wz-opt">(optional)</span></label>
                  <textarea v-model="initiativeForm.description" class="wz-input wz-textarea" rows="2" placeholder="What is this initiative about?" />
                </div>
                <div>
                  <label class="wz-label">Priority</label>
                  <div class="flex gap-2 mt-2">
                    <button
                      v-for="p in priorities" :key="p.value" type="button"
                      @click="initiativeForm.priority = p.value"
                      class="priority-btn flex-1"
                      :class="initiativeForm.priority === p.value ? p.active : 'p-inactive'"
                    >{{ p.label }}</button>
                  </div>
                </div>
                <div>
                  <label class="wz-label">Target date <span class="wz-opt">(optional)</span></label>
                  <input v-model="initiativeForm.targetDate" type="date" class="wz-input" />
                </div>
                <p v-if="error" class="err-msg">{{ error }}</p>
              </div>

              <!-- ── Step 3: Test Generator & Packs ── -->
              <div v-else-if="step === 3" class="space-y-4">
                <div>
                  <h2 class="step-heading">Test Generator & Test Packs</h2>
                  <p class="step-sub mt-1">Describe what to test — Aurora's AI writes the Playwright spec for you.</p>
                </div>

                <div class="info-only-banner">
                  <Info :size="15" class="shrink-0 mt-0.5" style="color: rgba(52,211,153,0.7)" />
                  <span>This is an overview screen — there's nothing to set up here. Use the demo below to see how test generation works, then click <strong>Next</strong> to continue.</span>
                </div>

                <!-- Animated demo mockup -->
                <div class="demo-mockup">
                  <div class="demo-titlebar">
                    <span class="demo-dot demo-red" />
                    <span class="demo-dot demo-amber" />
                    <span class="demo-dot demo-green" />
                    <span class="demo-titlebar-label">Aurora · Test Generator</span>
                  </div>
                  <div class="demo-body">
                    <div class="demo-form-area">
                      <div class="demo-field">
                        <span class="demo-label">URL to test</span>
                        <div class="demo-input-row">
                          <span class="demo-typed">{{ demoUrl }}</span>
                          <span v-if="demoPhase < 2" class="demo-caret" />
                        </div>
                      </div>
                      <Transition name="demo-fade">
                        <div v-if="demoPhase >= 1" class="demo-field">
                          <span class="demo-label">Describe what to test <span class="demo-label-hint">(plain English)</span></span>
                          <div class="demo-textarea">
                            <div v-for="(line, i) in demoDescLines" :key="i" class="demo-desc-line">
                              <span>{{ line }}</span><span v-if="i === demoDescLines.length - 1 && demoPhase === 1" class="demo-caret" />
                            </div>
                          </div>
                        </div>
                      </Transition>
                      <Transition name="demo-fade">
                        <button v-if="demoPhase >= 2" class="demo-gen-btn" :class="{ 'demo-btn-pulse': demoPhase === 2 }">
                          <Zap :size="13" /> Generate Test
                        </button>
                      </Transition>
                    </div>
                    <Transition name="demo-fade">
                      <div v-if="demoPhase >= 3" class="demo-terminal">
                        <div v-for="(line, i) in visibleTerminalLines" :key="i" class="demo-term-line" :class="line.cls">{{ line.text }}</div>
                        <span v-if="demoPhase === 3 && visibleTerminalLines.length < terminalLines.length" class="demo-caret" />
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Test Packs compact info -->
                <div class="info-card">
                  <div class="ic-header">
                    <div class="ic-icon"><Package :size="18" class="text-primary" /></div>
                    <span class="ic-title">Test Packs</span>
                  </div>
                  <p class="ic-body">Group generated specs into a Pack. Run everything with one click, track pass rates over time, and let Auto-Heal fix broken selectors automatically.</p>
                  <div class="ic-tag"><RefreshCw :size="11" />Auto-heals on selector failure</div>
                </div>

                <div class="info-tip">
                  <Info :size="15" class="text-primary/80 shrink-0 mt-0.5" />
                  <span>Configure your AI provider in <strong class="text-white/90">Settings → System → AI Configuration</strong> before generating tests.</span>
                </div>
              </div>

              <!-- ── Step 4: Synthetics ── -->
              <div v-else-if="step === 4" class="space-y-5">
                <div>
                  <h2 class="step-heading">Synthetic Monitoring</h2>
                  <p class="step-sub mt-1">Automated, scheduled checks that confirm your app is up and performing well — 24/7.</p>
                </div>

                <div class="info-only-banner">
                  <Info :size="15" class="shrink-0 mt-0.5" style="color: rgba(52,211,153,0.7)" />
                  <span>This is an overview screen — there's nothing to set up here. Read through how synthetic monitoring works, then click <strong>Finish</strong> to go to your dashboard.</span>
                </div>

                <div class="synth-grid">
                  <div class="synth-row">
                    <div class="synth-icon"><Clock :size="18" class="text-primary/80" /></div>
                    <div>
                      <p class="synth-name">Scheduled checks</p>
                      <p class="synth-detail">Every 1 min → daily</p>
                    </div>
                  </div>
                  <div class="synth-row">
                    <div class="synth-icon"><BarChart2 :size="18" class="text-primary/80" /></div>
                    <div>
                      <p class="synth-name">Performance metrics</p>
                      <p class="synth-detail">FCP · TTI · Load time</p>
                    </div>
                  </div>
                  <div class="synth-row">
                    <div class="synth-icon"><Camera :size="18" class="text-primary/80" /></div>
                    <div>
                      <p class="synth-name">Screenshot on fail</p>
                      <p class="synth-detail">Visual proof of failures</p>
                    </div>
                  </div>
                </div>

                <!-- Promote scripts to synthetic pack tip -->
                <div class="synth-promo">
                  <div class="synth-promo-icon"><Package :size="18" class="text-primary/80" /></div>
                  <div>
                    <p class="synth-promo-title">From test pack to always-on monitor</p>
                    <p class="synth-promo-body">Once you're comfortable with the stability of a script or a set of scripts, you can promote them directly into a Synthetic Monitoring pack — turning your one-off tests into 24/7 uptime and performance checks.</p>
                  </div>
                </div>

                <div class="info-tip muted">
                  <Info :size="15" class="text-white/30 shrink-0 mt-0.5" />
                  <span>Set up monitors in <strong class="text-white/70">Settings → Synthetics</strong>. Free tier includes 3 monitors.</span>
                </div>
              </div>

              <!-- ── Step 5: Done ── -->
              <div v-else-if="step === 5" class="space-y-6">
                <div class="text-center">
                  <div class="done-wrap mx-auto mb-5">
                    <div class="done-ring" />
                    <div class="done-circle">
                      <CheckCircle :size="34" class="text-emerald-400" />
                    </div>
                  </div>
                  <h2 class="done-heading">You're all set!</h2>
                  <p class="step-sub mt-1">Aurora is ready. Here's what was created.</p>
                </div>

                <div class="space-y-2.5">
                  <div class="summary-row" :class="createdFeatureId ? 'row-ok' : 'row-skip'">
                    <Boxes :size="16" :class="createdFeatureId ? 'text-emerald-400' : 'text-white/25'" />
                    <span v-if="createdFeatureId" class="text-sm text-white/85">Feature <strong>"{{ featureForm.name }}"</strong> created</span>
                    <span v-else class="text-sm text-white/35">No feature — <RouterLink to="/settings/teams" @click="finish" class="text-primary/60 hover:text-primary underline underline-offset-2">add one later</RouterLink></span>
                    <Check v-if="createdFeatureId" :size="14" class="text-emerald-400 ml-auto" />
                  </div>
                  <div class="summary-row" :class="createdInitiativeName ? 'row-ok' : 'row-skip'">
                    <Target :size="16" :class="createdInitiativeName ? 'text-emerald-400' : 'text-white/25'" />
                    <span v-if="createdInitiativeName" class="text-sm text-white/85">Initiative <strong>"{{ createdInitiativeName }}"</strong> created</span>
                    <span v-else class="text-sm text-white/35">No initiative — <RouterLink to="/settings/initiatives" @click="finish" class="text-primary/60 hover:text-primary underline underline-offset-2">add one later</RouterLink></span>
                    <Check v-if="createdInitiativeName" :size="14" class="text-emerald-400 ml-auto" />
                  </div>
                </div>

                <div>
                  <p class="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Where to next?</p>
                  <div class="grid sm:grid-cols-3 gap-2">
                    <RouterLink to="/testing/packs" @click="finish" class="quick-link">
                      <Package :size="15" class="text-primary" /><span>Create a Test Pack</span>
                    </RouterLink>
                    <RouterLink to="/settings/synthetics" @click="finish" class="quick-link">
                      <Activity :size="15" class="text-primary" /><span>Set up Synthetics</span>
                    </RouterLink>
                    <RouterLink to="/dashboard" @click="finish" class="quick-link">
                      <LayoutDashboard :size="15" class="text-primary" /><span>Go to Dashboard</span>
                    </RouterLink>
                  </div>
                </div>
              </div>

            </div>
          </Transition>
        </div>

        <!-- ── Nav bar (unified) ── -->
        <div class="nav-bar mt-8">
          <template v-if="step === 0">
            <div />
            <button @click="nextStep" class="btn btn-primary h-12 px-8 text-base flex items-center gap-2">
              Let's get started <ChevronRight :size="20" />
            </button>
          </template>

          <template v-else-if="step >= 1 && step <= 2">
            <button @click="goBack" class="nav-back">
              <ChevronLeft :size="16" />Back
            </button>
            <span class="nav-count">Step {{ step }} of 5</span>
            <div class="flex items-center gap-2">
              <button @click="skipStep" class="wz-skip">Skip</button>
              <button @click="nextStep" :disabled="saving" class="btn btn-primary h-10 px-5 text-sm flex items-center gap-1.5">
                <Loader2 v-if="saving" :size="14" class="animate-spin" />
                <span v-else>Next</span>
                <ChevronRight v-if="!saving" :size="16" />
              </button>
            </div>
          </template>

          <template v-else-if="step >= 3 && step <= 4">
            <button @click="goBack" class="nav-back">
              <ChevronLeft :size="16" />Back
            </button>
            <span class="nav-count">Step {{ step }} of 5</span>
            <button @click="nextStep" class="btn btn-primary h-10 px-5 text-sm flex items-center gap-1.5">
              <span>{{ step === 4 ? 'Finish' : 'Next' }}</span>
              <ChevronRight :size="16" />
            </button>
          </template>

          <template v-else>
            <div />
            <button @click="finish" class="btn btn-primary h-10 px-6 text-sm flex items-center gap-1.5">
              Go to Dashboard <ChevronRight :size="16" />
            </button>
          </template>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/lib/api'
import {
  Check, CheckCircle, ChevronLeft, ChevronRight,
  Boxes, Target, Terminal, Activity, Package,
  Zap, RefreshCw, Info, Clock, BarChart2, Camera,
  Loader2, LayoutDashboard
} from 'lucide-vue-next'

const router = useRouter()

const step = ref(0)
const saving = ref(false)
const error = ref('')
const direction = ref('forward')

const steps = ['Feature', 'Initiative', 'Tests & Packs', 'Synthetics', 'Done']
const transitionName = computed(() => direction.value === 'back' ? 'slide-back' : 'slide-forward')

const colorPresets = ['#7367F0', '#28C76F', '#FF9F43', '#EA5455', '#00CFE8', '#a855f7']
const featureForm = ref({ name: '', description: '', color: '#7367F0' })
const createdFeatureId = ref(null)

const priorities = [
  { value: 'low',      label: 'Low',      active: 'bg-slate-500 text-white border-transparent' },
  { value: 'medium',   label: 'Medium',   active: 'bg-blue-500 text-white border-transparent' },
  { value: 'high',     label: 'High',     active: 'bg-warning text-white border-transparent' },
  { value: 'critical', label: 'Critical', active: 'bg-danger text-white border-transparent' }
]
const initiativeForm = ref({ name: '', description: '', priority: 'medium', targetDate: '' })
const createdInitiativeName = ref('')

// ── Demo animation (step 3) ────────────────────────────
const demoPhase = ref(0)
const demoUrl = ref('')
const demoDescLines = ref([])
const visibleTerminalLines = ref([])
const terminalLines = [
  { text: '→ Connecting to https://myapp.com/login', cls: 'term-cmd' },
  { text: '  AI parsing 4 plain-English steps...', cls: 'term-info' },
  { text: "  await page.goto('/login')", cls: 'term-code' },
  { text: "  await page.fill('[name=\"email\"]', user)", cls: 'term-code' },
  { text: "  await page.click('[type=\"submit\"]')", cls: 'term-code' },
  { text: '✓ login.spec.js — 4 assertions ready', cls: 'term-done' },
]
const descSteps = [
  '1. Open the login page',
  '2. Type in my email and password',
  '3. Click Sign In',
  '4. Make sure the dashboard appears',
]

let demoGen = 0
let isMounted = true
onUnmounted(() => { isMounted = false })

watch(step, (val) => {
  if (val === 3) {
    demoGen++
    runDemoLoop(demoGen)
  }
})

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function typeString(target, text, speed) {
  for (let i = 0; i <= text.length; i++) {
    if (!isMounted || step.value !== 3) return false
    target.value = text.slice(0, i)
    await sleep(speed)
  }
  return true
}

async function typeLineToArray(text, speed) {
  demoDescLines.value = [...demoDescLines.value, '']
  const idx = demoDescLines.value.length - 1
  for (let i = 0; i <= text.length; i++) {
    if (!isMounted || step.value !== 3) return false
    const arr = [...demoDescLines.value]
    arr[idx] = text.slice(0, i)
    demoDescLines.value = arr
    await sleep(speed)
  }
  return true
}

async function runDemoLoop(gen) {
  while (isMounted && step.value === 3 && gen === demoGen) {
    // Reset
    demoPhase.value = 0
    demoUrl.value = ''
    demoDescLines.value = []
    visibleTerminalLines.value = []
    await sleep(500)

    // Phase 0 → type URL
    if (!await typeString(demoUrl, 'https://myapp.com/login', 48)) break
    await sleep(300)

    // Phase 1 → type each plain-English step line by line
    demoPhase.value = 1
    await sleep(200)
    for (const line of descSteps) {
      if (!isMounted || step.value !== 3 || gen !== demoGen) break
      if (!await typeLineToArray(line, 28)) break
      await sleep(180)
    }
    await sleep(300)

    // Phase 2 → show generate button (pulse)
    if (!isMounted || step.value !== 3 || gen !== demoGen) break
    demoPhase.value = 2
    await sleep(820)

    // Phase 3 → terminal output line by line
    if (!isMounted || step.value !== 3 || gen !== demoGen) break
    demoPhase.value = 3
    for (const line of terminalLines) {
      if (!isMounted || step.value !== 3 || gen !== demoGen) break
      visibleTerminalLines.value = [...visibleTerminalLines.value, line]
      await sleep(340)
    }

    // Phase 4 → pause on result
    demoPhase.value = 4
    await sleep(3400)
  }
}

// ── Wizard navigation ──────────────────────────────────
async function nextStep() {
  error.value = ''
  direction.value = 'forward'

  if (step.value === 1) {
    if (featureForm.value.name.trim()) {
      saving.value = true
      try {
        const res = await api.post('/api/teams', {
          name: featureForm.value.name.trim(),
          description: featureForm.value.description.trim(),
          color: featureForm.value.color
        })
        if (res.data.success) createdFeatureId.value = res.data.team.id
      } catch (e) {
        error.value = e.response?.data?.message || 'Failed to create feature'
        saving.value = false
        return
      }
      saving.value = false
    }
    step.value++
    return
  }

  if (step.value === 2) {
    if (initiativeForm.value.name.trim()) {
      saving.value = true
      try {
        const payload = {
          name: initiativeForm.value.name.trim(),
          description: initiativeForm.value.description.trim(),
          priority: initiativeForm.value.priority
        }
        if (createdFeatureId.value) payload.teamId = createdFeatureId.value
        if (initiativeForm.value.targetDate) payload.targetDate = new Date(initiativeForm.value.targetDate).toISOString()
        const res = await api.post('/api/initiatives', payload)
        if (res.data.success) createdInitiativeName.value = initiativeForm.value.name.trim()
      } catch (e) {
        error.value = e.response?.data?.message || 'Failed to create initiative'
        saving.value = false
        return
      }
      saving.value = false
    }
    step.value++
    return
  }

  step.value++
}

function goBack() {
  direction.value = 'back'
  error.value = ''
  step.value--
}

function skipStep() {
  direction.value = 'forward'
  error.value = ''
  step.value++
}

function finish() {
  localStorage.setItem('aurora_wizard_completed', 'true')
  router.push('/dashboard')
}
</script>

<style scoped>
/* ═══ Card ═══ */
.wizard-card {
  background: rgba(4, 18, 12, 0.88);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(0, 200, 140, 0.14);
  border-radius: 20px;
  padding: 2.5rem;
  box-shadow: 0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(0,220,160,0.06);
  animation: cardIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes cardIn {
  from { transform: translateY(32px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0)    scale(1);    opacity: 1; }
}

/* ═══ Transitions ═══ */
.step-area { overflow: hidden; }

.slide-forward-enter-active { transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-forward-leave-active { transition: all 0.2s  cubic-bezier(0.4, 0, 0.2, 1); }
.slide-forward-enter-from   { transform: translateX(44px); opacity: 0; }
.slide-forward-leave-to     { transform: translateX(-44px); opacity: 0; }

.slide-back-enter-active { transition: all 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-back-leave-active { transition: all 0.2s  cubic-bezier(0.4, 0, 0.2, 1); }
.slide-back-enter-from   { transform: translateX(-44px); opacity: 0; }
.slide-back-leave-to     { transform: translateX(44px);  opacity: 0; }

/* ═══ Stepper ═══ */
.stepper { display: flex; align-items: flex-start; }
.stepper-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 6px; flex-shrink: 0;
}
.stepper-line {
  flex: 1; height: 2px; margin-top: 19px;
  border-radius: 1px; min-width: 12px;
  transition: background 0.4s ease;
}
.line-done     { background: rgba(52, 211, 153, 0.45); }
.line-upcoming { background: rgba(255, 255, 255, 0.09); }

.stepper-circle {
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.875rem; font-weight: 600;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.circle-active {
  background: var(--color-primary, #7367F0); color: #fff;
  box-shadow: 0 0 0 5px rgba(115,103,240,0.22), 0 0 22px rgba(115,103,240,0.4);
}
.circle-done {
  background: rgba(52,211,153,0.18);
  border: 1.5px solid rgba(52,211,153,0.45);
  color: rgb(52,211,153);
}
.circle-upcoming {
  background: rgba(255,255,255,0.04);
  border: 1.5px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.22);
}
.stepper-label {
  font-size: 0.6875rem; font-weight: 500;
  text-align: center; width: 72px;
  line-height: 1.3; transition: color 0.3s ease;
}
.label-active   { color: rgba(255,255,255,0.9); }
.label-done     { color: rgba(52,211,153,0.65); }
.label-upcoming { color: rgba(255,255,255,0.18); }

/* ═══ Welcome ═══ */
.welcome-logo-wrap { position: relative; display: inline-block; width: 80px; height: 80px; }
.welcome-logo-img {
  position: relative; z-index: 1;
  animation: logoBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  box-shadow: 0 0 40px rgba(115,103,240,0.45), 0 8px 24px rgba(0,0,0,0.5);
}
.welcome-glow {
  position: absolute; inset: -20px; border-radius: 50%;
  background: radial-gradient(circle, rgba(115,103,240,0.35) 0%, transparent 65%);
  filter: blur(14px);
  animation: glowPulse 3s ease-in-out infinite;
}
@keyframes logoBounce {
  from { transform: scale(0.55); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.15); }
}
.welcome-heading {
  font-size: 2.15rem; font-weight: 700; color: #fff; line-height: 1.15;
  animation: fadeUp 0.5s ease-out both 0.1s;
}
.welcome-sub {
  font-size: 0.9375rem; color: rgba(160,230,205,0.65);
  animation: fadeUp 0.5s ease-out both 0.17s;
}
@keyframes fadeUp {
  from { transform: translateY(14px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.feat-card {
  background: rgba(255,255,255,0.045);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 12px; padding: 1rem;
  animation: fadeUp 0.45s ease-out both;
  transition: background 0.2s, border-color 0.2s; cursor: default;
}
.feat-card:hover { background: rgba(255,255,255,0.075); border-color: rgba(115,103,240,0.22); }
.feat-card:nth-child(1) { animation-delay: 0.12s; }
.feat-card:nth-child(2) { animation-delay: 0.2s; }
.feat-card:nth-child(3) { animation-delay: 0.28s; }
.feat-card:nth-child(4) { animation-delay: 0.36s; }
.feat-card h3 { font-size: 0.875rem; font-weight: 600; color: #fff; margin: 8px 0 4px; }
.feat-card p  { font-size: 0.8125rem; color: rgba(255,255,255,0.45); line-height: 1.4; }
.feat-icon {
  width: 36px; height: 36px;
  background: rgba(115,103,240,0.14); border: 1px solid rgba(115,103,240,0.22);
  border-radius: 9px; display: flex; align-items: center; justify-content: center;
}

/* ═══ Step hero ═══ */
.step-hero { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 4px; }
.hero-icon {
  width: 54px; height: 54px; border-radius: 14px; border: 1px solid;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.step-heading { font-size: 1.55rem; font-weight: 600; color: #fff; line-height: 1.2; }
.step-sub { font-size: 0.875rem; color: rgba(160,230,205,0.6); line-height: 1.5; }

/* ═══ Form ═══ */
.wz-label {
  display: block; font-size: 0.8125rem; font-weight: 500;
  color: rgba(160,235,210,0.8); margin-bottom: 6px;
}
.wz-opt { color: rgba(120,200,175,0.42); font-weight: 400; }
.wz-input {
  width: 100%; height: 44px; padding: 0 14px;
  border-radius: 10px; border: 1px solid rgba(0,200,140,0.22);
  background: rgba(0,35,25,0.55); color: #fff; font-size: 0.9375rem;
  transition: border-color 150ms, box-shadow 150ms;
}
.wz-input::placeholder { color: rgba(100,185,155,0.38); }
.wz-input:focus { outline: none; border-color: rgba(0,220,160,0.55); box-shadow: 0 0 0 3px rgba(0,220,160,0.11); }
.wz-textarea { height: auto; padding-top: 10px; padding-bottom: 10px; resize: none; }

.color-dot { width: 32px; height: 32px; border-radius: 50%; border: 2.5px solid transparent; cursor: pointer; transition: all 0.15s ease; }
.dot-active { border-color: #fff !important; transform: scale(1.22); box-shadow: 0 0 12px rgba(255,255,255,0.28); }

.priority-btn {
  padding: 9px 0; border-radius: 8px; font-size: 0.8125rem; font-weight: 500;
  border: 1px solid transparent; cursor: pointer; transition: all 0.15s ease;
}
.p-inactive { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); }
.p-inactive:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); }

.err-msg {
  font-size: 0.875rem; color: rgba(239,68,68,0.9);
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  padding: 8px 12px; border-radius: 8px;
}

/* ═══ Demo Mockup (Step 3) ═══ */
.demo-mockup {
  background: rgba(0, 14, 9, 0.96);
  border: 1px solid rgba(0, 200, 140, 0.2);
  border-radius: 12px; overflow: hidden;
}
.demo-titlebar {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 14px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.demo-dot { width: 10px; height: 10px; border-radius: 50%; }
.demo-red   { background: #ff5f57; }
.demo-amber { background: #febc2e; }
.demo-green { background: #28c840; }
.demo-titlebar-label { font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.32); margin-left: 8px; }

.demo-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.demo-form-area { display: flex; flex-direction: column; gap: 10px; }
.demo-field { display: flex; flex-direction: column; gap: 4px; }
.demo-label { font-size: 0.7rem; font-weight: 500; color: rgba(160,235,210,0.6); }
.demo-input-row {
  display: flex; align-items: center;
  padding: 7px 10px; min-height: 34px;
  background: rgba(0,30,20,0.7);
  border: 1px solid rgba(0,200,140,0.18);
  border-radius: 7px;
  font-size: 0.8125rem; font-family: ui-monospace, monospace;
  color: rgba(255,255,255,0.85);
}
.demo-typed { white-space: pre; }

.demo-textarea {
  padding: 8px 10px;
  background: rgba(0,30,20,0.7);
  border: 1px solid rgba(0,200,140,0.18);
  border-radius: 7px;
  font-size: 0.8125rem;
  font-family: ui-monospace, monospace;
  color: rgba(255,255,255,0.85);
  line-height: 1.7;
  min-height: 34px;
}
.demo-desc-line { display: flex; align-items: center; }
.demo-label-hint { font-size: 0.65rem; color: rgba(120,200,175,0.4); font-weight: 400; }
.demo-caret {
  display: inline-block; width: 2px; height: 14px;
  background: rgba(0,220,160,0.85); margin-left: 1px; border-radius: 1px;
  animation: caretBlink 1s step-end infinite;
}
@keyframes caretBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

.demo-gen-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 7px; border: none;
  background: var(--color-primary, #7367F0);
  font-size: 0.8125rem; font-weight: 600; color: #fff;
  cursor: default; width: fit-content;
  transition: box-shadow 0.3s ease, transform 0.2s ease;
}
.demo-btn-pulse {
  box-shadow: 0 0 0 5px rgba(115,103,240,0.32), 0 0 22px rgba(115,103,240,0.45);
  transform: scale(0.96);
}

.demo-terminal {
  background: rgba(0,5,3,0.95); border-radius: 8px;
  padding: 10px 12px; min-height: 36px;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.75rem; line-height: 1.75;
}
.demo-term-line { animation: termIn 0.18s ease-out both; }
@keyframes termIn {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.term-cmd  { color: rgba(210,210,210,0.75); }
.term-info { color: rgba(100,190,160,0.75); }
.term-code { color: rgba(150,195,245,0.75); padding-left: 14px; }
.term-done { color: rgb(52,211,153); font-weight: 600; }

.demo-fade-enter-active { transition: all 0.22s ease-out; }
.demo-fade-leave-active { transition: all 0.16s ease-in; }
.demo-fade-enter-from   { opacity: 0; transform: translateY(7px); }
.demo-fade-leave-to     { opacity: 0; }

/* ═══ Info cards ═══ */
.info-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
  border-radius: 12px; padding: 1.125rem;
}
.ic-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ic-icon {
  width: 36px; height: 36px;
  background: rgba(115,103,240,0.14); border: 1px solid rgba(115,103,240,0.22);
  border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ic-title { font-size: 0.9rem; font-weight: 600; color: #fff; }
.ic-body  { font-size: 0.8125rem; color: rgba(255,255,255,0.52); line-height: 1.55; }
.ic-tag   { display: flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 0.75rem; color: rgba(115,103,240,0.65); }

.info-tip {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px;
  background: rgba(115,103,240,0.08); border: 1px solid rgba(115,103,240,0.18);
  border-radius: 10px; font-size: 0.8125rem; color: rgba(255,255,255,0.58); line-height: 1.5;
}
.info-tip.muted { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }

.info-only-banner {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 11px 14px;
  background: rgba(52,211,153,0.07); border: 1px solid rgba(52,211,153,0.22);
  border-radius: 10px; font-size: 0.8125rem; color: rgba(200,245,225,0.72); line-height: 1.5;
}

/* ═══ Synthetics ═══ */
.synth-grid { border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
.synth-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; background: rgba(255,255,255,0.04);
}
.synth-row:not(:last-child) { border-bottom: 1px solid rgba(255,255,255,0.06); }
.synth-icon {
  width: 40px; height: 40px;
  background: rgba(115,103,240,0.1); border: 1px solid rgba(115,103,240,0.18);
  border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.synth-name   { font-size: 0.875rem; font-weight: 500; color: rgba(255,255,255,0.85); }
.synth-detail { font-size: 0.8125rem; color: rgba(255,255,255,0.38); margin-top: 1px; }

.synth-promo {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 14px 16px;
  background: rgba(115,103,240,0.07);
  border: 1px solid rgba(115,103,240,0.2);
  border-radius: 12px;
}
.synth-promo-icon {
  width: 38px; height: 38px; flex-shrink: 0;
  background: rgba(115,103,240,0.15); border: 1px solid rgba(115,103,240,0.25);
  border-radius: 9px; display: flex; align-items: center; justify-content: center;
}
.synth-promo-title { font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.88); margin-bottom: 4px; }
.synth-promo-body  { font-size: 0.8125rem; color: rgba(255,255,255,0.5); line-height: 1.55; }

/* ═══ Done ═══ */
.done-wrap { position: relative; width: 82px; height: 82px; }
.done-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(52,211,153,0.4);
  animation: pulseRing 2.2s ease-out infinite;
}
@keyframes pulseRing {
  0%   { transform: scale(1);   opacity: 0.7; }
  70%  { transform: scale(1.3); opacity: 0; }
  100% { transform: scale(1.3); opacity: 0; }
}
.done-circle {
  position: absolute; inset: 11px;
  background: rgba(52,211,153,0.13); border: 1px solid rgba(52,211,153,0.28);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  animation: bounceIn 0.55s cubic-bezier(0.34,1.56,0.64,1) both 0.05s;
}
@keyframes bounceIn {
  from { transform: scale(0.4); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.done-heading { font-size: 1.85rem; font-weight: 700; color: #fff; }

.summary-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 10px; border: 1px solid;
}
.row-ok   { background: rgba(52,211,153,0.07);  border-color: rgba(52,211,153,0.2); }
.row-skip { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.07); }

.quick-link {
  display: flex; align-items: center; gap: 8px; padding: 11px 14px;
  border-radius: 10px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.72);
  font-size: 0.8125rem; font-weight: 500; text-decoration: none;
  cursor: pointer; transition: all 0.15s ease;
}
.quick-link:hover { background: rgba(115,103,240,0.15); border-color: rgba(115,103,240,0.35); color: #fff; }

/* ═══ Nav bar ═══ */
.nav-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,0.07); min-height: 58px;
}
.nav-back {
  display: inline-flex; align-items: center; gap: 4px;
  height: 38px; padding: 0 14px; border-radius: 9px;
  font-size: 0.875rem; font-weight: 500; color: rgba(160,235,210,0.65);
  background: rgba(0,40,28,0.4); border: 1px solid rgba(0,200,140,0.18);
  cursor: pointer; transition: all 0.15s ease;
}
.nav-back:hover { background: rgba(0,55,38,0.6); border-color: rgba(0,220,160,0.38); color: rgba(160,235,210,0.95); }
.nav-count { font-size: 0.8125rem; color: rgba(255,255,255,0.22); font-variant-numeric: tabular-nums; }

.wz-skip {
  height: 38px; padding: 0 14px; border-radius: 8px; font-size: 0.8125rem;
  color: rgba(160,235,210,0.4); background: transparent;
  border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.15s ease;
}
.wz-skip:hover { color: rgba(160,235,210,0.75); border-color: rgba(255,255,255,0.14); }
</style>
