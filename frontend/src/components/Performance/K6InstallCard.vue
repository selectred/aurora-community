<template>
  <div v-if="!status.installed" class="card border-l-4" style="border-left-color: var(--color-warning)" data-testid="k6-install-card">
    <div class="card-body flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p class="font-semibold text-heading">k6 is not installed on this machine</p>
        <p class="text-sm text-muted">Aurora downloads k6 {{ status.version || '' }} from Grafana's releases, checks it against the published checksum and keeps it in its own data folder. Nothing is installed system-wide.</p>
        <p v-if="error" class="text-sm text-danger mt-1" role="alert">{{ error }}</p>
      </div>
      <button class="btn btn-primary" :disabled="installing" data-testid="k6-install" @click="install">
        <Download :size="16" />
        {{ installing ? `Downloading${pctText}` : 'Install k6' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Download } from 'lucide-vue-next'
import { installK6, k6Status } from './perfFormat'

const emit = defineEmits(['installed'])
const status = ref({ installed: true })
const installing = ref(false)
const pct = ref(null)
const error = ref('')
const pctText = computed(() => (typeof pct.value === 'number' ? ` ${pct.value}%` : '…'))

async function refresh () {
  status.value = await k6Status()
  if (status.value.installed) emit('installed', status.value)
}

async function install () {
  installing.value = true
  error.value = ''
  try {
    await installK6(p => { pct.value = p })
  } catch (e) {
    error.value = e.message || 'Download failed'
  } finally {
    installing.value = false
    await refresh()
  }
}

onMounted(refresh)
defineExpose({ refresh, status })
</script>
