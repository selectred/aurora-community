<template>
  <div class="space-y-4" data-testid="page-prompts-settings">
    <div class="flex items-center gap-3">
      <button class="btn btn-secondary btn-sm" @click="$router.back()">
        <ArrowLeft :size="14" /> Back
      </button>
      <p class="text-body text-body-color">Customise the AI system prompts used at each stage of the pipeline.</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <Loader2 :size="28" class="animate-spin text-primary" />
    </div>

    <template v-else>
      <!-- Upgrade banner -->
      <div v-if="!isPro" class="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/8 px-4 py-3">
        <Lock :size="16" class="text-warning shrink-0" />
        <div class="text-sm">
          <span class="font-medium text-heading">Pro feature</span>
          <span class="text-muted ml-1">— editing AI prompts requires a Pro or Unlimited license.</span>
        </div>
      </div>

      <!-- Two-panel layout -->
      <div class="card overflow-hidden" style="display: grid; grid-template-columns: 200px 1fr; min-height: 580px;">

        <!-- Left sidebar -->
        <div class="border-r border-border flex flex-col" style="background: var(--bg-sidebar, var(--bg-card));">
          <!-- Pipeline group -->
          <div class="px-3 pt-4 pb-1">
            <span class="text-xs font-semibold text-muted uppercase tracking-wider">Pipeline</span>
          </div>
          <nav class="flex flex-col gap-0.5 px-2 pb-2">
            <button
              v-for="key in pipelineKeys"
              :key="key"
              @click="selectedKey = key; suggestion = null"
              class="prompt-nav-item"
              :class="selectedKey === key ? 'prompt-nav-item--active' : ''"
            >
              <span class="truncate">{{ PROMPT_META[key].label }}</span>
              <span class="flex items-center gap-1 shrink-0">
                <span v-if="isModified(key)" class="prompt-modified-dot" title="Modified" />
                <span
                  v-if="hallucinationCounts[key] >= ANALYZE_THRESHOLD && isPro"
                  class="text-xs font-semibold text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
                  :class="selectedKey === key ? 'bg-white/30' : 'bg-danger'"
                  :title="`${hallucinationCounts[key]} hallucination events — click Analyze to improve`"
                >{{ hallucinationCounts[key] }}</span>
              </span>
            </button>
          </nav>


          <!-- Library group (collapsible) -->
          <div class="px-3 pt-3 pb-1">
            <button
              @click="libraryOpen = !libraryOpen"
              class="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider hover:text-heading transition-colors"
            >
              <ChevronRight :size="12" :class="libraryOpen ? 'rotate-90' : ''" class="transition-transform" />
              Library
            </button>
          </div>
          <nav v-if="libraryOpen" class="flex flex-col gap-0.5 px-2 pb-3">
            <button
              v-for="key in libraryKeys"
              :key="key"
              @click="selectedKey = key; suggestion = null"
              class="prompt-nav-item"
              :class="selectedKey === key ? 'prompt-nav-item--active' : ''"
            >
              <span class="truncate">{{ PROMPT_META[key].label }}</span>
              <span class="flex items-center gap-1 shrink-0">
                <span v-if="isModified(key)" class="prompt-modified-dot" title="Modified" />
                <span
                  v-if="hallucinationCounts[key] >= ANALYZE_THRESHOLD && isPro"
                  class="text-xs font-semibold text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
                  :class="selectedKey === key ? 'bg-white/30' : 'bg-danger'"
                  :title="`${hallucinationCounts[key]} hallucination events`"
                >{{ hallucinationCounts[key] }}</span>
              </span>
            </button>
          </nav>

          <!-- Reset all at the bottom -->
          <div class="mt-auto border-t border-border p-3">
            <button
              v-if="isPro"
              @click="resetAll"
              :disabled="saving"
              class="btn btn-secondary w-full text-xs"
              title="Reset all prompts to factory defaults"
            >
              Reset All
            </button>
          </div>
        </div>

        <!-- Right editor panel -->
        <div class="flex flex-col min-w-0">
          <!-- Editor header -->
          <div class="px-4 py-3 border-b border-border flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-heading text-sm">{{ meta?.label }}</h3>
                <span v-if="isModified(selectedKey)" class="badge badge-warning text-xs">Modified</span>
              </div>
              <p class="text-xs text-muted mt-0.5">{{ meta?.desc }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-muted font-mono">{{ charCount }}</span>
              <button
                v-if="canAnalyze && isPro"
                @click="analyzePrompt"
                :disabled="analyzing"
                class="btn btn-sm flex items-center gap-1.5"
                style="background: var(--color-warning); color: #fff; border-color: transparent;"
                :title="`${hallucinationCounts[selectedKey]} hallucination events recorded — click to get an AI-suggested improvement`"
              >
                <Loader2 v-if="analyzing" :size="13" class="animate-spin" />
                <AlertTriangle v-else :size="13" />
                {{ analyzing ? 'Analysing…' : `Analyse (${hallucinationCounts[selectedKey]})` }}
              </button>
              <span v-if="analyzeError && !suggestion" class="text-xs text-danger">{{ analyzeError }}</span>
              <span v-if="saveSuccess" class="text-sm text-success flex items-center gap-1">
                <CheckCircle2 :size="14" /> Saved
              </span>
            </div>
          </div>

          <!-- Textarea -->
          <textarea
            v-if="selectedKey"
            v-model="activeText"
            class="flex-1 font-mono text-xs leading-relaxed w-full border-0 resize-none focus:ring-0 focus:outline-none p-4"
            style="background: transparent; color: var(--text-body); min-height: 300px;"
            :placeholder="meta?.label"
            :readonly="!isPro"
            :class="!isPro ? 'opacity-60 cursor-not-allowed' : ''"
            spellcheck="false"
          />

          <!-- AI Suggestion panel -->
          <div v-if="suggestion" class="border-t border-warning/40 bg-warning/5 p-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-heading flex items-center gap-1.5">
                  <Sparkles :size="14" class="text-warning" />
                  AI-Suggested Improvement
                </p>
                <p class="text-xs text-muted mt-0.5">Based on {{ suggestion.eventCount }} failure events · {{ Object.entries(suggestion.failureTypes).map(([k,v]) => `${v}×${k}`).join(', ') }}</p>
              </div>
              <button @click="suggestion = null" class="text-muted hover:text-heading shrink-0" title="Dismiss">
                <X :size="16" />
              </button>
            </div>
            <p class="text-xs text-body">{{ suggestion.changesSummary }}</p>
            <div class="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <p class="text-muted mb-1 font-sans">Current</p>
                <pre class="bg-surface rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap text-body border border-border">{{ activeText }}</pre>
              </div>
              <div>
                <p class="text-success mb-1 font-sans">Suggested</p>
                <pre class="bg-surface rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap text-body border border-success/30">{{ suggestion.text }}</pre>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <button @click="applySuggestion" :disabled="saving" class="btn btn-success btn-sm">
                <Loader2 v-if="saving" :size="13" class="animate-spin mr-1" />
                Apply &amp; Save
              </button>
              <button @click="suggestion = null" class="btn btn-secondary btn-sm">Dismiss</button>
              <span v-if="analyzeError" class="text-xs text-danger">{{ analyzeError }}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between px-4 py-3 border-t border-border">
            <button
              @click="resetKey(selectedKey)"
              :disabled="saving || !isModified(selectedKey) || !isPro"
              class="btn btn-secondary btn-sm"
            >
              Reset this prompt
            </button>
            <div class="flex items-center gap-3">
              <span v-if="saveError" class="text-sm text-danger">{{ saveError }}</span>
              <button
                @click="saveAll"
                :disabled="saving || !isPro"
                class="btn btn-primary btn-sm"
              >
                <Loader2 v-if="saving" :size="14" class="animate-spin mr-1" />
                {{ saving ? 'Saving…' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Loader2, CheckCircle2, ChevronRight, Lock, AlertTriangle, Sparkles, X, ArrowLeft } from 'lucide-vue-next'
import api from '@/lib/api'
import { useAppStore } from '@/stores/appStore'

const appStore = useAppStore()
const isPro = computed(() => appStore.licenseTier === 'pro' || appStore.licenseTier === 'unlimited')

const ANALYZE_THRESHOLD = 5

const PROMPT_META = {
  base_playwright_rules:  { label: 'Universal Rules',       desc: 'Prepended to every code-generation prompt automatically. Fix a rule here once and it applies to all stages — Generate, Heal, POM, Fixture, TypeScript spec, and data-driven modes.' },
  plan_with_probe:        { label: 'Plan — with probe',     desc: 'Used when the target URL has been probed. Instructs the AI to use real element names from the live page structure.' },
  plan_no_probe:          { label: 'Plan — no probe',       desc: 'Used when generating a plan from description alone. Conservative — avoids inventing UI elements that may not exist.' },
  generate_runnable_spec: { label: 'Generate spec',         desc: 'Main code generation stage. Produces a self-contained Playwright JS module for in-app execution — no test runner required.' },
  heal:                   { label: 'Heal (single step)',    desc: 'Diagnoses a single failing step and returns a JSON fix. Used by the selector heal flow.' },
  heal_runnable_spec:     { label: 'Heal (full spec)',      desc: 'Regenerates the complete spec fixing every failing step. Applied when a run has categorised failures.' },
  generate_code:          { label: 'Generate code',         desc: 'Legacy generate-code flow (library / POM workflow).' },
  page_object:            { label: 'Page Object Model',     desc: 'Generates a TypeScript POM class from probe data.' },
  fixture:                { label: 'Fixture file',          desc: 'Generates a Playwright test.extend() fixture file.' },
  typescript_spec:        { label: 'TypeScript spec',       desc: 'Generates a .spec.ts file using the POM fixture.' },
  bug_title:              { label: 'Bug title',             desc: 'Short prompt for generating concise bug report titles.' },
}

const pipelineKeys = ['base_playwright_rules', 'plan_with_probe', 'plan_no_probe', 'generate_runnable_spec', 'heal', 'heal_runnable_spec']
const libraryKeys  = ['generate_code', 'page_object', 'fixture', 'typescript_spec', 'bug_title']

const loading      = ref(true)
const saving       = ref(false)
const analyzing    = ref(false)
const saveSuccess  = ref(false)
const saveError    = ref('')
const analyzeError = ref('')
const selectedKey  = ref('base_playwright_rules')
const libraryOpen  = ref(false)

const prompts            = reactive({})
const defaults           = reactive({})
const hallucinationCounts = reactive({})
const suggestion         = ref(null)

const meta = computed(() => selectedKey.value ? PROMPT_META[selectedKey.value] : null)

// Always fall back to the compiled-in default if the saved value is empty.
// This ensures new prompt keys (e.g. base_playwright_rules) are always visible
// on first launch before the user has ever saved.
const activeText = computed({
  get: () => prompts[selectedKey.value] || defaults[selectedKey.value] || '',
  set: val => { prompts[selectedKey.value] = val }
})

const charCount = computed(() => {
  const len = activeText.value?.length || 0
  return len > 0 ? `${len.toLocaleString()} chars` : ''
})
const canAnalyze = computed(() =>
  (hallucinationCounts[selectedKey.value] || 0) >= ANALYZE_THRESHOLD && !suggestion.value
)

function isModified(key) {
  return prompts[key] !== defaults[key]
}

async function fetchPrompts() {
  loading.value = true
  try {
    const [promptsRes, countsRes] = await Promise.all([
      api.get('/api/prompts'),
      api.get('/api/hallucinations/counts').catch(() => ({ data: { counts: {} } }))
    ])
    Object.assign(prompts, promptsRes.data.prompts)
    Object.assign(defaults, promptsRes.data.defaults)
    Object.assign(hallucinationCounts, countsRes.data.counts || {})
  } catch (err) {
    saveError.value = 'Failed to load prompts.'
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function saveAll() {
  saving.value = true
  saveSuccess.value = false
  saveError.value = ''
  try {
    await api.put('/api/prompts', { prompts })
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (err) {
    saveError.value = err.response?.data?.message || 'Failed to save prompts.'
  } finally {
    saving.value = false
  }
}

async function resetKey(key) {
  try {
    const { data } = await api.post(`/api/prompts/reset/${key}`)
    prompts[key] = data.value
    defaults[key] = data.value
  } catch (err) {
    saveError.value = `Failed to reset "${PROMPT_META[key]?.label || key}".`
  }
}

async function resetAll() {
  if (!confirm('Reset ALL prompts to their factory defaults? This cannot be undone.')) return
  saving.value = true
  saveSuccess.value = false
  saveError.value = ''
  try {
    const { data } = await api.post('/api/prompts/reset-all')
    Object.assign(prompts, data.prompts)
    Object.assign(defaults, data.prompts)
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (err) {
    saveError.value = err.response?.data?.message || 'Failed to reset prompts.'
  } finally {
    saving.value = false
  }
}

async function analyzePrompt() {
  analyzing.value = true
  analyzeError.value = ''
  suggestion.value = null
  try {
    const { data } = await api.post(`/api/hallucinations/analyze/${selectedKey.value}`)
    suggestion.value = {
      text: data.suggestion,
      changesSummary: data.changesSummary,
      eventCount: data.eventCount,
      failureTypes: data.failureTypes
    }
  } catch (err) {
    analyzeError.value = err.response?.data?.message || 'Analysis failed.'
  } finally {
    analyzing.value = false
  }
}

async function applySuggestion() {
  if (!suggestion.value) return
  prompts[selectedKey.value] = suggestion.value.text
  await saveAll()
  // Mark events as resolved so the badge clears
  await api.post(`/api/hallucinations/resolve/${selectedKey.value}`).catch(() => {})
  hallucinationCounts[selectedKey.value] = 0
  suggestion.value = null
}

onMounted(fetchPrompts)
</script>

<style scoped>
.prompt-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--text-body);
  text-align: left;
  width: 100%;
  transition: background 0.15s, color 0.15s;
}
.prompt-nav-item:hover {
  background: var(--bg-hover, rgba(115, 103, 240, 0.08));
  color: var(--text-heading);
}
.prompt-nav-item--active {
  background: var(--color-primary);
  color: #fff;
}
.prompt-nav-item--active:hover {
  background: var(--color-primary);
  color: #fff;
}
.prompt-modified-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  flex-shrink: 0;
}
.prompt-nav-item--active .prompt-modified-dot {
  background: rgba(255,255,255,0.7);
}
</style>
