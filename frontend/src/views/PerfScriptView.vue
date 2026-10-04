<template>
  <div class="space-y-6" data-testid="page-perf-script">
    <RouterLink to="/performance?tab=scripts" class="text-sm text-primary">← Performance scripts</RouterLink>

    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}<span v-if="errorDetail"><br><code class="text-xs">{{ errorDetail }}</code></span></p>
    <p v-if="notice" class="text-sm text-success" role="status">{{ notice }}</p>

    <template v-if="form">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-[280px] space-y-2">
          <input v-model="form.name" class="form-input text-lg font-semibold" aria-label="Script name" data-testid="script-name" @input="dirty = true" />
          <input v-model="form.description" class="form-input" placeholder="What this journey does" aria-label="Description" @input="dirty = true" />
        </div>
        <div class="flex gap-2 flex-wrap">
          <button class="btn btn-primary" :disabled="saving || !dirty" data-testid="script-save" @click="save()">{{ saving ? 'Saving…' : dirty ? 'Save' : 'Saved' }}</button>
          <RouterLink :to="`/performance/scenarios/new?scriptId=${id}`" class="btn btn-secondary" :class="{ 'pointer-events-none opacity-50': dirty }"><Plus :size="14" /> New scenario</RouterLink>
          <button class="btn btn-secondary" @click="downloadText(form.script, `${slug(form.name)}.js`)"><Download :size="14" /> .js</button>
          <button class="btn btn-danger" :disabled="deleting" @click="remove"><Trash2 :size="14" /></button>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <!-- Script -->
        <div class="card xl:col-span-2">
          <div class="card-header flex items-center justify-between gap-2 flex-wrap">
            <h2 class="card-title">Script</h2>
            <div class="flex items-center gap-2">
              <select v-model="form.scriptType" class="form-select" aria-label="Script type" style="width: auto" @change="dirty = true">
                <option value="http">HTTP</option>
                <option value="browser">Browser (k6/browser)</option>
              </select>
              <button class="btn btn-sm btn-secondary" :disabled="improving" data-testid="script-improve" @click="improve">
                <Sparkles :size="14" /> {{ improving ? 'Improving…' : 'Improve with AI' }}
              </button>
            </div>
          </div>
          <div class="card-body">
            <textarea v-model="form.script" class="perf-code" spellcheck="false" aria-label="k6 script" data-testid="script-code" @input="dirty = true" @keydown.tab.prevent="insertTab" />
            <p v-if="aiWarning" class="text-xs text-warning mt-1">{{ aiWarning }}</p>
            <p class="text-xs text-muted mt-1">
              Scenarios replace the script's own <code>vus</code>, <code>duration</code>, <code>stages</code> and <code>scenarios</code> options with their load profile, and add their thresholds to any in the script.
              Read variables with <code>__ENV.NAME</code>; <code>THINK_TIME</code> is set by the scenario when it has one.
            </p>
          </div>
        </div>

        <div class="space-y-6">
          <!-- Variables -->
          <div class="card">
            <div class="card-header"><h2 class="card-title">Variables</h2></div>
            <div class="card-body space-y-2">
              <div v-for="(v, i) in form.envVars" :key="i" class="flex gap-1 items-center">
                <input v-model.trim="v.key" class="form-input font-mono text-xs" style="max-width: 34%" placeholder="NAME" :aria-label="`Variable ${i + 1} name`" @input="dirty = true" />
                <input
                  v-model="v.value"
                  :type="v.sensitive ? 'password' : 'text'"
                  class="form-input text-xs flex-1"
                  :placeholder="v.sensitive ? (v.hasValue ? 'Saved — leave blank to keep' : 'Secret value') : 'value'"
                  autocomplete="off"
                  :aria-label="`Variable ${v.key || i + 1} value`"
                  @input="dirty = true"
                />
                <button type="button" class="btn btn-sm" :class="v.sensitive ? 'btn-warning' : 'btn-secondary'" :aria-pressed="v.sensitive" :title="v.sensitive ? 'Secret: encrypted here, never sent to Continuum' : 'Mark as secret'" @click="v.sensitive = !v.sensitive; dirty = true">
                  <Lock v-if="v.sensitive" :size="13" /><Unlock v-else :size="13" />
                </button>
                <button type="button" class="btn btn-sm btn-secondary" :aria-label="`Remove ${v.key || 'variable'}`" @click="form.envVars.splice(i, 1); dirty = true"><X :size="13" /></button>
              </div>
              <button type="button" class="btn btn-sm btn-secondary" @click="form.envVars.push({ key: '', value: '', sensitive: false }); dirty = true"><Plus :size="13" /> Add variable</button>
              <p class="text-xs text-muted">Secrets are encrypted on this machine and used for runs here. Continuum gets the names only; set the values there.</p>
            </div>
          </div>

          <!-- Smoke run -->
          <div class="card">
            <div class="card-header flex items-center justify-between">
              <h2 class="card-title">Smoke run</h2>
              <button class="btn btn-sm btn-success" :disabled="smoking || !k6Installed" data-testid="script-smoke" @click="smoke"><Play :size="14" /> {{ smoking ? 'Running…' : 'Run once' }}</button>
            </div>
            <div class="card-body text-sm space-y-2">
              <K6InstallCard @installed="k6Installed = true" />
              <p class="text-xs text-muted">One user, one iteration, on this machine. Saves first if there are changes.</p>
              <template v-if="smokeResult">
                <p>
                  <span :class="['badge', smokeResult.ok ? 'badge-success' : 'badge-danger']">{{ smokeResult.ok ? 'Passed' : 'Failed' }}</span>
                  <span class="text-muted ml-2">{{ smokeResult.requests ?? 0 }} requests · checks {{ smokeResult.checks?.passes ?? 0 }} passed, {{ smokeResult.checks?.fails ?? 0 }} failed · avg {{ ms(smokeResult.avgDurationMs) }}</span>
                </p>
                <p v-if="smokeResult.error" class="text-danger">{{ smokeResult.error }}</p>
                <ul v-if="smokeResult.failedChecks?.length" class="text-danger text-xs list-disc pl-5">
                  <li v-for="c in smokeResult.failedChecks" :key="(c.group || '') + c.name">{{ c.group ? `${c.group} › ` : '' }}{{ c.name }}</li>
                </ul>
                <details>
                  <summary class="text-xs text-muted cursor-pointer">Console output</summary>
                  <pre class="perf-console">{{ smokeResult.console }}</pre>
                </details>
                <p v-if="lastSmokeAt" class="text-xs text-muted">{{ when(lastSmokeAt) }}</p>
              </template>
            </div>
          </div>

          <!-- Used by -->
          <div class="card">
            <div class="card-header"><h2 class="card-title">Scenarios using this script</h2></div>
            <div class="card-body text-sm">
              <ul v-if="usedBy.length" class="space-y-1">
                <li v-for="s in usedBy" :key="s.id"><RouterLink :to="`/performance/scenarios/${s.id}`" class="text-primary">{{ s.name }}</RouterLink></li>
              </ul>
              <p v-else class="text-muted">None yet.</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { Plus, Download, Trash2, Sparkles, Play, Lock, Unlock, X } from 'lucide-vue-next'
import api from '@/lib/api'
import K6InstallCard from '@/components/Performance/K6InstallCard.vue'
import { ms, when, apiError, downloadText, slug, k6Status } from '@/components/Performance/perfFormat'

const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id)
const form = ref(null)
const usedBy = ref([])
const dirty = ref(false)
const saving = ref(false)
const deleting = ref(false)
const improving = ref(false)
const smoking = ref(false)
const smokeResult = ref(null)
const lastSmokeAt = ref(null)
const k6Installed = ref(true)
const aiWarning = ref('')
const error = ref('')
const errorDetail = ref('')
const notice = ref(route.query.imported ? `Built from the HAR file: ${route.query.imported} requests kept. Review the script, then run it once.` : '')

function fail (e, fallback) {
  error.value = apiError(e, fallback)
  errorDetail.value = e?.response?.data?.detail && typeof e.response.data.detail === 'string' ? e.response.data.detail : ''
}

function fill (s) {
  form.value = { name: s.name, description: s.description, scriptType: s.scriptType, script: s.script, envVars: s.envVars.map(v => ({ ...v })) }
  usedBy.value = s.scenarios || usedBy.value
  smokeResult.value = s.lastSmoke
  lastSmokeAt.value = s.lastSmokeAt
  dirty.value = false
}

async function load () {
  try {
    const { data } = await api.get(`/api/performance/scripts/${id.value}`)
    fill(data.script)
    k6Installed.value = (await k6Status()).installed
  } catch (e) {
    fail(e, 'Could not load the script')
  }
}

async function save () {
  saving.value = true
  error.value = ''
  try {
    const { data } = await api.put(`/api/performance/scripts/${id.value}`, form.value)
    fill({ ...data.script, scenarios: usedBy.value })
    notice.value = ''
    return true
  } catch (e) {
    fail(e, 'Could not save the script')
    return false
  } finally {
    saving.value = false
  }
}

async function improve () {
  improving.value = true
  error.value = ''
  aiWarning.value = ''
  try {
    const { data } = await api.post('/api/k6/improve', { script: form.value.script }, { timeout: 180000 })
    form.value.script = data.script
    aiWarning.value = data.warning || ''
    dirty.value = true
  } catch (e) {
    fail(e, 'The AI could not improve the script')
  } finally {
    improving.value = false
  }
}

async function smoke () {
  if (dirty.value && !(await save())) return
  smoking.value = true
  error.value = ''
  try {
    const { data } = await api.post(`/api/performance/scripts/${id.value}/smoke`, {}, { timeout: 180000 })
    smokeResult.value = data.smoke
    lastSmokeAt.value = new Date().toISOString()
  } catch (e) {
    fail(e, 'The smoke run failed to start')
  } finally {
    smoking.value = false
  }
}

async function remove () {
  if (!confirm(`Delete the script "${form.value.name}"?`)) return
  deleting.value = true
  try {
    await api.delete(`/api/performance/scripts/${id.value}`)
    dirty.value = false
    router.push('/performance?tab=scripts')
  } catch (e) {
    fail(e, 'Could not delete the script')
  } finally {
    deleting.value = false
  }
}

function insertTab (ev) {
  const el = ev.target
  const { selectionStart: s, selectionEnd: e } = el
  form.value.script = form.value.script.slice(0, s) + '  ' + form.value.script.slice(e)
  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
  dirty.value = true
}

onBeforeRouteLeave(() => (dirty.value ? confirm('Leave without saving your changes?') : true))
onMounted(load)
</script>

<style scoped>
.perf-code { width: 100%; min-height: 520px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.5; padding: 12px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background, #fafafa); color: var(--color-body); resize: vertical; tab-size: 2; }
.perf-console { max-height: 260px; overflow: auto; font-size: 11px; white-space: pre-wrap; background: var(--color-background, #fafafa); padding: 8px; border-radius: 6px; }
</style>
