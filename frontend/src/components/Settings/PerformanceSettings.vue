<template>
  <div class="space-y-6" data-testid="page-performance-settings">
    <p class="text-body text-body-color">How performance scenarios run on this machine, and the defaults new scenarios start with.</p>

    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
    <p v-if="saved" class="text-sm text-success" role="status">Saved.</p>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- k6 -->
      <div class="card">
        <div class="card-header"><h2 class="card-title flex items-center gap-2"><Gauge :size="20" class="text-primary" /> k6 engine</h2></div>
        <div class="card-body space-y-3 text-sm">
          <template v-if="k6.installed">
            <p><span class="badge badge-success">Installed</span> <span class="ml-2">k6 {{ k6.version }}</span></p>
            <p class="text-xs text-muted break-all">{{ k6.path }}</p>
          </template>
          <K6InstallCard v-else @installed="refreshK6" />
          <p class="text-xs text-muted">Aurora uses its own copy of k6, matched to the version Continuum runs, so a scenario behaves the same in both places.</p>
        </div>
      </div>

      <!-- Limits -->
      <div class="card">
        <div class="card-header"><h2 class="card-title">Local run limits</h2></div>
        <div class="card-body space-y-3" v-if="form">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="ps-vus">Maximum virtual users</label>
              <input id="ps-vus" v-model.number="form.maxVus" type="number" min="1" :max="maxLocalVus" class="form-input" data-testid="ps-max-vus" />
              <p class="text-xs text-muted mt-1">Up to {{ maxLocalVus }}. Lower it on a less powerful machine. Bigger loads belong in Continuum.</p>
            </div>
            <div>
              <label class="form-label" for="ps-dur">Longest run (minutes)</label>
              <input id="ps-dur" v-model.number="form.maxDurationMin" type="number" min="1" max="60" class="form-input" />
            </div>
            <div>
              <label class="form-label" for="ps-keep">Runs kept per scenario</label>
              <input id="ps-keep" v-model.number="form.keepRunsPerScenario" type="number" min="5" max="500" class="form-input" />
              <p class="text-xs text-muted mt-1">Older runs are deleted; the baseline is always kept.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Regression rules -->
      <div class="card">
        <div class="card-header"><h2 class="card-title">Regression against the baseline</h2></div>
        <div class="card-body space-y-3" v-if="form">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="ps-tol">Slower by more than (%)</label>
              <input id="ps-tol" v-model.number="form.regressionTolerancePct" type="number" min="0" max="500" class="form-input" />
            </div>
            <div>
              <label class="form-label" for="ps-pts">Errors up by more than (points)</label>
              <input id="ps-pts" v-model.number="form.regressionFailRatePts" type="number" min="0" max="100" class="form-input" />
            </div>
          </div>
          <p class="text-xs text-muted">Compares the median, average and 95th percentile, and the error rate, with the scenario's baseline run when the load is the same.</p>
        </div>
      </div>

      <!-- Defaults for new scenarios -->
      <div class="card">
        <div class="card-header"><h2 class="card-title">Defaults for new scenarios</h2></div>
        <div class="card-body space-y-3" v-if="form">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label" for="ps-p95">95th percentile under (ms)</label>
              <input id="ps-p95" v-model="form.defaultThresholds.p95Ms" type="number" min="1" class="form-input" placeholder="none" />
            </div>
            <div>
              <label class="form-label" for="ps-avg">Average under (ms)</label>
              <input id="ps-avg" v-model="form.defaultThresholds.avgMs" type="number" min="1" class="form-input" placeholder="none" />
            </div>
            <div>
              <label class="form-label" for="ps-err">Errors under (%)</label>
              <input id="ps-err" v-model="form.defaultThresholds.maxFailRatePct" type="number" min="0" max="100" step="0.1" class="form-input" placeholder="none" />
            </div>
            <div>
              <label class="form-label" for="ps-think">Think time (s)</label>
              <input id="ps-think" v-model.number="form.defaultThinkTimeSec" type="number" min="0" max="60" step="0.1" class="form-input" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" v-if="form">
      <div class="card-header"><h2 class="card-title">Default load profile</h2></div>
      <div class="card-body">
        <LoadProfileEditor v-model="form.defaultLoad" :max-vus="Math.min(form.maxVus || maxLocalVus, maxLocalVus)" :max-duration-min="form.maxDurationMin || 60" @valid="v => (loadValid = v)" />
      </div>
    </div>

    <div class="flex justify-end">
      <button class="btn btn-primary" :disabled="saving || !form || !loadValid" data-testid="ps-save" @click="save">{{ saving ? 'Saving…' : 'Save settings' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Gauge } from 'lucide-vue-next'
import api from '@/lib/api'
import K6InstallCard from '@/components/Performance/K6InstallCard.vue'
import LoadProfileEditor from '@/components/Performance/LoadProfileEditor.vue'
import { apiError, k6Status, MAX_LOCAL_VUS } from '@/components/Performance/perfFormat'

const form = ref(null)
const k6 = ref({ installed: true })
const maxLocalVus = ref(MAX_LOCAL_VUS)
const loadValid = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref('')

const blank = v => (v === null || v === undefined ? '' : v)

async function load () {
  try {
    const { data } = await api.get('/api/performance/settings')
    const s = data.settings
    maxLocalVus.value = data.maxLocalVus
    k6.value = data.k6
    form.value = { ...s, defaultThresholds: { p95Ms: blank(s.defaultThresholds.p95Ms), avgMs: blank(s.defaultThresholds.avgMs), maxFailRatePct: blank(s.defaultThresholds.maxFailRatePct) } }
  } catch (e) {
    error.value = apiError(e, 'Could not load the performance settings')
  }
}

async function refreshK6 () {
  k6.value = await k6Status()
}

async function save () {
  saving.value = true
  saved.value = false
  error.value = ''
  try {
    const n = v => (v === '' || v === null || v === undefined ? null : Number(v))
    const t = form.value.defaultThresholds
    const { data } = await api.put('/api/performance/settings', {
      maxVus: form.value.maxVus,
      maxDurationMin: form.value.maxDurationMin,
      keepRunsPerScenario: form.value.keepRunsPerScenario,
      regressionTolerancePct: form.value.regressionTolerancePct,
      regressionFailRatePts: form.value.regressionFailRatePts,
      defaultThinkTimeSec: form.value.defaultThinkTimeSec,
      defaultThresholds: { p95Ms: n(t.p95Ms), avgMs: n(t.avgMs), maxFailRatePct: n(t.maxFailRatePct) },
      defaultLoad: form.value.defaultLoad
    })
    form.value = { ...data.settings, defaultThresholds: { p95Ms: blank(data.settings.defaultThresholds.p95Ms), avgMs: blank(data.settings.defaultThresholds.avgMs), maxFailRatePct: blank(data.settings.defaultThresholds.maxFailRatePct) } }
    saved.value = true
  } catch (e) {
    error.value = apiError(e, 'Could not save the settings')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
