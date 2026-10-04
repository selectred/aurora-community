<template>
  <div class="config-panel">
    <!-- Nothing selected -->
    <div v-if="!selectedPack && !selectedSpec" class="config-empty">
      <Settings2 :size="24" class="text-muted mb-2" />
      <p class="text-xs text-muted text-center">Select a pack or spec to view its config</p>
    </div>

    <template v-else>
      <!-- Section: Spec info (when spec selected) -->
      <div v-if="selectedSpec" class="config-section">
        <div class="config-section-title">{{ specLabel(selectedSpec.engine) }}</div>
        <div class="config-kv">
          <span class="config-key">Status</span>
          <span class="config-val" :style="{ color: specColor(selectedSpec) }">{{ selectedSpec.status || 'draft' }}</span>
        </div>
        <div v-if="selectedSpec.url" class="config-kv">
          <span class="config-key">URL</span>
          <span class="config-val truncate" :title="selectedSpec.url">{{ selectedSpec.url }}</span>
        </div>
        <div v-if="selectedSpec.healCount > 0" class="config-kv">
          <span class="config-key">Healed</span>
          <span class="config-val text-warning">{{ selectedSpec.healCount }}×</span>
        </div>
        <div v-if="selectedSpec.testType" class="config-kv">
          <span class="config-key">Type</span>
          <span class="config-val">{{ selectedSpec.testType }}</span>
        </div>
      </div>

      <!-- Section: Pack variables -->
      <div v-if="selectedPack" class="config-section">
        <div class="config-section-title-row">
          <span class="config-section-title">Variables</span>
          <div class="flex gap-1">
            <button
              class="btn btn-sm btn-secondary"
              :disabled="scanning"
              @click="scanCode"
              title="Scan spec code for hardcoded values that should be variables"
            >
              <ScanLine :size="11" :class="{ 'animate-spin': scanning }" />
              {{ scanning ? '…' : 'Scan' }}
            </button>
            <button class="btn btn-sm btn-secondary" @click="openAddVar('')" title="Add variable">
              <Plus :size="11" />
            </button>
          </div>
        </div>

        <div v-if="loading" class="config-loading">
          <Loader2 :size="12" class="animate-spin text-muted" />
        </div>

        <div v-else-if="!variables.length && !placeholders.length" class="config-empty-inline">
          <span class="text-xs text-muted">No variables configured</span>
        </div>

        <template v-else>
          <!-- Placeholder names from spec code that aren't configured yet -->
          <div v-for="ph in unconfiguredPlaceholders" :key="'ph-' + ph" class="config-var-row config-var-row--missing">
            <span class="config-var-name">{{ bracketize(ph) }}</span>
            <span class="text-xs text-warning">not set</span>
            <button class="btn btn-sm btn-warning" @click="openAddVar(ph)">Set</button>
          </div>

          <!-- Configured variables -->
          <div v-for="v in variables" :key="v.id" class="config-var-row">
            <div class="config-var-info">
              <span class="config-var-name">{{ bracketize(v.name) }}</span>
              <span v-if="v.sensitive" class="config-var-val">••••••</span>
              <span v-else class="config-var-val truncate">{{ v.value }}</span>
            </div>
            <div class="flex gap-1">
              <button
                class="icon-btn text-muted"
                :class="replacingId === v.id ? 'text-primary' : 'hover:text-primary'"
                @click="replaceInCode(v)"
                title="Replace hardcoded value with {{VAR}} in all spec code"
              >
                <RotateCcw :size="11" :class="{ 'animate-spin': replacingId === v.id }" />
              </button>
              <button class="icon-btn text-muted hover:text-heading" @click="openEditVar(v)" title="Edit">
                <Pencil :size="11" />
              </button>
              <button class="icon-btn text-muted hover:text-danger" @click="deleteVar(v)" title="Delete">
                <Trash2 :size="11" />
              </button>
            </div>
          </div>
        </template>

        <!-- Coverage bar -->
        <div v-if="totalPlaceholders > 0" class="config-coverage">
          <div class="config-coverage-bar">
            <div
              class="config-coverage-fill"
              :style="{ width: coveragePct + '%', background: coveragePct === 100 ? '#28C76F' : '#FF9F43' }"
            />
          </div>
          <span class="text-xs text-muted">{{ configuredCount }}/{{ totalPlaceholders }} configured</span>
        </div>

        <!-- Scan suggestions (hardcoded values found in spec code) -->
        <div v-if="unaddedSuggestions.length" class="config-suggestions">
          <div class="config-section-title" style="margin-top:8px;">Detected Hardcoded Values</div>
          <p class="text-xs text-muted mb-2">These look like values that should be variables:</p>
          <div v-for="s in unaddedSuggestions" :key="s.name" class="config-suggestion-row">
            <div class="config-suggestion-info">
              <span class="config-var-name" style="font-size:10px;">{{ bracketize(s.name) }}</span>
              <span class="config-suggestion-val" :title="s.example">
                {{ s.example ? `"${s.example}"` : '' }}
                <template v-if="s.count > 1"> <span style="color:var(--color-primary);font-size:9px;">+{{ s.count - 1 }} more</span></template>
              </span>
            </div>
            <div class="flex gap-1 flex-shrink-0">
              <button class="btn btn-sm btn-secondary" style="font-size:10px;padding:2px 6px;" @click="openAddVar(s.name)">
                Add
              </button>
              <button class="icon-btn text-muted hover:text-danger" style="padding:2px;" @click="dismissSuggestion(s.name)" title="Dismiss">
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: Test Case (original imported spec, if present) -->
      <div v-if="selectedSpec?.markdownSpec" class="config-section">
        <div class="config-section-title-row" style="margin-bottom:0;">
          <span class="config-section-title" style="margin-bottom:0;">Test Case</span>
          <button class="icon-btn text-muted" style="padding:2px;" @click="testCaseExpanded = !testCaseExpanded">
            <ChevronDown :size="13" :style="testCaseExpanded ? 'transform:rotate(180deg)' : ''" />
          </button>
        </div>
        <div v-if="testCaseExpanded" class="test-case-body">
          <pre class="test-case-pre">{{ selectedSpec.markdownSpec }}</pre>
        </div>
      </div>

      <!-- Section: Pack info -->
      <div v-if="selectedPack && !selectedSpec" class="config-section">
        <div class="config-section-title">Pack</div>
        <div class="config-kv">
          <span class="config-key">{{ specLabel(selectedPack.engine, { plural: true }) }}</span>
          <span class="config-val">{{ (selectedPack.specs || []).length }}</span>
        </div>
        <div v-if="selectedPack.initiativeName" class="config-kv">
          <span class="config-key">Initiative</span>
          <span class="config-val truncate">{{ selectedPack.initiativeName }}</span>
        </div>
        <div v-if="selectedPack.featureName" class="config-kv">
          <span class="config-key">Feature</span>
          <span class="config-val truncate">{{ selectedPack.featureName }}</span>
        </div>
      </div>

      <!-- Section: AI signal (per-spec) -->
      <div v-if="selectedSpec && selectedSpec.healCount > 1" class="config-section config-section--warn">
        <div class="config-section-title">AI Signal</div>
        <p class="text-xs text-body">
          This {{ specLabel(selectedSpec.engine, { lower: true }) }} has been healed {{ selectedSpec.healCount }} times — the AI may be generating
          locators that don't match the live page.
        </p>
        <router-link to="/settings/prompts" class="text-xs text-primary underline">
          Review AI prompts →
        </router-link>
      </div>
    </template>

    <!-- Variable modal -->
    <div v-if="showVarModal" class="modal-backdrop" @click.self="showVarModal = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold text-heading">{{ editingVar ? 'Edit' : 'Add' }} Variable</h3>
          <button class="modal-close" @click="showVarModal = false"><X :size="16" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Name</label>
            <input v-model="varForm.name" type="text" class="form-input" placeholder="BASE_URL" :disabled="!!editingVar" />
          </div>
          <div>
            <label class="form-label">Value</label>
            <div class="flex gap-2">
              <input
                v-model="varForm.value"
                :type="showVal ? 'text' : 'password'"
                class="form-input flex-1"
                :placeholder="editingVar ? 'Leave blank to keep current' : 'Enter value'"
              />
              <button class="btn btn-sm btn-secondary" @click="showVal = !showVal">
                {{ showVal ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>
          <div>
            <label class="form-label">Description</label>
            <input v-model="varForm.description" type="text" class="form-input" placeholder="Optional" />
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="varForm.sensitive" type="checkbox" class="form-checkbox" />
            <span class="text-sm text-body">Sensitive (value masked in UI)</span>
          </label>
          <p v-if="varError" class="text-danger text-sm">{{ varError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" @click="showVarModal = false">Cancel</button>
          <button class="btn btn-primary btn-sm" :disabled="varSaving" @click="saveVar">
            <Save :size="13" />
            {{ varSaving ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Settings2, Plus, Pencil, Trash2, Loader2, X, Save, ScanLine, RotateCcw, ChevronDown } from 'lucide-vue-next'
import api from '@/lib/api'
import { specLabel } from '@/lib/engineTerms'

const props = defineProps({
  selectedPack: { type: Object, default: null },
  selectedSpec: { type: Object, default: null }
})

const emit = defineEmits(['vars-updated'])

const loading      = ref(false)
const variables    = ref([])
const placeholders = ref([])
const testCaseExpanded = ref(true)

const scanning      = ref(false)
const suggestions   = ref([])   // from scan-variables: { name, value, count } suggestions
const replacingId   = ref(null) // varId currently being replaced

const showVarModal = ref(false)
const editingVar   = ref(null)
const varForm      = ref({ name: '', value: '', description: '', sensitive: false })
const varError     = ref('')
const varSaving    = ref(false)
const showVal      = ref(false)

const unconfiguredPlaceholders = computed(() => {
  const configured = new Set(variables.value.map(v => v.name))
  return placeholders.value.filter(p => !configured.has(p))
})

const totalPlaceholders = computed(() => new Set([...placeholders.value, ...variables.value.map(v => v.name)]).size)
const configuredCount   = computed(() => variables.value.length)
const coveragePct       = computed(() => totalPlaceholders.value === 0 ? 100 : Math.round(configuredCount.value / totalPlaceholders.value * 100))

const unaddedSuggestions = computed(() => {
  const names = new Set(variables.value.map(v => v.name))
  return suggestions.value.filter(s => !names.has(s.name))
})

watch(() => props.selectedPack?.packId, async (packId) => {
  if (!packId) { variables.value = []; placeholders.value = []; suggestions.value = []; return }
  await loadVars(packId)
}, { immediate: true })

async function loadVars(packId) {
  loading.value = true
  try {
    const [varRes, phRes] = await Promise.all([
      api.get(`/api/agent-tests/packs/${packId}/variables`),
      api.get(`/api/agent-tests/packs/${packId}/placeholders`)
    ])
    variables.value = varRes.data || []
    placeholders.value = (phRes.data?.placeholders || []).map(p => p.name)
  } catch { variables.value = []; placeholders.value = [] }
  finally { loading.value = false }
}

function openAddVar(name) {
  editingVar.value = null
  varForm.value = { name, value: '', description: '', sensitive: false }
  varError.value = ''
  showVal.value = false
  showVarModal.value = true
}

function openEditVar(v) {
  editingVar.value = v
  varForm.value = { name: v.name, value: v.sensitive ? '' : v.value, description: v.description || '', sensitive: v.sensitive }
  varError.value = ''
  showVal.value = false
  showVarModal.value = true
}

async function saveVar() {
  varError.value = ''
  if (!varForm.value.name) { varError.value = 'Name is required'; return }
  if (!varForm.value.value && !editingVar.value) { varError.value = 'Value is required'; return }
  varSaving.value = true
  const packId = props.selectedPack.packId
  try {
    if (editingVar.value) {
      const payload = { description: varForm.value.description, sensitive: varForm.value.sensitive }
      if (varForm.value.value) payload.value = varForm.value.value
      await api.put(`/api/agent-tests/packs/${packId}/variables/${editingVar.value.id}`, payload)
    } else {
      await api.post(`/api/agent-tests/packs/${packId}/variables`, varForm.value)
    }
    await loadVars(packId)
    showVarModal.value = false
    emit('vars-updated')
  } catch (e) {
    varError.value = e?.response?.data?.error || 'Save failed'
  } finally { varSaving.value = false }
}

async function deleteVar(v) {
  if (!confirm(`Delete {{${v.name}}}?`)) return
  try {
    await api.delete(`/api/agent-tests/packs/${props.selectedPack.packId}/variables/${v.id}`)
    await loadVars(props.selectedPack.packId)
    emit('vars-updated')
  } catch { /* ignore */ }
}

async function scanCode() {
  if (!props.selectedPack) return
  scanning.value = true
  suggestions.value = []
  try {
    const { data } = await api.get(`/api/agent-tests/packs/${props.selectedPack.packId}/scan-variables`)
    suggestions.value = data.suggestions || []
  } catch { /* ignore */ } finally { scanning.value = false }
}

function dismissSuggestion(name) {
  suggestions.value = suggestions.value.filter(s => s.name !== name)
}

async function replaceInCode(v) {
  const hint = v.sensitive ? '(sensitive)' : v.value ? `"${v.value}"` : '(no value set)'
  if (!confirm(`Search all specs for ${hint} and replace with {{${v.name}}}?`)) return
  replacingId.value = v.id
  try {
    const { data } = await api.post(
      `/api/agent-tests/packs/${props.selectedPack.packId}/variables/${v.id}/replace`
    )
    const n = data.totalReplacements || 0
    alert(n > 0
      ? `Replaced ${n} occurrence(s) across ${data.specsUpdated} spec(s)`
      : data.alreadyPlaceholder > 0
        ? `Already using {{${v.name}}} — no replacement needed`
        : `No hardcoded occurrences found — AI may have used a placeholder already`)
    await loadVars(props.selectedPack.packId)
    emit('vars-updated')
  } catch (e) {
    alert(e?.response?.data?.error || 'Replace failed')
  } finally { replacingId.value = null }
}

function bracketize(name) {
  return '{{' + name + '}}'
}

function specColor(spec) {
  if (spec.status === 'passed') return '#28C76F'
  if (spec.status === 'failed') return '#EA5455'
  if (spec.hasCode) return '#7367F0'
  return '#94a3b8'
}
</script>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  overflow-y: auto;
}

.config-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
}

.config-section {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
}

.config-section--warn {
  background: color-mix(in srgb, #FF9F43 8%, transparent);
}

.config-section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-muted);
  margin-bottom: 8px;
}

.config-section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.config-kv {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.config-key {
  font-size: 11px;
  color: var(--color-muted);
  width: 60px;
  flex-shrink: 0;
}
.config-val {
  font-size: 12px;
  color: var(--color-body);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-loading { display: flex; justify-content: center; padding: 8px; }
.config-empty-inline { padding: 4px 0; }

.config-var-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
}
.config-var-row:last-child { border-bottom: none; }
.config-var-row--missing { opacity: 0.8; }

.config-var-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.config-var-name { font-size: 11px; font-weight: 500; color: var(--color-heading); font-family: monospace; }
.config-var-val { font-size: 11px; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.config-coverage {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.config-coverage-bar {
  flex: 1;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}
.config-coverage-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  padding: 3px;
  border-radius: 3px;
  transition: color 0.15s;
}

.config-suggestions { margin-top: 4px; }

.config-suggestion-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
}
.config-suggestion-row:last-child { border-bottom: none; }

.config-suggestion-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.config-suggestion-val { font-size: 10px; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }

.test-case-body {
  margin-top: 8px;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
}
.test-case-pre {
  font-size: 11px;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-body);
  margin: 0;
  padding: 10px 12px;
  line-height: 1.6;
}

/* Modal */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--color-card); border-radius: 10px;
  width: 380px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,.4);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border);
}
.modal-close { background: none; border: none; cursor: pointer; color: var(--color-muted); display: flex; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--color-border);
}
</style>
