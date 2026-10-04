<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-semibold text-heading flex items-center gap-2">
          <KeyRound :size="20" class="text-primary" />
          Variables &amp; Secrets
        </h2>
        <p class="text-sm text-muted mt-1">All encrypted credentials and variables configured across your test packs.</p>
      </div>
    </div>

    <div v-if="loading" class="text-center py-12 text-muted text-sm">Loading…</div>

    <div v-else-if="rows.length === 0" class="card p-8 text-center text-muted">
      <KeyRound :size="32" class="mx-auto mb-3 opacity-40" />
      <p class="font-medium">No variables configured yet.</p>
      <p class="text-sm mt-1">Add variables in the Test Generator when reviewing a pack, or in Test Packs settings.</p>
    </div>

    <div v-else class="card !p-0 overflow-hidden">
      <table class="table w-full">
        <thead>
          <tr>
            <th class="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Variable</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Test Pack</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Value</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Description</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide w-20">Type</th>
            <th class="w-16"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="border-t border-default hover:bg-surface transition-colors group">
            <td class="px-4 py-3">
              <code class="text-sm font-mono text-primary">&#123;&#123;{{ row.name }}&#125;&#125;</code>
            </td>
            <td class="px-4 py-3">
              <span class="text-sm text-body">{{ row.packName }}</span>
            </td>
            <td class="px-4 py-3">
              <span v-if="row.sensitive" class="text-sm font-mono text-muted">••••••</span>
              <span v-else class="text-sm font-mono text-muted">{{ row.value || '—' }}</span>
            </td>
            <td class="px-4 py-3">
              <span class="text-sm text-muted">{{ row.description || '—' }}</span>
            </td>
            <td class="px-4 py-3">
              <span :class="['badge text-xs', row.sensitive ? 'badge-warning' : 'badge-secondary']">
                {{ row.sensitive ? 'encrypted' : 'plaintext' }}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              <button @click="deleteVar(row)" class="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-danger p-1 rounded">
                <Trash2 :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { KeyRound, Trash2 } from 'lucide-vue-next'
import api from '@/lib/api'

const loading = ref(true)
const rows    = ref([])

async function load() {
  loading.value = true
  try {
    const { data: packs } = await api.get('/api/agent-tests/packs')
    const allRows = []
    await Promise.all(packs.map(async pack => {
      try {
        const { data: vars } = await api.get(`/api/agent-tests/packs/${pack.id}/variables`)
        for (const v of vars) allRows.push({ ...v, packName: pack.name, packId: pack.id })
      } catch { /* skip */ }
    }))
    rows.value = allRows.sort((a, b) => a.packName.localeCompare(b.packName) || a.name.localeCompare(b.name))
  } finally {
    loading.value = false
  }
}

async function deleteVar(row) {
  if (!confirm(`Delete {{${row.name}}} from "${row.packName}"?`)) return
  try {
    await api.delete(`/api/agent-tests/packs/${row.packId}/variables/${row.id}`)
    await load()
  } catch { /* ignore */ }
}

onMounted(load)
</script>
