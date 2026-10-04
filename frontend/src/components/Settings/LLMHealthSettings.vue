<script setup>
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'
import { getApiBaseUrl } from '@/lib/api'
import { Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-vue-next'

const API = import.meta.env.VITE_API_URL || getApiBaseUrl()

const loading      = ref(true)
const health       = ref(null)
const days         = ref(30)
const error        = ref('')

const FEATURE_LABELS = {
  TestGen:     'Test generation',
  LocatorHeal: 'Locator healing',
  BugTitle:    'Bug titles',
  SeedCode:    'Seed code',
  PlanGen:     'Plan generation',
  PageObject:  'Page objects',
  Fixture:     'Fixtures',
  K6Convert:   'k6 load tests'
}

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const h = await axios.get(`${API}/api/llm/health?days=${days.value}`)
    health.value = h.data
  } catch (e) {
    error.value = e.response?.data?.message || 'Failed to load LLM health data'
  } finally {
    loading.value = false
  }
}


function rateClass(rate) {
  if (rate >= 75) return 'text-success'
  if (rate >= 50) return 'text-warning'
  return 'text-danger'
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-body text-body-color">AI interaction telemetry and quality signals.</p>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="days" @change="load" class="form-select form-select-sm w-32">
          <option :value="7">7 days</option>
          <option :value="30">30 days</option>
          <option :value="90">90 days</option>
          <option :value="365">1 year</option>
        </select>
        <button @click="load" :disabled="loading" class="btn btn-secondary btn-sm gap-1.5">
          <RefreshCw :size="14" :class="{ 'animate-spin': loading }" />
          Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="card border-danger/30 bg-danger/5">
      <div class="p-4 text-sm text-danger">{{ error }}</div>
    </div>

    <!-- Summary Stats -->
    <div v-if="health && !loading" class="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Total interactions</span>
        <span class="text-2xl font-semibold">{{ health.summary.total.toLocaleString() }}</span>
        <span class="text-xs text-muted">last {{ health.period.days }} days</span>
      </div>
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Acceptance rate</span>
        <span class="text-2xl font-semibold" :class="rateClass(health.summary.acceptanceRate)">{{ health.summary.acceptanceRate }}%</span>
        <span class="text-xs text-muted">{{ health.summary.accepted }} accepted, {{ health.summary.rejected }} rejected</span>
      </div>
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Hallucination rate</span>
        <span class="text-2xl font-semibold" :class="health.summary.hallucinationRate > 10 ? 'text-danger' : 'text-success'">{{ health.summary.hallucinationRate }}%</span>
        <span class="text-xs text-muted">selector verification</span>
      </div>
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Avg latency</span>
        <span class="text-2xl font-semibold">{{ health.summary.avgLatencyMs.toLocaleString() }}<span class="text-sm text-muted ml-1">ms</span></span>
      </div>
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Token usage</span>
        <span class="text-2xl font-semibold">{{ (health.summary.totalTokens / 1000).toFixed(0) }}<span class="text-sm text-muted ml-1">k</span></span>
      </div>
      <div class="card p-4 flex flex-col gap-1">
        <span class="text-xs text-muted uppercase tracking-wide">Est. API cost</span>
        <span class="text-2xl font-semibold">${{ health.summary.estimatedCostUsd }}</span>
        <span class="text-xs text-muted">OpenAI-compatible estimates</span>
      </div>
    </div>

    <!-- By Feature -->
    <div v-if="health && Object.keys(health.byFeature).length > 0 && !loading" class="card">
      <div class="card-header">
        <h2 class="card-title">By feature</h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-border-default">
              <th class="text-left px-4 py-2 text-muted font-medium">Feature</th>
              <th class="text-right px-4 py-2 text-muted font-medium">Total</th>
              <th class="text-right px-4 py-2 text-muted font-medium">Acceptance</th>
              <th class="text-right px-4 py-2 text-muted font-medium">Avg latency</th>
              <th class="text-right px-4 py-2 text-muted font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(stats, feat) in health.byFeature" :key="feat" class="border-b border-border-default last:border-0 hover:bg-bg-subtle">
              <td class="px-4 py-2.5 font-medium">{{ FEATURE_LABELS[feat] || feat }}</td>
              <td class="text-right px-4 py-2.5 text-muted">{{ stats.total }}</td>
              <td class="text-right px-4 py-2.5" :class="rateClass(stats.acceptanceRate)">{{ stats.acceptanceRate }}%</td>
              <td class="text-right px-4 py-2.5 text-muted">{{ stats.avgLatencyMs }}ms</td>
              <td class="text-right px-4 py-2.5 text-muted">{{ (stats.totalTokens / 1000).toFixed(0) }}k</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>


    <!-- Loading skeleton -->
    <div v-if="loading" class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-4">
        <div v-for="i in 6" :key="i" class="card p-4 animate-pulse">
          <div class="h-3 bg-border-default rounded w-1/2 mb-3"></div>
          <div class="h-7 bg-border-default rounded w-2/3"></div>
        </div>
      </div>
      <div class="card p-6 animate-pulse">
        <div class="h-4 bg-border-default rounded w-1/4 mb-4"></div>
        <div v-for="i in 4" :key="i" class="h-3 bg-border-default rounded mb-3 last:mb-0"></div>
      </div>
    </div>
  </div>
</template>
