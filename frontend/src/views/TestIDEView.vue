<template>
  <div class="test-ide">
    <!-- ── Toolbox banner ── -->
    <div class="ide-banner">
      <div class="ide-tools">
        <button
          v-for="tool in tools"
          :key="tool.id"
          class="ide-tool-btn"
          :class="{ 'ide-tool-btn--active': activeTool === tool.id }"
          @click="activeTool = tool.id"
        >
          <component :is="tool.icon" :size="14" />
          {{ tool.label }}
          <span v-if="tool.id === 'review' && pendingCount > 0" class="ide-badge">{{ pendingCount }}</span>
        </button>
      </div>

      <!-- Active spec breadcrumb -->
      <div v-if="selectedSpecId" class="ide-breadcrumb">
        <span class="text-muted text-xs">{{ selectedPackObj?.packName }}</span>
        <ChevronRight :size="12" class="text-muted" />
        <span class="text-xs text-heading font-medium">{{ selectedSpecObj?.name }}</span>
      </div>

      <button class="btn btn-sm btn-primary" @click="startNewTest" title="Start a new test from a blank Generate session">
        <Plus :size="14" />
        New Test
      </button>
    </div>

    <!-- ── 3-column body ── -->
    <div class="ide-body">
      <!-- LEFT: Pack/Spec tree -->
      <div class="ide-left">
        <PackSpecTree
          ref="treeRef"
          :packs="reviewQueue"
          :selected-pack-id="selectedPackId"
          :selected-spec-id="selectedSpecId"
          :loading="queueLoading"
          :error="queueError"
          @select-pack="onSelectPack"
          @select-spec="onSelectSpec"
          @refresh="fetchQueue"
          @new-pack="showNewPack = true"
        />
      </div>

      <!-- MIDDLE: main work area -->
      <div class="ide-middle">
        <!-- Panel area -->
        <div class="ide-panel">
          <GeneratePanel
            v-if="activeTool === 'generate'"
            ref="generatePanelRef"
            :selected-pack-id="selectedPackId"
            @log="addLog"
            @spec-saved="onSpecSaved"
          />
          <RecordPanel
            v-else-if="activeTool === 'record'"
            :replace-spec="replaceSpec"
            :selected-spec="selectedSpecObj"
            :selected-pack-id="selectedPackId"
            @log="addLog"
            @spec-saved="onSpecSaved"
            @spec-replaced="onSpecReplaced"
          />
          <ReviewPanel
            v-else-if="activeTool === 'review'"
            :selected-pack="selectedPackObj"
            :selected-spec="selectedSpecObj"
            @log="addLog"
            @refresh="fetchQueue"
            @record-to-replace="onRecordToReplace"
            @spec-updated="onSpecUpdated"
          />
          <ApiBuilderPanel
            v-else-if="activeTool === 'api'"
            :selected-pack-id="selectedPackId"
            @log="addLog"
            @spec-saved="onSpecSaved"
          />
          <ImportPanel
            v-else-if="activeTool === 'import'"
            @refresh="fetchQueue"
          />
        </div>

        <!-- Console strip -->
        <div class="ide-console">
          <div class="ide-console-header">
            <span class="text-xs font-medium text-muted">Console</span>
            <button class="ide-console-clear" @click="consoleLogs = []" title="Clear">
              <X :size="11" />
            </button>
          </div>
          <TerminalConsole :messages="consoleLogs" />
        </div>
      </div>

      <!-- RIGHT: Config panel -->
      <div class="ide-right">
        <SpecConfigPanel
          :selected-pack="selectedPackObj"
          :selected-spec="selectedSpecObj"
          @vars-updated="fetchQueue"
        />
      </div>
    </div>

    <!-- New Pack modal -->
    <div v-if="showNewPack" class="modal-backdrop" @click.self="showNewPack = false">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="font-semibold text-heading">New Test Pack</h3>
          <button class="modal-close" @click="showNewPack = false"><X :size="16" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Pack Name</label>
            <input v-model="newPackName" type="text" class="form-input" placeholder="Login flows" @keydown.enter="createPack" />
          </div>
          <div>
            <label class="form-label">Description</label>
            <input v-model="newPackDesc" type="text" class="form-input" placeholder="Optional" />
          </div>
          <p v-if="newPackError" class="text-danger text-sm">{{ newPackError }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" @click="showNewPack = false">Cancel</button>
          <button class="btn btn-primary btn-sm" :disabled="newPackSaving" @click="createPack">
            <Plus :size="13" />
            {{ newPackSaving ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bot, Circle, ClipboardList, Globe, ChevronRight, X, Plus, FileUp
} from 'lucide-vue-next'
import api from '@/lib/api'
import PackSpecTree    from '@/components/Generator/PackSpecTree.vue'
import TerminalConsole from '@/components/Generator/TerminalConsole.vue'
import GeneratePanel   from '@/components/Generator/GeneratePanel.vue'
import RecordPanel     from '@/components/Generator/RecordPanel.vue'
import ReviewPanel     from '@/components/Generator/ReviewPanel.vue'
import ApiBuilderPanel from '@/components/Generator/ApiBuilderPanel.vue'
import ImportPanel     from '@/components/Generator/ImportPanel.vue'
import SpecConfigPanel from '@/components/Generator/SpecConfigPanel.vue'

const route  = useRoute()
const router = useRouter()

// ── Tool tabs ─────────────────────────────────────────────────────────────────
const tools = [
  { id: 'generate', label: 'Generate',  icon: Bot },
  { id: 'record',   label: 'Record',    icon: Circle },
  { id: 'review',   label: 'Review',    icon: ClipboardList },
  { id: 'api',      label: 'API',       icon: Globe },
  { id: 'import',   label: 'Import',    icon: FileUp }
]

const activeTool = ref('generate')

// ── State ─────────────────────────────────────────────────────────────────────
const reviewQueue   = ref([])
const queueLoading  = ref(false)
const queueError    = ref('')
const selectedPackId = ref(null)
const selectedSpecId = ref(null)
const replaceSpec    = ref(null)
const consoleLogs    = ref([])
const treeRef        = ref(null)
const generatePanelRef = ref(null)

// New Pack modal
const showNewPack  = ref(false)
const newPackName  = ref('')
const newPackDesc  = ref('')
const newPackError = ref('')
const newPackSaving = ref(false)

// ── Derived ───────────────────────────────────────────────────────────────────
const selectedPackObj = computed(() =>
  reviewQueue.value.find(p => p.packId === selectedPackId.value) || null
)

const selectedSpecObj = computed(() => {
  if (!selectedSpecId.value || !selectedPackObj.value) return null
  return (selectedPackObj.value.specs || []).find(s => s.specId === selectedSpecId.value) || null
})

const pendingCount = computed(() =>
  reviewQueue.value.reduce((n, p) => n + (p.failed || 0) + (p.draft || 0), 0)
)

// ── Queue ─────────────────────────────────────────────────────────────────────
async function fetchQueue() {
  queueLoading.value = true
  queueError.value   = ''
  try {
    const { data } = await api.get('/api/agent-tests/review-queue')
    reviewQueue.value = data
  } catch (e) {
    queueError.value = e?.response?.data?.error || 'Failed to load packs'
  } finally {
    queueLoading.value = false
  }
}

// ── Selection ─────────────────────────────────────────────────────────────────
function onSelectPack(pack) {
  selectedPackId.value = pack.packId
  selectedSpecId.value = null
}

function onSelectSpec(pack, spec) {
  selectedPackId.value = pack.packId
  selectedSpecId.value = spec.specId
  // Switch to Review when user clicks a spec
  if (activeTool.value === 'generate' || activeTool.value === 'api') {
    activeTool.value = 'review'
  }
}

// Lets a user jump straight into generating a new test from wherever they are in
// the Test Generator, instead of having to navigate back to Test Packs and use its
// "Create New Test" button. Clears the current pack/spec selection and, if the
// Generate panel was already mounted, resets its in-progress session to a blank
// state (GeneratePanel.resetSession also clears the terminal store, so a stale
// in-progress test doesn't linger after switching tools).
async function startNewTest() {
  selectedPackId.value = null
  selectedSpecId.value = null
  activeTool.value = 'generate'
  await nextTick()
  generatePanelRef.value?.resetSession()
}

// ── Logging ───────────────────────────────────────────────────────────────────
function addLog(entry) {
  consoleLogs.value = [...consoleLogs.value, entry]
}

// ── Spec events ───────────────────────────────────────────────────────────────
async function onSpecSaved({ specId, packId }) {
  await fetchQueue()
  if (packId) {
    selectedPackId.value = packId
    selectedSpecId.value = specId
    treeRef.value?.expandPack(packId)
    activeTool.value = 'review'
  }
}

function onSpecReplaced(specId) {
  selectedSpecId.value = specId
  activeTool.value = 'review'
  fetchQueue()
}

function onSpecUpdated({ specId, ...updates }) {
  // Optimistically update local queue state
  const pack = reviewQueue.value.find(p => p.packId === selectedPackId.value)
  if (pack) {
    const spec = (pack.specs || []).find(s => s.specId === specId)
    if (spec) Object.assign(spec, updates)
  }
}

function onRecordToReplace(spec) {
  replaceSpec.value = spec
  activeTool.value = 'record'
  addLog({ type: 'info', content: `Record to replace: "${spec.name}"`, timestamp: Date.now() })
}

// Reset replaceSpec when switching away from record
watch(activeTool, (tool) => {
  if (tool !== 'record') replaceSpec.value = null
})

// ── New Pack ──────────────────────────────────────────────────────────────────
async function createPack() {
  if (!newPackName.value.trim()) return
  newPackSaving.value = true
  newPackError.value  = ''
  try {
    const { data } = await api.post('/api/agent-tests/packs', {
      name: newPackName.value.trim(),
      description: newPackDesc.value
    })
    showNewPack.value  = false
    newPackName.value  = ''
    newPackDesc.value  = ''
    // getReviewQueue filters out packs with zero specs, so a brand-new empty pack
    // would vanish immediately if we relied on fetchQueue() to show it — splice it
    // into the list locally instead, so it's actually visible to add specs to.
    const created = {
      packId: data.id, packName: data.name, specs: [], total: 0, passed: 0, failed: 0, draft: 0,
      engine: data.engine || null,
      initiativeId: data.initiativeId || null, initiativeName: data.initiativeName || null,
      featureId: data.featureId || null, featureName: data.featureName || null
    }
    reviewQueue.value = [created, ...reviewQueue.value]
    selectedPackId.value = created.packId
    treeRef.value?.expandPack(created.packId)
  } catch (e) {
    newPackError.value = e?.response?.data?.error || 'Failed to create pack'
  } finally { newPackSaving.value = false }
}

// ── Mount / query params ──────────────────────────────────────────────────────
onMounted(async () => {
  await fetchQueue()

  // Support ?mode=review&specId=xxx (linked from AgentTestsView "Fix in Generator" buttons)
  const { mode, specId, packId } = route.query
  if (mode && tools.some(t => t.id === mode)) {
    activeTool.value = mode
  }
  if (specId) {
    // Find pack that contains this spec
    for (const pack of reviewQueue.value) {
      const spec = (pack.specs || []).find(s => s.specId === specId)
      if (spec) {
        selectedPackId.value = pack.packId
        selectedSpecId.value = specId
        treeRef.value?.expandPack(pack.packId)
        break
      }
    }
  } else if (packId) {
    selectedPackId.value = packId
    treeRef.value?.expandPack(packId)
  }

  // The Test Generator runs inside a pre-created Tauri window that's shown/hidden
  // (not recreated) each time it's opened from the sidebar or Test Packs' "Create
  // New Test" button - onMounted only ever fires once per app session, so without
  // this, packs/specs created elsewhere while this window was hidden would never
  // appear here until an explicit manual refresh. Refetch whenever the window
  // becomes visible again.
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    fetchQueue()
  }
}
</script>

<style scoped>
.test-ide {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px); /* subtract nav height */
  overflow: hidden;
}

/* ── Banner ── */
.ide-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  height: 44px;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.ide-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: var(--color-surface);
  border-radius: 8px;
}

.ide-tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: none;
  background: none;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.ide-tool-btn:hover { color: var(--color-heading); background: var(--color-border); }
.ide-tool-btn--active {
  background: var(--color-primary);
  color: #fff;
}

.ide-badge {
  font-size: 10px;
  font-weight: 700;
  background: #FF9F43;
  color: #fff;
  border-radius: 10px;
  padding: 1px 5px;
  line-height: 1.2;
}

.ide-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 12px;
}

/* ── 3-column layout ── */
.ide-body {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  flex: 1;
  overflow: hidden;
}

/* ── Left ── */
.ide-left {
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Middle ── */
.ide-middle {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ide-panel {
  flex: 1;
  overflow-y: auto;
  border-bottom: 1px solid var(--color-border);
}

.ide-console {
  height: 180px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.ide-console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.ide-console-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: #4a5568;
  display: flex;
  padding: 2px;
  border-radius: 3px;
  transition: color 0.15s;
}
.ide-console-clear:hover { color: #94a3b8; }

/* ── Right ── */
.ide-right {
  border-left: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Modal ── */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--color-card); border-radius: 10px;
  width: 400px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,.4);
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
