<template>
  <div class="pack-tree">
    <!-- Header -->
    <div class="tree-header">
      <span class="text-xs font-semibold text-muted uppercase tracking-wide">Test Packs</span>
      <button class="tree-refresh-btn" @click="$emit('refresh')" title="Refresh">
        <RefreshCw :size="12" :class="{ 'animate-spin': loading }" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !packs.length" class="tree-loading">
      <Loader2 :size="14" class="animate-spin text-muted" />
      <span class="text-xs text-muted">Loading...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="tree-error">
      <span class="text-xs text-danger">{{ error }}</span>
    </div>

    <!-- Empty -->
    <div v-else-if="!packs.length" class="tree-empty">
      <span class="text-xs text-muted">No test packs found</span>
    </div>

    <!-- Pack list, grouped by Initiative -> Feature to match the Test Packs screen -->
    <div v-else class="tree-body">
      <div v-for="init in packsHierarchy" :key="init.key" class="tree-initiative">
        <button class="tree-init-header" @click="toggleInitiative(init.key)">
          <ChevronRight :size="11" :class="['chevron-icon', { 'chevron-open': expandedInits.has(init.key) }]" />
          <Target :size="12" class="tree-init-icon" />
          <span class="tree-init-name">{{ init.name }}</span>
          <span class="tree-badge tree-badge--muted">{{ init.totalPacks }}</span>
        </button>

        <div v-if="expandedInits.has(init.key)">
          <div v-for="feat in init.features" :key="feat.key" class="tree-feature">
            <button class="tree-feat-header" @click="toggleFeature(init.key + '::' + feat.key)">
              <ChevronRight :size="10" :class="['chevron-icon', { 'chevron-open': expandedFeats.has(init.key + '::' + feat.key) }]" />
              <Layers :size="11" class="tree-feat-icon" />
              <span class="tree-feat-name">{{ feat.name }}</span>
            </button>

            <div v-if="expandedFeats.has(init.key + '::' + feat.key)">
              <div v-for="pack in feat.packs" :key="pack.packId" class="tree-pack">
                <!-- Pack row -->
                <div
                  class="tree-pack-row"
                  :class="{ 'is-selected': selectedPackId === pack.packId && !selectedSpecId }"
                  @click="selectPack(pack)"
                >
                  <button class="tree-chevron" @click.stop="toggleExpand(pack.packId)">
                    <ChevronRight
                      :size="12"
                      :class="['chevron-icon', { 'chevron-open': expandedPacks.has(pack.packId) }]"
                    />
                  </button>
                  <FolderOpen v-if="expandedPacks.has(pack.packId)" :size="13" class="text-primary" />
                  <Folder v-else :size="13" class="text-muted" />
                  <span class="tree-pack-name" :title="pack.packName || pack.name">{{ pack.packName || pack.name }}</span>
                  <!-- Status badges -->
                  <span v-if="pack.failed > 0" class="tree-badge tree-badge--danger">{{ pack.failed }}</span>
                  <span v-else-if="pack.draft > 0" class="tree-badge tree-badge--warning">{{ pack.draft }}</span>
                  <span v-else-if="(pack.specs || []).length > 0" class="tree-badge tree-badge--muted">{{ (pack.specs || []).length }}</span>
                </div>

                <!-- Specs -->
                <div v-if="expandedPacks.has(pack.packId)" class="tree-specs">
                  <div v-if="!(pack.specs || []).length" class="tree-spec-empty">
                    <span class="text-xs text-muted pl-8">No specs</span>
                  </div>
                  <div
                    v-for="spec in (pack.specs || [])"
                    :key="spec.specId"
                    class="tree-spec-row"
                    :class="{ 'is-selected': selectedSpecId === spec.specId }"
                    @click="$emit('select-spec', pack, spec)"
                  >
                    <!-- Status icon -->
                    <component
                      :is="specIcon(spec)"
                      :size="11"
                      :style="{ color: specColor(spec) }"
                      class="spec-status-icon"
                    />
                    <span class="tree-spec-name" :title="spec.name">{{ spec.name }}</span>
                    <!-- Hallucination warning dot -->
                    <span
                      v-if="spec.unresolvedHallucinations > 0"
                      class="hallucination-dot"
                      title="Unresolved AI issues"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- New Pack button -->
    <div class="tree-footer">
      <button class="btn btn-sm btn-secondary w-full" @click="$emit('new-pack')">
        <Plus :size="13" />
        New Pack
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  Folder, FolderOpen, ChevronRight, Plus, RefreshCw, Loader2,
  CheckCircle, XCircle, AlertCircle, Play, Target, Layers
} from 'lucide-vue-next'

const props = defineProps({
  packs:          { type: Array,   default: () => [] },
  selectedPackId: { type: String,  default: null },
  selectedSpecId: { type: String,  default: null },
  loading:        { type: Boolean, default: false },
  error:          { type: String,  default: '' }
})

const emit = defineEmits(['select-pack', 'select-spec', 'new-pack', 'refresh'])

const expandedPacks = ref(new Set())
const expandedInits  = ref(new Set())
const expandedFeats  = ref(new Set())

// Groups packs by Initiative -> Feature, mirroring AgentTestsView.vue's packsHierarchy
// exactly, so the Test Generator's pack tree matches the Test Packs screen instead of
// showing a flat, ungrouped list of the same packs.
const packsHierarchy = computed(() => {
  const initMap = new Map()
  for (const pack of props.packs) {
    const initId   = pack.initiativeId || null
    const initName = pack.initiativeName || 'Unassigned'
    const initKey  = initId ?? '__none__'
    const featId   = pack.featureId || null
    const featName = pack.featureName || (initId ? 'General' : 'Unassigned')
    const featKey  = featId ?? '__nofeat__'
    if (!initMap.has(initKey)) initMap.set(initKey, { id: initId, name: initName, key: initKey, features: new Map() })
    const initEntry = initMap.get(initKey)
    if (!initEntry.features.has(featKey)) initEntry.features.set(featKey, { id: featId, name: featName, key: featKey, packs: [] })
    initEntry.features.get(featKey).packs.push(pack)
  }
  return [...initMap.values()]
    .map(init => ({
      ...init,
      totalPacks: [...init.features.values()].reduce((n, f) => n + f.packs.length, 0),
      features: [...init.features.values()]
        .sort((a, b) => !a.id ? 1 : !b.id ? -1 : a.name.localeCompare(b.name))
    }))
    .sort((a, b) => !a.id ? 1 : !b.id ? -1 : a.name.localeCompare(b.name))
})

// Auto-expand all groups when packs load, same as AgentTestsView.vue
watch(packsHierarchy, (hierarchy) => {
  const inits = new Set(expandedInits.value)
  const feats = new Set(expandedFeats.value)
  for (const init of hierarchy) {
    inits.add(init.key)
    for (const feat of init.features) feats.add(init.key + '::' + feat.key)
  }
  expandedInits.value = inits
  expandedFeats.value = feats
}, { immediate: true })

function toggleInitiative(key) {
  const next = new Set(expandedInits.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expandedInits.value = next
}

function toggleFeature(key) {
  const next = new Set(expandedFeats.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expandedFeats.value = next
}

function toggleExpand(packId) {
  const next = new Set(expandedPacks.value)
  next.has(packId) ? next.delete(packId) : next.add(packId)
  expandedPacks.value = next
}

function selectPack(pack) {
  const next = new Set(expandedPacks.value)
  next.add(pack.packId)
  expandedPacks.value = next
  emit('select-pack', pack)
}

function expandPack(packId) {
  const next = new Set(expandedPacks.value)
  next.add(packId)
  expandedPacks.value = next
  // Also expand the containing initiative/feature groups, or the pack would be
  // expanded but invisible if its group happens to be collapsed.
  const pack = props.packs.find(p => p.packId === packId)
  if (pack) {
    const initKey = pack.initiativeId || '__none__'
    const featKey = pack.featureId || '__nofeat__'
    const inits = new Set(expandedInits.value)
    inits.add(initKey)
    expandedInits.value = inits
    const feats = new Set(expandedFeats.value)
    feats.add(initKey + '::' + featKey)
    expandedFeats.value = feats
  }
}

defineExpose({ expandPack })

function specIcon(spec) {
  if (spec.status === 'passed') return CheckCircle
  if (spec.status === 'failed') return XCircle
  if (spec.hasCode) return Play
  return AlertCircle
}

function specColor(spec) {
  if (spec.status === 'passed') return '#28C76F'
  if (spec.status === 'failed') return '#EA5455'
  if (spec.hasCode) return '#7367F0'
  return '#94a3b8'
}
</script>

<style scoped>
.pack-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 13px;
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tree-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 3px;
  transition: color 0.15s;
}
.tree-refresh-btn:hover { color: var(--color-heading); }

.tree-loading,
.tree-error,
.tree-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  flex: 1;
}

.tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-init-header,
.tree-feat-header {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  margin: 0 4px;
  border-radius: 4px;
  transition: background 0.1s;
  text-align: left;
}
.tree-init-header:hover,
.tree-feat-header:hover { background: var(--color-border); }

.tree-init-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-heading);
}

.tree-feature { margin-left: 8px; }

.tree-feat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-body);
}

.tree-pack { margin-left: 8px; }

.tree-pack-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 4px;
  transition: background 0.1s;
}
.tree-pack-row:hover { background: var(--color-border); }
.tree-pack-row.is-selected { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }

.tree-chevron {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  color: var(--color-muted);
}

.chevron-icon {
  transition: transform 0.15s;
}
.chevron-open {
  transform: rotate(90deg);
}

.tree-pack-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--color-heading);
}

.tree-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 10px;
  flex-shrink: 0;
}
.tree-badge--danger  { background: color-mix(in srgb, #EA5455 20%, transparent); color: #EA5455; }
.tree-badge--warning { background: color-mix(in srgb, #FF9F43 20%, transparent); color: #FF9F43; }
.tree-badge--muted   { background: var(--color-border); color: var(--color-muted); }

.tree-specs {
  margin-left: 8px;
}

.tree-spec-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 20px;
  cursor: pointer;
  border-radius: 4px;
  margin: 0 4px;
  transition: background 0.1s;
  color: var(--color-body);
}
.tree-spec-row:hover { background: var(--color-border); }
.tree-spec-row.is-selected { background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-heading); }

.spec-status-icon { flex-shrink: 0; }

.tree-spec-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.hallucination-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #FF9F43;
  flex-shrink: 0;
}

.tree-spec-empty {
  padding: 4px 0;
}

.tree-footer {
  padding: 8px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
</style>
