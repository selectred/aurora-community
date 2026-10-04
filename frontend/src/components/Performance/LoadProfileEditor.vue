<template>
  <div class="space-y-4" data-testid="load-profile-editor">
    <div>
      <label class="form-label">Load shape</label>
      <div class="flex gap-2 flex-wrap" role="radiogroup" aria-label="Load shape">
        <button
          v-for="t in LOAD_TYPES"
          :key="t.id"
          type="button"
          class="btn btn-sm"
          :class="load.executor === t.id ? 'btn-primary' : 'btn-secondary'"
          :aria-pressed="load.executor === t.id"
          :data-testid="`load-type-${t.id}`"
          @click="setExecutor(t.id)"
        >{{ t.label }}</button>
      </div>
      <p class="text-xs text-muted mt-1">{{ LOAD_TYPES.find(t => t.id === load.executor)?.hint }}</p>
    </div>

    <!-- Ramp in stages -->
    <template v-if="load.executor === 'ramping-vus'">
      <div class="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <label class="form-label">Starting users</label>
          <input v-model.number="load.startVUs" type="number" min="0" :max="maxVus" class="form-input" @input="emitChange" />
        </div>
      </div>
      <div>
        <label class="form-label">Stages</label>
        <table class="table" aria-label="Load stages">
          <thead><tr><th>#</th><th>Duration</th><th>Ramp to users</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in load.stages" :key="i">
              <td class="text-muted">{{ i + 1 }}</td>
              <td><input v-model.trim="s.duration" class="form-input" placeholder="e.g. 30s, 2m" :aria-label="`Stage ${i + 1} duration`" :data-testid="`stage-duration-${i}`" @input="emitChange" /></td>
              <td><input v-model.number="s.target" type="number" min="0" :max="maxVus" class="form-input" :aria-label="`Stage ${i + 1} target users`" :data-testid="`stage-target-${i}`" @input="emitChange" /></td>
              <td class="text-right">
                <button type="button" class="btn btn-sm btn-secondary" :disabled="load.stages.length === 1" :aria-label="`Remove stage ${i + 1}`" @click="removeStage(i)"><Trash2 :size="14" /></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="flex gap-2 mt-2 flex-wrap">
          <button type="button" class="btn btn-sm btn-secondary" data-testid="add-stage" @click="addStage"><Plus :size="14" /> Add stage</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Ramp up, hold, ramp down" @click="preset('load')">Load test shape</button>
          <button type="button" class="btn btn-sm btn-secondary" title="Climb in steps to the cap" @click="preset('stress')">Stress shape</button>
          <button type="button" class="btn btn-sm btn-secondary" title="A sudden burst and back" @click="preset('spike')">Spike shape</button>
        </div>
      </div>
    </template>

    <!-- Steady users -->
    <div v-else-if="load.executor === 'constant-vus'" class="grid grid-cols-2 gap-3 max-w-md">
      <div>
        <label class="form-label">Users</label>
        <input v-model.number="load.vus" type="number" min="1" :max="maxVus" class="form-input" data-testid="load-vus" @input="emitChange" />
      </div>
      <div>
        <label class="form-label">Duration</label>
        <input v-model.trim="load.duration" class="form-input" placeholder="e.g. 5m" data-testid="load-duration" @input="emitChange" />
      </div>
    </div>

    <!-- Steady arrival rate -->
    <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div>
        <label class="form-label">Journeys started</label>
        <input v-model.number="load.rate" type="number" min="1" class="form-input" @input="emitChange" />
      </div>
      <div>
        <label class="form-label">Per</label>
        <select v-model="load.timeUnit" class="form-select" @change="emitChange">
          <option value="1s">second</option>
          <option value="1m">minute</option>
        </select>
      </div>
      <div>
        <label class="form-label">Duration</label>
        <input v-model.trim="load.duration" class="form-input" placeholder="e.g. 5m" @input="emitChange" />
      </div>
      <div>
        <label class="form-label">Users (allocated / max)</label>
        <div class="flex gap-1">
          <input v-model.number="load.preAllocatedVUs" type="number" min="1" :max="maxVus" class="form-input" aria-label="Pre-allocated users" @input="emitChange" />
          <input v-model.number="load.maxVUs" type="number" min="1" :max="maxVus" class="form-input" aria-label="Maximum users" @input="emitChange" />
        </div>
      </div>
    </div>

    <ul v-if="errors.length" class="text-sm text-danger list-disc pl-5" role="alert">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <div>
      <div class="flex items-center justify-between text-xs text-muted mb-1">
        <span>Virtual users over time</span>
        <span>Peak {{ peak }} of {{ maxVus }} · {{ seconds(total) }}</span>
      </div>
      <PerfLineChart
        :labels="preview.map(p => seconds(p.tSec))"
        :series="[{ label: 'Virtual users', data: preview.map(p => p.vus), color: '#7367F0', fill: true }]"
        :height="160"
        y-title="Users"
      />
    </div>
  </div>
</template>

<script setup>
// Edits a load profile in place (v-model). Mirrors the backend's validation
// so problems show while typing; the backend checks again on save.
import { reactive, computed, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import PerfLineChart from './PerfLineChart.vue'
import { LOAD_TYPES, MAX_LOCAL_VUS, seconds } from './perfFormat'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  maxVus: { type: Number, default: MAX_LOCAL_VUS },
  maxDurationMin: { type: Number, default: 60 }
})
const emit = defineEmits(['update:modelValue', 'valid'])

const load = reactive(normalise(props.modelValue))
watch(() => props.modelValue, v => { if (JSON.stringify(v) !== JSON.stringify(clean())) Object.assign(load, normalise(v)) }, { deep: true })

function normalise (v = {}) {
  return {
    executor: v.executor || 'ramping-vus',
    startVUs: v.startVUs ?? 0,
    stages: Array.isArray(v.stages) && v.stages.length ? v.stages.map(s => ({ duration: s.duration, target: s.target })) : [{ duration: '30s', target: 5 }, { duration: '2m', target: 5 }, { duration: '15s', target: 0 }],
    vus: v.vus ?? 5,
    duration: v.duration ?? '2m',
    rate: v.rate ?? 5,
    timeUnit: v.timeUnit ?? '1s',
    preAllocatedVUs: v.preAllocatedVUs ?? 5,
    maxVUs: v.maxVUs ?? null
  }
}

// Only the fields that apply to the chosen shape.
function clean () {
  if (load.executor === 'ramping-vus') return { executor: load.executor, startVUs: load.startVUs, stages: load.stages.map(s => ({ duration: s.duration, target: s.target })) }
  if (load.executor === 'constant-vus') return { executor: load.executor, vus: load.vus, duration: load.duration }
  const out = { executor: load.executor, rate: load.rate, timeUnit: load.timeUnit, duration: load.duration, preAllocatedVUs: load.preAllocatedVUs }
  if (load.maxVUs) out.maxVUs = load.maxVUs
  return out
}

function emitChange () {
  emit('update:modelValue', clean())
}

function durationSec (d) {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(d || '').trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return { ms: n / 1000, s: n, m: n * 60, h: n * 3600 }[m[2]]
}

const isInt = (v, min) => Number.isInteger(Number(v)) && v !== '' && v !== null && Number(v) >= min

const errors = computed(() => {
  const e = []
  const cap = props.maxVus
  const users = (label, v, min = 1) => {
    if (!isInt(v, min)) e.push(`${label} must be a whole number of at least ${min}`)
    else if (Number(v) > cap) e.push(`${label} is ${v}; local runs are limited to ${cap} users`)
  }
  const dur = (label, v) => { if (!(durationSec(v) > 0)) e.push(`${label} must be a duration like 30s, 5m or 1h`) }
  if (load.executor === 'ramping-vus') {
    users('Starting users', load.startVUs, 0)
    load.stages.forEach((s, i) => { dur(`Stage ${i + 1} duration`, s.duration); users(`Stage ${i + 1} target`, s.target, 0) })
  } else if (load.executor === 'constant-vus') {
    users('Users', load.vus); dur('Duration', load.duration)
  } else {
    if (!isInt(load.rate, 1)) e.push('Rate must be at least 1')
    dur('Duration', load.duration)
    users('Allocated users', load.preAllocatedVUs)
    if (load.maxVUs) { users('Maximum users', load.maxVUs); if (Number(load.maxVUs) < Number(load.preAllocatedVUs)) e.push('Maximum users must be at least the allocated users') }
  }
  if (!e.length && total.value > props.maxDurationMin * 60) e.push(`Runs are limited to ${props.maxDurationMin} minutes`)
  if (!e.length && peak.value < 1) e.push('The profile never starts a user')
  return e
})

const total = computed(() => {
  if (load.executor === 'ramping-vus') return load.stages.reduce((s, x) => s + (durationSec(x.duration) || 0), 0)
  return durationSec(load.duration) || 0
})

const peak = computed(() => {
  if (load.executor === 'ramping-vus') return Math.max(Number(load.startVUs) || 0, ...load.stages.map(s => Number(s.target) || 0))
  if (load.executor === 'constant-vus') return Number(load.vus) || 0
  return Math.max(Number(load.preAllocatedVUs) || 0, Number(load.maxVUs) || 0)
})

const preview = computed(() => {
  if (load.executor === 'ramping-vus') {
    const pts = [{ tSec: 0, vus: Number(load.startVUs) || 0 }]
    let t = 0
    for (const s of load.stages) { t += durationSec(s.duration) || 0; pts.push({ tSec: t, vus: Number(s.target) || 0 }) }
    return pts
  }
  const v = load.executor === 'constant-vus' ? Number(load.vus) || 0 : Number(load.maxVUs || load.preAllocatedVUs) || 0
  return [{ tSec: 0, vus: v }, { tSec: total.value, vus: v }]
})

watch(errors, e => emit('valid', e.length === 0), { immediate: true })

function setExecutor (id) {
  load.executor = id
  emitChange()
}

function addStage () {
  const last = load.stages[load.stages.length - 1]
  load.stages.push({ duration: '1m', target: last ? last.target : 1 })
  emitChange()
}

function removeStage (i) {
  load.stages.splice(i, 1)
  emitChange()
}

function preset (kind) {
  const cap = props.maxVus
  const half = Math.max(1, Math.round(cap / 2))
  load.executor = 'ramping-vus'
  load.startVUs = 0
  if (kind === 'load') load.stages = [{ duration: '1m', target: half }, { duration: '5m', target: half }, { duration: '30s', target: 0 }]
  else if (kind === 'stress') load.stages = [{ duration: '1m', target: Math.max(1, Math.round(cap / 4)) }, { duration: '2m', target: half }, { duration: '2m', target: Math.max(1, Math.round(cap * 0.75)) }, { duration: '2m', target: cap }, { duration: '1m', target: 0 }]
  else load.stages = [{ duration: '30s', target: 2 }, { duration: '10s', target: cap }, { duration: '1m', target: cap }, { duration: '10s', target: 2 }, { duration: '30s', target: 0 }]
  emitChange()
}

defineExpose({ errors })
</script>
