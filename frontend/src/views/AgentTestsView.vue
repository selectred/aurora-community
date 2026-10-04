<template>
  <div class="space-y-6" data-testid="page-test-packs">
    <div v-if="monitorNotice" :class="['flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm', monitorNotice.ok ? 'border-success/30 bg-success/5 text-success' : 'border-warning/30 bg-warning/5 text-warning']" role="status" data-testid="monitor-notice">
      <span>{{ monitorNotice.text }}</span>
      <button class="text-muted hover:text-heading" aria-label="Dismiss" @click="monitorNotice = null"><X :size="16" /></button>
    </div>

    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <p class="text-body text-body-color">Organize tests into packs for batch execution and scheduling</p>
      </div>
      <div class="flex items-center gap-3">
        <router-link to="/testing/import" class="btn btn-secondary">
          <Upload :size="18" />
          Import CSV
        </router-link>
        <button @click="openGeneratorWindow" class="btn btn-primary">
          <Plus :size="18" />
          Create New Test
        </button>
        <button
          @click="runAllTests"
          :disabled="runningAll || agentTests.length === 0"
          class="btn btn-success"
          aria-label="Run All Tests"
        >
          <Play :size="18" />
          {{ runningAll ? 'Running...' : 'Run All' }}
        </button>
        <button
          @click="refreshAll"
          :disabled="refreshingAll"
          class="btn btn-secondary"
          aria-label="Refresh"
          title="Refresh tests, packs, initiatives, and features"
        >
          <RefreshCw :size="18" :class="refreshingAll ? 'animate-spin' : ''" />
        </button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-5 gap-6 mt-4">
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Total Tests</p>
            <p class="text-3xl font-bold text-heading">{{ agentTests.length }}</p>
            <p class="text-body text-muted mt-3">In library</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center">
            <Bot class="w-5 h-5 text-primary" />
          </div>
        </div>
      </div>
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Ready<HelpTooltip text="Tests that have been generated and are ready to run. Click the play button on any test to execute it." /></p>
            <p class="text-3xl font-bold text-heading">{{ readyCount }}</p>
            <p class="text-body text-muted mt-3">Ready to run</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-success-soft flex items-center justify-center">
            <CheckCircle class="w-5 h-5 text-success" />
          </div>
        </div>
      </div>
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Synthetic<HelpTooltip text="Tests promoted to run automatically on a schedule — like a robot checking your app every hour. Failures are recorded so you can spot problems early." /></p>
            <p class="text-3xl font-bold text-heading">{{ syntheticCount }}</p>
            <p class="text-body text-muted mt-3">Monitoring</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-info-soft flex items-center justify-center">
            <Activity class="w-5 h-5 text-info" />
          </div>
        </div>
      </div>
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Draft<HelpTooltip text="Tests you have described but haven't generated yet. Open the test and click Generate to let the AI create the test code from your description." /></p>
            <p class="text-3xl font-bold text-heading">{{ draftCount }}</p>
            <p class="text-body text-muted mt-3">Needs generation</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-warning-soft flex items-center justify-center">
            <FileText class="w-5 h-5 text-warning" />
          </div>
        </div>
      </div>
      <div class="card">
        <div class="flex items-start justify-between">
          <div>
            <p class="text-label text-label-color uppercase tracking-wider mb-1">Failed<HelpTooltip text="Tests that ran but found something wrong — either in your application, or the test needs updating. Click the test to see what went wrong." /></p>
            <p class="text-3xl font-bold text-heading">{{ failedCount }}</p>
            <p class="text-body text-muted mt-3">Needs attention</p>
          </div>
          <div class="w-10 h-10 rounded-lg bg-danger-soft flex items-center justify-center">
            <XCircle class="w-5 h-5 text-danger" />
          </div>
        </div>
      </div>
    </div>

    <!-- Test Packs Section -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 items-start">
      <!-- Test Packs Panel -->
      <div class="card">
        <div class="card-header">
          <div class="flex items-center justify-between w-full">
            <h2 class="card-title flex items-center gap-2">
              <FolderOpen :size="20" class="text-primary" />
              Test Packs
              <HelpTooltip text="A Test Pack is a folder of related tests that run together. For example: 'Login Tests' or 'Checkout Flow'. Select a pack to see its tests on the right." position="right" />
            </h2>
            <button @click="showCreatePack = true" class="btn btn-sm btn-primary" aria-label="New Pack">
              <Plus :size="14" />
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="testPacks.length === 0" class="text-center py-8 text-muted">
            <FolderOpen :size="32" class="mx-auto mb-2 opacity-50" />
            <p>No test packs yet</p>
            <p class="text-sm">Create a pack to organize your tests</p>
          </div>
          <div v-else class="pack-hierarchy">
            <!-- Initiative group -->
            <div v-for="init in packsHierarchy" :key="init.key" class="ph-initiative">
              <button class="ph-init-header" @click="toggleInitiative(init.key)">
                <ChevronDown v-if="expandedInits.has(init.key)" :size="12" class="ph-chevron" />
                <ChevronRight v-else :size="12" class="ph-chevron" />
                <Target :size="13" class="ph-init-icon" />
                <span class="ph-init-name">{{ init.name }}</span>
                <span class="ph-count">{{ init.totalPacks }}</span>
              </button>
              <div v-if="expandedInits.has(init.key)">
                <!-- Feature group -->
                <div v-for="feat in init.features" :key="feat.key" class="ph-feature">
                  <button class="ph-feat-header" @click="toggleFeature(init.key + '::' + feat.key)">
                    <ChevronDown v-if="expandedFeats.has(init.key + '::' + feat.key)" :size="11" class="ph-chevron" />
                    <ChevronRight v-else :size="11" class="ph-chevron" />
                    <Layers :size="12" class="ph-feat-icon" />
                    <span class="ph-feat-name">{{ feat.name }}</span>
                  </button>
                  <div v-if="expandedFeats.has(init.key + '::' + feat.key)">
                    <!-- Pack row -->
                    <div
                      v-for="pack in feat.packs"
                      :key="pack.id"
                      class="ph-pack"
                      :class="{ 'ph-pack--selected': selectedPack?.id === pack.id }"
                    >
                      <button @click="selectPack(pack)" class="ph-pack-btn">
                        <FolderOpen v-if="selectedPack?.id === pack.id" :size="12" class="ph-pack-icon" />
                        <FolderOpen v-else :size="12" class="ph-pack-icon ph-pack-icon--muted" />
                        <span class="ph-pack-name">{{ pack.name }}</span>
                        <span class="ph-count">{{ pack.tests?.length || 0 }}</span>
                      </button>
                      <button
                        v-if="continuumEnabled && pack.featureId"
                        @click.stop="pushPackToContinuum(pack)"
                        class="ph-action"
                        :class="{ 'opacity-40 cursor-not-allowed': pushingPackId === pack.id }"
                        title="Push to Continuum"
                      >
                        <Upload :size="11" />
                      </button>
                      <button @click.stop="confirmDeletePack(pack)" class="ph-action ph-action--danger" title="Delete pack">
                        <Trash2 :size="11" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pack Settings (setup/teardown) -->
        <div v-if="selectedPack" class="mt-4 pt-4 border-t border-default space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-heading">Pack Settings</h3>
            <button @click="savePackSettings" :disabled="savingPack" class="btn btn-sm btn-primary">
              <Loader2 v-if="savingPack" :size="13" class="animate-spin" />
              <Save v-else :size="13" />
              Save
            </button>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="form-label text-xs mb-0">Feature <span class="text-muted">(optional)</span></label>
              <button @click="showQuickFeature = true" class="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus :size="11" />New feature
              </button>
            </div>
            <select v-model="packEdit.featureId" class="form-input text-sm py-1.5">
              <option value="">— No feature —</option>
              <option v-for="f in features" :key="f.id" :value="f.id">{{ f.name }}<template v-if="f.initiativeName"> ({{ f.initiativeName }})</template></option>
            </select>
            <p class="text-xs text-muted mt-1">Determines the initiative when pushing results to Continuum</p>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="form-label text-xs mb-0">Setup Code <span class="text-muted">(beforeAll)</span><HelpTooltip text="Code that runs once before all tests in this pack start." position="right" /></label>
              <button
                v-if="attachedDataset()"
                @click="generateSeedCode"
                :disabled="seedGenerating"
                class="btn btn-xs btn-secondary flex items-center gap-1"
                title="Generate seed code from test data"
              >
                <Loader2 v-if="seedGenerating" :size="11" class="animate-spin" />
                <Bot v-else :size="11" />
                Generate Seed
              </button>
            </div>
            <textarea
              v-model="packEdit.setupCode"
              rows="4"
              class="form-input font-mono text-xs"
              placeholder="// e.g. const r = await request.post('/api/users', {...})&#10;// ctx.userId = (await r.json()).id"
            />
          </div>
          <div>
            <label class="form-label text-xs">Teardown Code <span class="text-muted">(afterAll)</span><HelpTooltip text="Code that runs once after all tests in this pack finish — for example, deleting the test user created during setup. Leave blank if not needed." position="right" /></label>
            <textarea
              v-model="packEdit.teardownCode"
              rows="4"
              class="form-input font-mono text-xs"
              placeholder="// e.g. await request.delete(`/api/users/${ctx.userId}`)"
            />
          </div>

          <!-- Test Data Section -->
          <div class="pt-2 border-t border-default">
            <div class="flex items-center gap-2 mb-2">
              <Database :size="13" class="text-primary" />
              <span class="text-xs font-semibold text-heading">Test Data</span>
            </div>

            <!-- Attached dataset badge -->
            <div v-if="attachedDataset()" class="mb-2 p-2 rounded bg-surface-2 flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-medium text-heading truncate">{{ attachedDataset().filename || attachedDataset().name }}</p>
                <p class="text-xs text-muted mt-0.5">{{ attachedDataset().rowCount }} rows</p>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="h in (attachedDataset().headers || []).slice(0, 6)"
                    :key="h"
                    class="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono"
                  >{{ h }}</span>
                  <span v-if="(attachedDataset().headers || []).length > 6" class="text-xs text-muted">+{{ (attachedDataset().headers || []).length - 6 }} more</span>
                </div>
              </div>
              <button @click="clearTestData" class="text-muted hover:text-danger flex-shrink-0 mt-0.5">
                <X :size="13" />
              </button>
            </div>

            <!-- Source pickers (shown when no dataset attached) -->
            <div v-else class="space-y-2">
              <div v-if="continuumEnabled && continuumDatasets.length > 0">
                <label class="form-label text-xs">Continuum Dataset</label>
                <select v-model="packDataEdit.continuumId" class="form-input text-sm py-1.5" @change="packDataEdit.localFileId = ''">
                  <option value="">— Select dataset —</option>
                  <option v-for="d in continuumDatasets" :key="d._id || d.id" :value="d._id || d.id">
                    {{ d.name }} ({{ d.rowCount }} rows)
                  </option>
                </select>
              </div>
              <div class="flex items-center gap-2">
                <label class="btn btn-xs btn-secondary flex items-center gap-1 cursor-pointer">
                  <Loader2 v-if="csvUploading" :size="11" class="animate-spin" />
                  <Upload v-else :size="11" />
                  Upload CSV
                  <input type="file" accept=".csv" class="hidden" @change="uploadLocalCsv" />
                </label>
                <div v-if="localCsvFiles.length > 0" class="flex-1">
                  <select v-model="packDataEdit.localFileId" class="form-input text-sm py-1.5" @change="packDataEdit.continuumId = ''">
                    <option value="">— Local CSV —</option>
                    <option v-for="f in localCsvFiles" :key="f.id" :value="f.id">
                      {{ f.filename }} ({{ f.rowCount }} rows)
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Execution mode (shown when data is attached) -->
            <div v-if="attachedDataset()" class="mt-2">
              <label class="form-label text-xs">Execution Mode</label>
              <select v-model="packDataEdit.mode" class="form-input text-sm py-1.5">
                <option value="none">None — ignore data</option>
                <option value="per_row">Per Row — run each spec once per row</option>
                <option value="loop">Loop — inject all rows, spec iterates</option>
              </select>
            </div>

            <!-- Data Binding Helper (shown when data is attached) -->
            <div v-if="attachedDataset()" class="mt-3 pt-3 border-t border-default">
              <div class="flex items-center gap-2 mb-2">
                <Code :size="13" class="text-info" />
                <span class="text-xs font-semibold text-heading">Data Binding</span>
                <HelpTooltip text="Click a column to copy its variable reference. Paste into your spec to access test data at runtime." position="right" />
              </div>

              <!-- Clickable column badges -->
              <div class="flex flex-wrap gap-1 mb-2">
                <button
                  v-for="col in (attachedDataset().headers || [])"
                  :key="col"
                  @click="copyColumnRef(col)"
                  class="text-xs px-2 py-1 rounded bg-surface-2 hover:bg-primary hover:text-white text-body-color font-mono transition-colors cursor-pointer"
                  :title="`Click to copy: getRows('${datasetName}')[0].${col}`"
                >
                  {{ col }}
                </button>
              </div>
              <p class="text-xs text-muted mb-3">Click column to copy reference</p>

              <!-- Variable Builder -->
              <div class="p-2 rounded bg-surface-2 space-y-2">
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="form-label text-xs mb-1">Column</label>
                    <select v-model="varBuilder.column" class="form-input text-xs py-1">
                      <option value="">— Select —</option>
                      <option v-for="col in (attachedDataset().headers || [])" :key="col" :value="col">{{ col }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label text-xs mb-1">Row Index</label>
                    <input v-model.number="varBuilder.rowIndex" type="number" min="0" class="form-input text-xs py-1" placeholder="0" />
                  </div>
                </div>
                <div class="flex items-center gap-2 p-2 bg-background rounded">
                  <code class="flex-1 text-xs font-mono text-primary truncate">{{ generatedVarRef }}</code>
                  <button @click="copyVarRef" class="btn btn-xs btn-secondary flex-shrink-0" title="Copy to clipboard">
                    <Copy :size="11" />
                  </button>
                </div>
                <p class="text-xs text-muted">Use in spec: &quot;Fill <span class="font-mono text-primary">&#123;&#123; {{ generatedVarRef }} &#125;&#125;</span> in email field&quot;</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Tests Table -->
      <div class="lg:col-span-2 card !p-0 overflow-hidden">
        <div class="card-header !border-b-0 !mb-0 px-6 py-4 border-b border-default">
          <div class="flex items-center justify-between w-full">
            <div>
              <button
                v-if="cameFromGenerator"
                @click="router.back()"
                class="flex items-center gap-1 text-xs text-muted hover:text-primary mb-2 transition-colors"
              >
                <ChevronLeft :size="13" />Back to Generator
              </button>
              <h2 class="card-title flex items-center gap-2">
                <FlaskConical :size="20" class="text-primary" />
                {{ selectedPack ? selectedPack.name : 'All Tests' }}
              </h2>
              <p class="text-sm text-muted mt-1 flex items-center gap-2">
                {{ selectedPack ? `${tableTests.length} passed test${tableTests.length !== 1 ? 's' : ''}` : 'Select tests to add to a pack' }}
                <button
                  v-if="selectedPack && inReviewCount > 0"
                  @click="openGenerator()"
                  class="text-warning text-xs flex items-center gap-1 hover:underline"
                >
                  <Wrench :size="11" />
                  {{ inReviewCount }} in review
                </button>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <!-- No pack selected: offer to add to a pack -->
              <button
                v-if="selectedTests.length > 0 && !selectedPack"
                @click="addToPackTarget = testPacks[0]?.id || ''; showAddToPackModal = true"
                class="btn btn-sm btn-primary"
              >
                <Package :size="14" />
                Add to Pack ({{ selectedTests.length }})
              </button>
              <!-- Pack selected: add or remove from current pack -->
              <button
                v-if="selectedTests.length > 0 && selectedPack"
                @click="addTestsToPack"
                class="btn btn-sm btn-primary"
              >
                Add to Pack ({{ selectedTests.length }})
              </button>
              <button
                v-if="selectedTests.length > 0 && selectedPack"
                @click="removeTestsFromPack"
                class="btn btn-sm btn-danger"
              >
                Remove
              </button>
              <!-- Environment picker -->
              <div v-if="selectedPack && tableTests.length > 0" class="relative">
                <button
                  @click="showEnvPicker = !showEnvPicker"
                  class="btn btn-sm btn-secondary flex items-center gap-1.5"
                  title="Select run environment"
                >
                  <Globe :size="13" />
                  <span class="max-w-[90px] truncate">{{ activeEnv ? activeEnv.name : 'No env' }}</span>
                  <ChevronDown :size="12" />
                </button>
                <div v-if="showEnvPicker" class="absolute right-0 top-full mt-1 z-30 bg-surface border border-border rounded-lg shadow-lg min-w-[180px] py-1">
                  <button
                    class="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    :class="!activeEnv ? 'text-primary font-medium' : 'text-body'"
                    @click="switchEnv(null)"
                  >
                    <span class="w-2 h-2 rounded-full bg-muted shrink-0"></span>
                    No environment
                  </button>
                  <button
                    v-for="env in allEnvs"
                    :key="env.id"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    :class="activeEnv?.id === env.id ? 'text-primary font-medium' : 'text-body'"
                    @click="switchEnv(env)"
                  >
                    <span class="w-2 h-2 rounded-full shrink-0" :class="envColorClass(env.color)"></span>
                    {{ env.name }}
                    <span class="text-xs text-muted truncate ml-auto max-w-[80px]">{{ env.baseUrl }}</span>
                  </button>
                  <div class="border-t border-border mt-1 pt-1">
                    <router-link to="/settings/environments" class="w-full text-left px-3 py-2 text-xs text-muted hover:text-primary flex items-center gap-1.5" @click="showEnvPicker = false">
                      <Settings :size="11" /> Manage environments
                    </router-link>
                  </div>
                </div>
              </div>
              <button
                v-if="selectedPack && tableTests.length > 0"
                @click="runCurrentPack"
                :disabled="runningPack"
                class="btn btn-sm btn-success"
              >
                <Loader2 v-if="runningPack" :size="14" class="animate-spin" />
                <Play v-else :size="14" />
                {{ runningPack ? 'Running…' : 'Run Pack' }}
              </button>
            </div>
          </div>
        </div>
        <!-- Pack status banners — always visible at top of panel -->
        <div v-if="packRunError" class="mx-6 mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2">
          <XCircle :size="16" class="shrink-0 mt-0.5" />
          <span>{{ packRunError }}</span>
          <button @click="packRunError = null" class="ml-auto text-danger/60 hover:text-danger"><X :size="14" /></button>
        </div>
        <div v-if="runningPack" class="mx-6 mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm flex items-center gap-2">
          <Loader2 :size="16" class="animate-spin shrink-0" />
          Running {{ tableTests.length }} test{{ tableTests.length !== 1 ? 's' : '' }} — this may take a few minutes…
        </div>


        <!-- Variables & Secrets — top of right panel when a pack is selected -->
        <div v-if="selectedPack" class="px-6 pt-4 pb-2">
          <div class="rounded-lg border border-default bg-surface-2 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold text-heading flex items-center gap-2">
                <KeyRound :size="14" class="text-primary" />
                Variables &amp; Secrets
              </h3>
              <button @click="showAddVariable = true" class="btn btn-xs btn-secondary flex items-center gap-1">
                <Plus :size="11" />Add variable
              </button>
            </div>
            <p v-if="packVariables.length === 0" class="text-xs text-muted">
              No variables yet. Add <code class="text-primary font-mono">&#123;&#123;NAME&#125;&#125;</code> placeholders here — the runner substitutes real values at test time, keeping credentials out of your spec code.
            </p>
            <div v-else class="flex flex-wrap gap-2">
              <div v-for="v in packVariables" :key="v.id" class="flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border border-default group">
                <KeyRound :size="11" class="text-primary flex-shrink-0" />
                <code class="text-xs font-mono text-primary">&#123;&#123;{{ v.name }}&#125;&#125;</code>
                <span v-if="v.sensitive" class="text-xs text-muted font-mono">••••••</span>
                <span v-else class="text-xs text-muted font-mono truncate max-w-[120px]">{{ v.value }}</span>
                <button @click="editVariable(v)" class="opacity-0 group-hover:opacity-100 text-muted hover:text-primary transition-opacity ml-1" title="Edit">
                  <Pencil :size="11" />
                </button>
                <button @click="deleteVariable(v)" class="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-opacity" title="Delete">
                  <Trash2 :size="11" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="p-6">
          <div v-if="loading" class="text-center py-12 text-muted">Loading tests...</div>
          <div v-else-if="tableTests.length === 0 && selectedPack && inReviewCount > 0" class="text-center py-12">
            <Wrench :size="32" class="mx-auto mb-2 text-warning opacity-70" />
            <p class="text-heading font-medium mb-1">{{ inReviewCount }} test{{ inReviewCount !== 1 ? 's' : '' }} still in review</p>
            <p class="text-sm text-muted mb-3">Tests only appear here once they pass in the Generator</p>
            <button @click="openGenerator()" class="btn btn-sm btn-warning inline-flex items-center gap-1.5">
              <Wrench :size="13" />
              Open Test Generator
            </button>
          </div>
          <div v-else-if="tableTests.length === 0" class="text-center py-12 text-muted">
            <Bot :size="32" class="mx-auto mb-2 opacity-50" />
            <p>{{ selectedPack ? 'No tests in this pack' : 'No tests created yet' }}</p>
            <router-link to="/tests/terminal" class="text-primary hover:underline">
              Create your first test
            </router-link>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th v-if="selectedPack" class="w-6"></th>
                  <th class="w-8">
                    <input
                      type="checkbox"
                      @change="toggleSelectAll"
                      :checked="allSelected"
                      class="rounded"
                    />
                  </th>
                  <th class="text-left">Name</th>
                  <th class="text-left">URL</th>
                  <th class="text-left">Status</th>
                  <th class="text-left">Last Run</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(test, idx) in tableTests"
                  :key="test.specId"
                  :draggable="!!selectedPack"
                  @dragstart="selectedPack && onDragStart(idx)"
                  @dragover.prevent
                  @drop="selectedPack && onDrop(idx)"
                  :class="{ 'opacity-50': dragFromIdx === idx }"
                >
                  <td v-if="selectedPack" class="text-muted cursor-grab active:cursor-grabbing">
                    <GripVertical :size="15" />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      :checked="selectedTests.includes(test.specId)"
                      @change="toggleTestSelection(test.specId)"
                      class="rounded"
                    />
                  </td>
                  <td>
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-heading">{{ test.name }}</span>
                      <span :class="['badge', getEngineBadgeClass(test.engine), 'text-xs']">{{ getEngineLabel(test.engine) }}</span>
                      <span v-if="test.isSynthetic" class="badge badge-info text-xs">Synthetic</span>
                    </div>
                    <div class="text-xs text-muted">{{ test.specId }}</div>
                  </td>
                  <td class="text-muted text-sm max-w-[200px] truncate">{{ test.url }}</td>
                  <td>
                    <span :class="['badge', getStatusBadgeClass(test.status)]">
                      {{ test.status }}
                    </span>
                  </td>
                  <td class="text-muted text-sm">{{ test.lastResult?.ranAt ? formatDate(test.lastResult.ranAt) : '—' }}</td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-2">
                      <!-- Failed: link to Generator Review tab to fix -->
                      <button
                        v-if="test.status === 'failed' || test.status === 'draft'"
                        @click="openGenerator()"
                        class="btn btn-sm btn-warning flex items-center gap-1"
                        :title="test.status === 'failed' ? 'Fix this test in the Generator' : 'Generate code in the Test Generator'"
                      >
                        <Wrench :size="14" />
                        Fix in Generator
                      </button>
                      <!-- Synthetic monitoring toggle (ready/passed functional tests only) -->
                      <label
                        v-if="(test.status === 'ready' || test.status === 'passed') && test.testType === 'functional'"
                        class="toggle"
                        :title="test.isSynthetic ? 'Synthetic monitoring on — click to disable' : 'Enable synthetic monitoring'"
                        :aria-label="test.isSynthetic ? 'Disable Synthetic Monitor' : 'Enable Synthetic Monitor'"
                        @click.prevent="test.isSynthetic ? demoteFromSynthetic(test.specId) : openPromoteModal(test)"
                      >
                        <input type="checkbox" :checked="test.isSynthetic" class="sr-only" readonly />
                        <div class="toggle-track"></div>
                      </label>
                      <button @click="deleteTest(test.specId)" class="btn btn-sm btn-danger" aria-label="Delete Test">
                        <Trash2 :size="16" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>



      </div>
    </div>

    <!-- Pack run results -->
    <div v-if="packRunResult" class="card">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3 flex-wrap">
          <h3 class="font-semibold text-heading">Pack Results</h3>
          <span class="badge badge-success">{{ packRunResult.passed }} passed</span>
          <span v-if="packRunResult.failed > 0" class="badge badge-danger">{{ packRunResult.failed }} failed</span>
          <span class="text-xs text-muted">{{ packRunResult.duration }}ms</span>
        </div>
        <button @click="packRunResult = null" class="text-muted hover:text-heading shrink-0"><X :size="16" /></button>
      </div>

      <!-- Tier 1 RAG summary — inline only, scoped to this pack's Feature -->
      <div v-if="packFeatureHealth" class="rounded-lg border p-3 mb-3 flex items-center gap-3"
        :class="{
          'border-success/30 bg-success/5': packFeatureHealth.status === 'Green',
          'border-warning/30 bg-warning/5': packFeatureHealth.status === 'Amber',
          'border-danger/30 bg-danger/5': packFeatureHealth.status === 'Red',
          'border-default': packFeatureHealth.status === 'Gray'
        }">
        <span :class="['badge', {
          'badge-success': packFeatureHealth.status === 'Green',
          'badge-warning': packFeatureHealth.status === 'Amber',
          'badge-danger': packFeatureHealth.status === 'Red',
          'badge-info': packFeatureHealth.status === 'Gray'
        }]">{{ packFeatureHealth.status === 'Gray' ? 'Not run' : packFeatureHealth.status }}</span>
        <span class="text-sm text-heading font-medium">{{ packFeatureHealth.name }}</span>
        <span class="text-xs text-muted">{{ packFeatureHealth.total > 0 ? `${packFeatureHealth.passed}/${packFeatureHealth.total} tests passing` : 'no results yet' }}</span>
        <span v-if="packFeatureHealth.healedCount" class="text-xs text-muted">&middot; {{ packFeatureHealth.healedCount }} auto-healed</span>
      </div>

      <div class="space-y-2">
        <div v-for="r in packRunResult.results" :key="r.specId"
          class="rounded-lg border p-3"
          :class="r.status === 'passed' ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'">
          <div class="flex items-center justify-between mb-1">
            <span class="font-medium text-sm text-heading truncate">{{ r.specName }}</span>
            <div class="flex items-center gap-2 shrink-0 ml-2">
              <span class="text-xs text-muted">{{ r.duration }}ms</span>
              <span :class="['badge badge-sm', r.status === 'passed' ? 'badge-success' : 'badge-danger']">{{ r.status }}</span>
            </div>
          </div>
          <p v-if="r.error" class="text-xs text-danger mb-2">{{ r.error }}</p>
          <div v-if="r.steps?.length" class="space-y-1 mt-2">
            <div v-for="(step, i) in r.steps" :key="i" class="flex items-start gap-2 text-xs">
              <CheckCircle v-if="step.success" :size="12" class="text-success shrink-0 mt-0.5" />
              <XCircle v-else :size="12" class="text-danger shrink-0 mt-0.5" />
              <span :class="step.success ? 'text-body-color' : 'text-danger'">{{ step.action }}</span>
              <span v-if="step.error" class="text-danger ml-1">— {{ step.error }}</span>
            </div>
          </div>
          <EvidenceLinks v-if="r.evidenceDir" :evidence-dir="r.evidenceDir" dense />
        </div>
      </div>
    </div>

    <!-- Create Pack Modal -->
    <Teleport to="body">
    <div v-if="showCreatePack" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h2 class="modal-title">Create Test Pack</h2>
          <button @click="showCreatePack = false" class="text-muted hover:text-heading">
            <X :size="24" />
          </button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Pack Name</label>
            <input
              v-model="newPack.name"
              type="text"
              placeholder="e.g., Smoke Tests, Login Suite"
              class="form-input"
            />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea
              v-model="newPack.description"
              rows="3"
              placeholder="Describe the purpose of this test pack..."
              class="form-input"
            ></textarea>
          </div>
          <div>
            <label class="form-label">Feature <span class="text-muted text-xs">(optional)</span></label>
            <select v-model="newPack.featureId" class="form-input">
              <option value="">— No feature —</option>
              <option v-for="f in features" :key="f.id" :value="f.id">{{ f.name }}<template v-if="f.initiativeName"> ({{ f.initiativeName }})</template></option>
            </select>
            <p v-if="features.length === 0" class="text-xs text-warning mt-1">No features yet — create them under Settings → Initiatives first</p>
            <p v-else class="text-xs text-muted mt-1">Links this pack to a feature — results are routed to the feature's initiative in Continuum</p>
          </div>
          <div>
            <label class="form-label">Setup Code <span class="text-muted text-xs">(beforeAll — runs once)</span></label>
            <textarea
              v-model="newPack.packSetupCode"
              rows="4"
              class="form-input font-mono text-sm"
              placeholder="// e.g. create test user via API&#10;// const r = await request.post('/api/users', {...})&#10;// ctx.userId = (await r.json()).id"
            ></textarea>
          </div>
          <div>
            <label class="form-label">Teardown Code <span class="text-muted text-xs">(afterAll — runs once)</span></label>
            <textarea
              v-model="newPack.packTeardownCode"
              rows="4"
              class="form-input font-mono text-sm"
              placeholder="// e.g. delete test user&#10;// await request.delete(`/api/users/${ctx.userId}`)"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showCreatePack = false" class="btn btn-secondary">Cancel</button>
          <button
            @click="createTestPack"
            :disabled="!newPack.name || creatingPack"
            class="btn btn-primary"
          >
            {{ creatingPack ? 'Creating...' : 'Create Pack' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Add to Pack Modal (from All Tests view) -->
    <Teleport to="body">
    <div v-if="showAddToPackModal" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h2 class="modal-title">Add {{ selectedTests.length }} Test{{ selectedTests.length !== 1 ? 's' : '' }} to Pack</h2>
          <button @click="closeAddToPackModal" class="text-muted hover:text-heading">
            <X :size="24" />
          </button>
        </div>
        <div class="modal-body space-y-4">
          <!-- Existing packs -->
          <div v-if="testPacks.length > 0">
            <label class="form-label">Add to existing pack</label>
            <div class="space-y-2 max-h-48 overflow-y-auto">
              <button
                v-for="pack in testPacks"
                :key="pack.id"
                @click="addToPackTarget = pack.id; newPackName = ''"
                :class="[
                  'w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors',
                  addToPackTarget === pack.id
                    ? 'border-primary bg-primary-soft text-heading'
                    : 'border-default bg-surface hover:bg-surface-hover text-body-color'
                ]"
              >
                <span class="font-medium">{{ pack.name }}</span>
                <span class="text-sm text-muted">{{ pack.tests?.length || 0 }} tests</span>
              </button>
            </div>
          </div>

          <!-- Divider -->
          <div class="flex items-center gap-3">
            <div class="flex-1 border-t border-default"></div>
            <span class="text-sm text-muted">{{ testPacks.length > 0 ? 'or create new' : 'Create a new pack' }}</span>
            <div class="flex-1 border-t border-default"></div>
          </div>

          <!-- Create new pack -->
          <div>
            <label class="form-label">New pack name</label>
            <input
              v-model="newPackName"
              @input="addToPackTarget = newPackName ? 'new' : (testPacks[0]?.id || '')"
              type="text"
              placeholder="e.g. Smoke Tests, Login Suite"
              class="form-input"
            />
          </div>
          <p v-if="addToPackModalError" class="text-danger text-sm">{{ addToPackModalError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeAddToPackModal" class="btn btn-secondary">Cancel</button>
          <button
            @click="confirmAddToPack"
            :disabled="addingToPack || (!addToPackTarget && !newPackName)"
            class="btn btn-primary"
          >
            {{ addingToPack ? 'Adding...' : 'Add to Pack' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Promote to Synthetic Modal -->
    <Teleport to="body">
    <div v-if="showPromoteModal" class="modal-overlay">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h2 class="modal-title">Make this test a monitor</h2>
          <button @click="showPromoteModal = false" class="text-muted hover:text-heading">
            <X :size="24" />
          </button>
        </div>
        <div class="modal-body space-y-4">
          <p class="text-sm text-muted">
            Continuum will run <span class="font-medium text-heading">{{ promoteTarget?.name }}</span> against your live service on the interval below and send an alert to its webhooks when it fails and when it recovers.
          </p>

          <div>
            <label class="form-label" for="promote-interval">Check every</label>
            <select id="promote-interval" v-model="promoteForm.schedule" class="form-input">
              <option v-for="p in schedulePresets" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>

          <p class="text-xs text-muted">Needs Continuum connected in Settings. Webhooks, and how many failed checks raise an alert, are set in Continuum under Settings → Monitors.</p>
        </div>
        <div class="modal-footer">
          <button @click="showPromoteModal = false" class="btn btn-secondary">Cancel</button>
          <button @click="confirmPromote" :disabled="promoting" class="btn btn-primary">
            <Activity v-if="!promoting" :size="16" />
            {{ promoting ? 'Saving…' : 'Start monitoring' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>


    <!-- Delete Pack Confirm -->
    <Teleport to="body">
    <div v-if="packToDelete" class="modal-overlay">
      <div class="modal-content max-w-sm">
        <div class="modal-header">
          <h3 class="modal-title">Delete Test Pack</h3>
        </div>
        <div class="modal-body">
          <p class="text-body-color">Delete "<strong class="text-heading">{{ packToDelete.name }}</strong>"? Tests inside the pack won't be deleted.</p>
        </div>
        <div class="modal-footer">
          <button @click="packToDelete = null" class="btn btn-secondary">Cancel</button>
          <button @click="executeDeletePack" :disabled="deletingPack" class="btn btn-danger">
            {{ deletingPack ? 'Deleting...' : 'Delete Pack' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Quick-create feature modal -->
    <Teleport to="body">
    <div v-if="showQuickFeature" class="modal-overlay" @click.self="showQuickFeature = false">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="modal-title flex items-center gap-2"><Layers :size="18" />New Feature</h3>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Initiative *</label>
            <select v-model="quickFeatureForm.initiativeId" class="form-input" required>
              <option value="">— Select initiative —</option>
              <option v-for="i in initiatives" :key="i.id" :value="i.id">{{ i.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Feature Name *</label>
            <input v-model="quickFeatureForm.name" type="text" class="form-input" placeholder="e.g. User Authentication" @keydown.enter.prevent="saveQuickFeature" />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showQuickFeature = false" class="btn btn-secondary">Cancel</button>
          <button @click="saveQuickFeature" :disabled="quickFeatureSaving || !quickFeatureForm.name.trim() || !quickFeatureForm.initiativeId" class="btn btn-primary">
            {{ quickFeatureSaving ? 'Creating...' : 'Create Feature' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Add / Edit Variable Modal -->
    <Teleport to="body">
    <div v-if="showAddVariable || editingVariable" class="modal-overlay" @click.self="closeVariableModal">
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h2 class="modal-title">{{ editingVariable ? 'Edit Variable' : 'Add Variable' }}</h2>
          <button @click="closeVariableModal" class="text-muted hover:text-heading"><X :size="24" /></button>
        </div>
        <div class="modal-body space-y-4">
          <div>
            <label class="form-label">Variable Name <span class="text-danger">*</span></label>
            <input v-model="varForm.name" :disabled="!!editingVariable" class="form-input font-mono uppercase" placeholder="CONTINUUM_HOST" @input="varForm.name = varForm.name.toUpperCase().replace(/[^A-Z0-9_]/g, '')" />
            <p class="text-xs text-muted mt-1">Uppercase letters, numbers, underscores. Used as <code class="text-primary">&#123;&#123;{{ varForm.name || 'NAME' }}&#125;&#125;</code> in specs.</p>
          </div>
          <div>
            <label class="form-label">Value <span class="text-danger">*</span></label>
            <div class="relative">
              <input v-model="varForm.value" :type="varForm.showValue ? 'text' : (varForm.sensitive ? 'password' : 'text')" class="form-input pr-10" :placeholder="editingVariable && editingVariable.sensitive ? 'Leave blank to keep existing value' : 'Enter value'" />
              <button type="button" @click="varForm.showValue = !varForm.showValue" class="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading">
                <Eye v-if="!varForm.showValue" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>
          </div>
          <div>
            <label class="form-label">Description <span class="text-muted">(optional)</span></label>
            <input v-model="varForm.description" class="form-input" placeholder="e.g. Admin account for Continuum staging" />
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="varForm.sensitive" class="rounded" />
            <span class="text-sm">Sensitive — encrypt value and mask in UI</span>
          </label>
          <p v-if="varFormError" class="text-danger text-sm">{{ varFormError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeVariableModal" class="btn btn-secondary">Cancel</button>
          <button @click="saveVariable" :disabled="savingVariable" class="btn btn-primary">
            <Loader2 v-if="savingVariable" :size="14" class="animate-spin" />
            {{ editingVariable ? 'Update' : 'Add Variable' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bot,
  Plus,
  Play,
  RefreshCw,
  FolderOpen,
  FlaskConical,
  Trash2,
  X,
  CheckCircle,
  FileText,
  XCircle,
  Activity,
  Loader2,
  Save,
  GripVertical,
  Package,
  Layers,
  Database,
  Upload,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Target,
  Copy,
  Globe,
  Settings,
  Wrench,
  KeyRound,
  Eye,
  EyeOff,
  Pencil
} from 'lucide-vue-next'
import api, { getApiBaseUrl } from '@/lib/api'
import { engineName as getEngineLabel } from '@/lib/engineTerms'
import { openGeneratorWindow as openGeneratorWindowShared } from '@/lib/windows'
import HelpTooltip from '@/components/HelpTooltip.vue'
import ScriptEditor from '@/components/ScriptEditor.vue'
import EvidenceLinks from '@/components/EvidenceLinks.vue'

const route  = useRoute()
const router = useRouter()

function openGeneratorWindow() {
  return openGeneratorWindowShared(router)
}

// Persist the "came from generator" flag so the back button survives pack navigation
const cameFromGenerator = ref(route.query.from === 'generator')

const loading = ref(false)
const refreshingAll = ref(false)
const agentTests = ref([])
const testPacks = ref([])
const selectedPack = ref(null)
const selectedTests = ref([])
const selectedTest = ref(null)
const generatingId = ref(null)
const runningId = ref(null)
const runningAll = ref(false)
const runningPack = ref(false)
const showCreatePack = ref(false)
const creatingPack = ref(false)
const healing = ref(false)
const editingTest = ref(null)
const editingUrl = ref('')
const savingUrl = ref(false)
const packRunResult = ref(null)
const packRunError = ref(null)
const packFeatureHealth = ref(null) // Tier 1 RAG summary for the run pack's Feature, if it has one
const generatingAll = ref(false)
const generatingAllProgress = ref('')

// Environment management
const activeEnv = ref(null)
const allEnvs = ref([])
const showEnvPicker = ref(false)

// Test console (individual run/heal output)
const showConsole = ref(false)
const consoleLogs = ref([])
const consoleResult = ref(null)
const consoleSpecName = ref('')
const consoleEl = ref(null)
const consoleWrapper = ref(null)

async function openGenerator() {
  if (!window.__TAURI__) { router.push('/tests/terminal?mode=review'); return }
  const { Window } = await import('@tauri-apps/api/window')
  const win = await Window.getByLabel('generator')
  if (win) { await win.show(); await win.setFocus() }
}

function addLog(type, message) {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  consoleLogs.value.push({ type, message, time })
  nextTick(() => {
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
    if (consoleWrapper.value) consoleWrapper.value.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

// Promote to synthetic modal
const showPromoteModal = ref(false)
const promoteTarget = ref(null)
const promoting = ref(false)
const promoteForm = reactive({ schedule: '*/15 * * * *' })
// The intervals Continuum runs monitors at
const schedulePresets = [
  { label: '1 minute',   value: '*/1 * * * *' },
  { label: '5 minutes',  value: '*/5 * * * *' },
  { label: '10 minutes', value: '*/10 * * * *' },
  { label: '15 minutes', value: '*/15 * * * *' },
  { label: '30 minutes', value: '*/30 * * * *' },
  { label: '1 hour',     value: '0 * * * *' },
]
const monitorNotice = ref(null)
function showMonitorResult (continuum, okText) {
  if (!continuum) return
  monitorNotice.value = continuum.synced
    ? { ok: true, text: okText }
    : { ok: false, text: `Saved in Aurora, but not in Continuum yet. ${continuum.reason}` }
}

// Add-to-pack modal (from All Tests view)
const showAddToPackModal = ref(false)
const addToPackTarget = ref('')   // pack id or 'new'
const newPackName = ref('')
const addToPackModalError = ref('')
const addingToPack = ref(false)

// Pack setup/teardown editor
const packEdit = reactive({ setupCode: '', teardownCode: '', featureId: '' })

// Test data state
const continuumEnabled = ref(false)
const continuumDatasets = ref([])
const pushingPackId = ref(null)

// ── Pack hierarchy ────────────────────────────────────────────────────────────
const expandedInits = ref(new Set())
const expandedFeats = ref(new Set())

const packsHierarchy = computed(() => {
  const initMap = new Map()
  for (const pack of testPacks.value) {
    const initId   = pack.feature?.initiativeId || pack.initiativeId || null
    const initName = pack.feature?.initiativeName || pack.initiativeName || 'Unassigned'
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

// Auto-expand all groups when packs load
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
const localCsvFiles = ref([])
const packDataEdit = reactive({ mode: 'none', continuumId: '', localFileId: '' })
const varBuilder = reactive({ column: '', rowIndex: 0 })
const seedGenerating = ref(false)
const csvUploading = ref(false)
const savingPack = ref(false)

// Pack variables
const packVariables    = ref([])
const showAddVariable  = ref(false)
const editingVariable  = ref(null)
const savingVariable   = ref(false)
const varFormError     = ref('')
const varForm = reactive({ name: '', value: '', description: '', sensitive: false, showValue: false })

async function fetchPackVariables(packId) {
  if (!packId) { packVariables.value = []; return }
  try {
    const { data } = await api.get(`/api/agent-tests/packs/${packId}/variables`)
    packVariables.value = data
  } catch { packVariables.value = [] }
}

function editVariable(v) {
  editingVariable.value = v
  varForm.name        = v.name
  varForm.value       = ''
  varForm.description = v.description || ''
  varForm.sensitive   = v.sensitive
  varForm.showValue   = false
  varFormError.value  = ''
}

function closeVariableModal() {
  showAddVariable.value  = false
  editingVariable.value  = null
  varForm.name           = ''
  varForm.value          = ''
  varForm.description    = ''
  varForm.sensitive      = false
  varForm.showValue      = false
  varFormError.value     = ''
}

async function saveVariable() {
  varFormError.value = ''
  if (!varForm.name) { varFormError.value = 'Name is required'; return }
  if (!editingVariable.value && !varForm.value) { varFormError.value = 'Value is required'; return }
  savingVariable.value = true
  try {
    if (editingVariable.value) {
      const body = { sensitive: varForm.sensitive, description: varForm.description }
      if (varForm.value) body.value = varForm.value
      await api.put(`/api/agent-tests/packs/${selectedPack.value.id}/variables/${editingVariable.value.id}`, body)
    } else {
      await api.post(`/api/agent-tests/packs/${selectedPack.value.id}/variables`, {
        name: varForm.name, value: varForm.value, sensitive: varForm.sensitive, description: varForm.description
      })
    }
    await fetchPackVariables(selectedPack.value.id)
    closeVariableModal()
  } catch (err) {
    varFormError.value = err?.response?.data?.error || err.message || 'Failed to save variable'
  } finally { savingVariable.value = false }
}

async function deleteVariable(v) {
  if (!confirm(`Delete variable {{${v.name}}}? Specs using this placeholder will stop working.`)) return
  try {
    await api.delete(`/api/agent-tests/packs/${selectedPack.value.id}/variables/${v.id}`)
    await fetchPackVariables(selectedPack.value.id)
  } catch (err) {
    alert(err?.response?.data?.error || 'Failed to delete variable')
  }
}

// Delete pack
const packToDelete = ref(null)
const deletingPack = ref(false)

// Quick-create feature from pack settings
const showQuickFeature = ref(false)
const quickFeatureSaving = ref(false)
const quickFeatureForm = reactive({ name: '', initiativeId: '' })

// Drag-to-reorder (pack view only)
const localPackOrder = ref([])  // specId strings in current display order
const dragFromIdx = ref(null)

const newPack = ref({
  name: '',
  description: '',
  featureId: '',
  packSetupCode: '',
  packTeardownCode: ''
})
const initiatives = ref([])
const features = ref([])

// Computed counts
const readyCount = computed(() => agentTests.value.filter(t => t.status === 'ready').length)
const draftCount = computed(() => agentTests.value.filter(t => t.status === 'draft').length)
const failedCount = computed(() => agentTests.value.filter(t => t.status === 'failed').length)
const syntheticCount = computed(() => agentTests.value.filter(t => t.isSynthetic).length)

// Tests to display in the table — respects pack sortOrder when a pack is selected
const allPackTests = computed(() => {
  if (!selectedPack.value) return agentTests.value
  return localPackOrder.value
    .map(specId => agentTests.value.find(t => t.specId === specId))
    .filter(Boolean)
})

// Only passed tests are shown in the pack execution view
const tableTests = computed(() => {
  if (!selectedPack.value) return agentTests.value
  return allPackTests.value.filter(t => t.status === 'passed')
})

// Count of tests still being validated in Review
const inReviewCount = computed(() => {
  if (!selectedPack.value) return 0
  return allPackTests.value.filter(t => t.status !== 'passed').length
})

// Keep filteredTests as alias for backward compat with allSelected/header count
const filteredTests = tableTests

const allSelected = computed(() => {
  return tableTests.value.length > 0 && selectedTests.value.length === tableTests.value.length
})

// Data binding helpers
const datasetName = computed(() => {
  const ds = attachedDataset()
  if (!ds) return 'Dataset'
  // Continuum dataset has .name, local CSV has .filename
  return ds.name || ds.filename?.replace('.csv', '') || 'Dataset'
})

const generatedVarRef = computed(() => {
  const col = varBuilder.column
  const idx = varBuilder.rowIndex ?? 0
  if (!col) return `getRows('${datasetName.value}')[0].column`
  return `getRows('${datasetName.value}')[${idx}].${col}`
})

function copyColumnRef(col) {
  const ref = `getRows('${datasetName.value}')[0].${col}`
  navigator.clipboard.writeText(ref)
  // Could add toast notification here
}

function copyVarRef() {
  navigator.clipboard.writeText(generatedVarRef.value)
  // Could add toast notification here
}

// Sync pack setup/teardown into editor when selection changes
watch(selectedPack, (pack) => {
  if (pack) {
    packEdit.setupCode = pack.packSetupCode || ''
    packEdit.teardownCode = pack.packTeardownCode || ''
    packEdit.featureId = pack.featureId || ''
    packDataEdit.mode = pack.testDataMode || 'none'
    packDataEdit.continuumId = pack.testDataContinuumId || ''
    packDataEdit.localFileId = pack.testDataFileId || ''
    localPackOrder.value = [...(pack.tests || [])]
  } else {
    packDataEdit.mode = 'none'
    packDataEdit.continuumId = ''
    packDataEdit.localFileId = ''
    localPackOrder.value = []
  }
})

onMounted(refreshAll)

// The header Refresh button used to only call fetchAgentTests(), so newly created
// Initiatives/Features/Packs (e.g. created elsewhere in the same running session)
// never appeared here until the whole app was restarted. Mirrors the mount-time fetch set.
async function refreshAll() {
  refreshingAll.value = true
  try {
    await Promise.all([
      fetchAgentTests(),
      fetchTestPacks(),
      fetchInitiatives(),
      fetchFeatures(),
      fetchTestDataMeta(),
      fetchEnvironments()
    ])
  } finally {
    refreshingAll.value = false
  }
}

function envColorClass(color) {
  return { blue: 'bg-blue-500', green: 'bg-green-500', orange: 'bg-orange-400', purple: 'bg-purple-500', red: 'bg-red-500' }[color] || 'bg-blue-500'
}

async function fetchEnvironments() {
  try {
    const { data } = await api.get('/api/environments')
    allEnvs.value = data || []
    activeEnv.value = data.find(e => e.isActive) || null
  } catch { allEnvs.value = [] }
}

async function switchEnv(env) {
  try {
    if (env) {
      await api.post(`/api/environments/${env.id}/activate`)
    } else {
      if (activeEnv.value) await api.post(`/api/environments/${activeEnv.value.id}/deactivate`)
    }
    await fetchEnvironments()
  } catch {}
  showEnvPicker.value = false
}

async function fetchTestDataMeta() {
  try {
    const [settingsRes, localRes, continuumRes] = await Promise.all([
      api.get('/api/settings'),
      api.get('/api/test-data'),
      api.get('/api/test-data/continuum').catch(() => ({ data: { datasets: [] } }))
    ])
    continuumEnabled.value = settingsRes.data?.settings?.continuumIntegration?.enabled ?? false
    localCsvFiles.value = localRes.data?.files || []
    continuumDatasets.value = continuumRes.data?.datasets || []
  } catch {
    localCsvFiles.value = []
    continuumDatasets.value = []
  }
}

async function fetchInitiatives() {
  try {
    const response = await api.get('/api/initiatives')
    initiatives.value = response.data?.initiatives || []
  } catch {
    initiatives.value = []
  }
}

async function fetchFeatures() {
  try {
    const response = await api.get('/api/features')
    features.value = response.data?.features || []
  } catch (e) {
    console.error('fetchFeatures failed:', e?.response?.status, e?.response?.data || e?.message)
    features.value = []
  }
}

async function fetchAgentTests() {
  loading.value = true
  try {
    const response = await api.get('/api/agent-tests/specs')
    agentTests.value = response.data
  } catch (error) {
    console.error('Failed to fetch agent tests:', error)
  } finally {
    loading.value = false
  }
}

async function fetchTestPacks() {
  try {
    const response = await api.get('/api/agent-tests/packs')
    testPacks.value = response.data
    // Re-point selectedPack at the freshly-fetched object so the watcher fires
    // and packEdit stays in sync (avoids stale featureId/setup code after external changes)
    if (selectedPack.value) {
      const fresh = testPacks.value.find(p => p.id === selectedPack.value.id)
      if (fresh) selectedPack.value = fresh
    }
  } catch (error) {
    console.error('Failed to fetch test packs:', error)
    testPacks.value = []
  }
}

async function createTestPack() {
  creatingPack.value = true
  try {
    const response = await api.post('/api/agent-tests/packs', {
      name: newPack.value.name,
      description: newPack.value.description,
      featureId: newPack.value.featureId || null,
      packSetupCode: newPack.value.packSetupCode || null,
      packTeardownCode: newPack.value.packTeardownCode || null
    })
    testPacks.value.push(response.data)
    newPack.value = { name: '', description: '', featureId: '', packSetupCode: '', packTeardownCode: '' }
    showCreatePack.value = false
  } catch (error) {
    console.error('Failed to create test pack:', error)
  } finally {
    creatingPack.value = false
  }
}

function closeAddToPackModal() {
  showAddToPackModal.value = false
  addToPackTarget.value = ''
  newPackName.value = ''
  addToPackModalError.value = ''
}

async function confirmAddToPack() {
  addToPackModalError.value = ''
  const isNew = newPackName.value.trim() !== ''
  const targetId = isNew ? null : addToPackTarget.value
  if (!isNew && !targetId) {
    addToPackModalError.value = 'Select a pack or enter a new pack name.'
    return
  }
  addingToPack.value = true
  try {
    let packId = targetId
    if (isNew) {
      const res = await api.post('/api/agent-tests/packs', { name: newPackName.value.trim() })
      packId = res.data.id
      testPacks.value.push(res.data)
    }
    await api.post(`/api/agent-tests/packs/${packId}/tests`, { testIds: selectedTests.value })
    await fetchTestPacks()
    // Select the pack the user just added to
    const updated = testPacks.value.find(p => p.id === packId)
    if (updated) selectedPack.value = updated
    selectedTests.value = []
    closeAddToPackModal()
  } catch (err) {
    addToPackModalError.value = err.response?.data?.error || 'Failed to add tests to pack.'
  } finally {
    addingToPack.value = false
  }
}

function selectPack(pack) {
  if (selectedPack.value?.id === pack.id) {
    selectedPack.value = null
    packVariables.value = []
  } else {
    selectedPack.value = pack
    fetchPackVariables(pack.id)
  }
  selectedTests.value = []
  packRunResult.value = null
  packRunError.value = null
}

async function savePackSettings() {
  if (!selectedPack.value) return
  savingPack.value = true
  try {
    const { data } = await api.put(`/api/agent-tests/packs/${selectedPack.value.id}`, {
      packSetupCode: packEdit.setupCode,
      packTeardownCode: packEdit.teardownCode,
      featureId: packEdit.featureId || null,
      testDataFileId: packDataEdit.localFileId || null,
      testDataContinuumId: packDataEdit.continuumId || null,
      testDataMode: packDataEdit.mode || 'none'
    })
    const idx = testPacks.value.findIndex(p => p.id === selectedPack.value.id)
    if (idx !== -1) testPacks.value[idx] = data
    selectedPack.value = data
  } catch (err) {
    console.error('Failed to save pack settings:', err)
  } finally {
    savingPack.value = false
  }
}

async function uploadLocalCsv(event) {
  const file = event.target.files?.[0]
  if (!file) return
  csvUploading.value = true
  try {
    const text = await file.text()
    const { data } = await api.post(`/api/test-data?filename=${encodeURIComponent(file.name)}`, text, {
      headers: { 'Content-Type': 'text/plain' }
    })
    localCsvFiles.value.unshift(data.file)
    packDataEdit.localFileId = data.file.id
    packDataEdit.continuumId = ''
  } catch (err) {
    console.error('Failed to upload CSV:', err)
  } finally {
    csvUploading.value = false
    event.target.value = ''
  }
}

function attachedDataset() {
  if (packDataEdit.continuumId) return continuumDatasets.value.find(d => d._id === packDataEdit.continuumId || d.id === packDataEdit.continuumId) || null
  if (packDataEdit.localFileId) return localCsvFiles.value.find(f => f.id === packDataEdit.localFileId) || null
  return null
}

function clearTestData() {
  packDataEdit.continuumId = ''
  packDataEdit.localFileId = ''
  packDataEdit.mode = 'none'
}

async function generateSeedCode() {
  if (!selectedPack.value) return
  seedGenerating.value = true
  try {
    const firstSpec = selectedPack.value.tests?.[0]?.spec
    const url = firstSpec?.url || null
    const { data } = await api.post(`/api/agent-tests/packs/${selectedPack.value.id}/generate-seed`, { url })
    packEdit.setupCode = data.code || ''
  } catch (err) {
    console.error('Failed to generate seed code:', err)
  } finally {
    seedGenerating.value = false
  }
}

function confirmDeletePack(pack) { packToDelete.value = pack }

async function executeDeletePack() {
  if (!packToDelete.value) return
  deletingPack.value = true
  try {
    await api.delete(`/api/agent-tests/packs/${packToDelete.value.id}`)
    testPacks.value = testPacks.value.filter(p => p.id !== packToDelete.value.id)
    if (selectedPack.value?.id === packToDelete.value.id) selectedPack.value = null
    packToDelete.value = null
  } catch (err) {
    console.error('Failed to delete pack:', err)
  } finally {
    deletingPack.value = false
  }
}

async function saveQuickFeature() {
  if (!quickFeatureForm.name.trim() || !quickFeatureForm.initiativeId) return
  quickFeatureSaving.value = true
  try {
    const { data } = await api.post('/api/features', {
      name: quickFeatureForm.name.trim(),
      initiativeId: quickFeatureForm.initiativeId
    })
    if (data.success) {
      await fetchFeatures()
      packEdit.featureId = data.feature.id
      showQuickFeature.value = false
      quickFeatureForm.name = ''
      quickFeatureForm.initiativeId = ''
    }
  } catch (err) {
    console.error('Failed to create feature:', err)
  } finally {
    quickFeatureSaving.value = false
  }
}

// Drag-to-reorder handlers
function onDragStart(idx) {
  dragFromIdx.value = idx
}

async function onDrop(toIdx) {
  if (dragFromIdx.value === null || dragFromIdx.value === toIdx || !selectedPack.value) {
    dragFromIdx.value = null
    return
  }
  const order = [...localPackOrder.value]
  const [moved] = order.splice(dragFromIdx.value, 1)
  order.splice(toIdx, 0, moved)
  localPackOrder.value = order
  dragFromIdx.value = null
  try {
    await api.put(`/api/agent-tests/packs/${selectedPack.value.id}/order`, { specIds: order })
  } catch (err) {
    console.error('Failed to save pack order:', err)
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedTests.value = []
  } else {
    selectedTests.value = filteredTests.value.map(t => t.specId)
  }
}

function toggleTestSelection(specId) {
  const index = selectedTests.value.indexOf(specId)
  if (index === -1) {
    selectedTests.value.push(specId)
  } else {
    selectedTests.value.splice(index, 1)
  }
}

async function addTestsToPack() {
  if (!selectedPack.value || selectedTests.value.length === 0) return

  try {
    await api.post(`/api/agent-tests/packs/${selectedPack.value.id}/tests`, {
      testIds: selectedTests.value
    })
    await fetchTestPacks()
    const updatedPack = testPacks.value.find(p => p.id === selectedPack.value.id)
    if (updatedPack) selectedPack.value = updatedPack
    selectedTests.value = []
  } catch (error) {
    console.error('Failed to add tests to pack:', error)
  }
}

async function removeTestsFromPack() {
  if (!selectedPack.value || selectedTests.value.length === 0) return

  try {
    await api.delete(`/api/agent-tests/packs/${selectedPack.value.id}/tests`, {
      data: { testIds: selectedTests.value }
    })
    await fetchTestPacks()
    const updatedPack = testPacks.value.find(p => p.id === selectedPack.value.id)
    if (updatedPack) selectedPack.value = updatedPack
    selectedTests.value = []
  } catch (error) {
    console.error('Failed to remove tests from pack:', error)
  }
}

async function generateTestCode(specId) {
  generatingId.value = specId
  try {
    await api.post(`/api/agent-tests/specs/${specId}/generate`)
    await fetchAgentTests()
  } catch (error) {
    console.error('Failed to generate test:', error)
    console.error('Failed to generate test code')
  } finally {
    generatingId.value = null
  }
}

async function healTest(specId) {
  const spec = tableTests.value.find(t => t.specId === specId)
  consoleSpecName.value = spec?.name || specId
  consoleLogs.value = []
  consoleResult.value = null
  showConsole.value = true
  healing.value = true

  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/agent-tests/specs/${specId}/heal-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6))
            addLog(event.type, event.message || '')
          } catch {}
        }
      }
    }
  } catch (error) {
    addLog('error', error.message || 'Heal failed')
  } finally {
    healing.value = false
    await fetchAgentTests()
  }
}

async function onScriptSaved() {
  await fetchAgentTests()
  // Keep editor open but refresh the spec data so the editor reflects saved state
  if (editingTest.value) {
    const updated = agentTests.value.find(t => t.specId === editingTest.value.specId)
    if (updated) editingTest.value = updated
  }
}

async function runAgentTest(specId) {
  const spec = tableTests.value.find(t => t.specId === specId)
  consoleSpecName.value = spec?.name || specId
  consoleLogs.value = []
  consoleResult.value = null
  showConsole.value = true
  runningId.value = specId
  addLog('step', `Running: ${spec?.name || specId}`)

  try {
    const { data } = await api.post(`/api/agent-tests/specs/${specId}/run`, {}, { timeout: 120000 })
    consoleResult.value = data
    addLog(data.status === 'passed' ? 'done' : 'error',
      data.status === 'passed' ? 'Test passed' : `Test failed`)
    await fetchAgentTests()
  } catch (error) {
    addLog('error', error?.response?.data?.error || error.message || 'Run failed')
  } finally {
    runningId.value = null
  }
}

async function runAllTests() {
  runningAll.value = true
  try {
    await api.post('/api/agent-tests/run-all')
    await fetchAgentTests()
  } catch (error) {
    console.error('Failed to run all tests:', error)
  } finally {
    runningAll.value = false
  }
}

async function runCurrentPack() {
  if (!selectedPack.value) return
  runningPack.value = true
  packRunResult.value = null
  packRunError.value = null
  packFeatureHealth.value = null
  try {
    const { data } = await api.post(`/api/agent-tests/packs/${selectedPack.value.id}/run`, { environmentId: activeEnv.value?.id || null }, { timeout: 300000 })
    packRunResult.value = data
    await fetchAgentTests()
    await fetchTestPacks()
    // Inline Tier 1 RAG summary, scoped to this pack's Feature — only if it has one
    if (selectedPack.value.featureId) {
      api.get(`/api/features/${selectedPack.value.featureId}/health`)
        .then(({ data }) => { packFeatureHealth.value = data.ragRows?.[0] || null })
        .catch(() => {}) // non-fatal — the per-spec results below still show fine without it
    }
  } catch (error) {
    packRunError.value = error?.response?.data?.error || error.message || 'Pack run failed'
    console.error('Failed to run pack:', error)
  } finally {
    runningPack.value = false
  }
}

async function deleteTest(specId) {
  try {
    await api.delete(`/api/agent-tests/specs/${specId}`)
    await fetchAgentTests()
  } catch (error) {
    console.error('Failed to delete test:', error)
  }
}

function openPromoteModal(test) {
  promoteTarget.value = test
  promoteForm.schedule = '*/15 * * * *'
  showPromoteModal.value = true
}

async function confirmPromote() {
  if (!promoteTarget.value) return
  promoting.value = true
  try {
    const { data } = await api.post(`/api/agent-tests/specs/${promoteTarget.value.specId}/promote`, {
      schedule: promoteForm.schedule
    })
    showMonitorResult(data.continuum, `${promoteTarget.value.name} is now a monitor in Continuum.`)
    await fetchAgentTests()
    showPromoteModal.value = false
    promoteTarget.value = null
  } catch (error) {
    console.error('Failed to promote test:', error)
  } finally {
    promoting.value = false
  }
}

async function demoteFromSynthetic(specId) {
  try {
    const { data } = await api.post(`/api/agent-tests/specs/${specId}/demote`)
    showMonitorResult(data.continuum, 'Monitoring stopped in Continuum.')
    await fetchAgentTests()
  } catch (error) {
    console.error('Failed to demote test:', error)
  }
}

async function pushPackToContinuum(pack) {
  if (pushingPackId.value) return
  pushingPackId.value = pack.id
  try {
    await api.post(`/api/agent-tests/packs/${pack.id}/push-continuum`)
    packRunError.value = null
  } catch (error) {
    packRunError.value = error.response?.data?.message || 'Failed to push to Continuum'
  } finally {
    pushingPackId.value = null
  }
}

async function generateAllDraftSpecs() {
  if (!selectedPack.value || generatingAll.value) return
  const drafts = tableTests.value.filter(t => t.status === 'draft' || t.status === 'failed' || !t.generatedCode)
  if (drafts.length === 0) return
  generatingAll.value = true
  packRunError.value = null
  let done = 0
  for (const spec of drafts) {
    generatingAllProgress.value = `${done + 1}/${drafts.length}`
    try {
      await api.post(`/api/agent-tests/specs/${spec.specId}/generate`, {}, { timeout: 120000 })
    } catch (e) {
      console.error(`Failed to generate ${spec.specId}:`, e)
    }
    done++
  }
  generatingAll.value = false
  generatingAllProgress.value = ''
  await fetchAgentTests()
}

async function saveSpecUrl() {
  if (!selectedTest.value || savingUrl.value) return
  savingUrl.value = true
  try {
    await api.put(`/api/agent-tests/specs/${selectedTest.value.specId}`, { url: editingUrl.value })
    selectedTest.value = { ...selectedTest.value, url: editingUrl.value }
    const idx = agentTests.value.findIndex(t => t.specId === selectedTest.value.specId)
    if (idx !== -1) agentTests.value[idx] = { ...agentTests.value[idx], url: editingUrl.value }
  } catch (e) {
    console.error('Failed to save URL:', e)
  } finally {
    savingUrl.value = false
  }
}

function viewTest(test) {
  selectedTest.value = test
  editingUrl.value = test.url || ''
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'ready':
      return 'badge-success'
    case 'draft':
      return 'badge-warning'
    case 'generating':
      return 'badge-info'
    case 'passed':
      return 'badge-success'
    case 'failed':
      return 'badge-danger'
    default:
      return 'badge-secondary'
  }
}

function getEngineBadgeClass() {
  return 'badge-primary'
}

function formatDate(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
/* ── Pack hierarchy tree ─────────────────────────────────────────────────── */
.pack-hierarchy { display: flex; flex-direction: column; gap: 2px; }

.ph-init-header {
  display: flex; align-items: center; gap: 5px;
  width: 100%; padding: 5px 4px; border-radius: 5px; cursor: pointer;
  background: transparent; border: none; text-align: left;
  transition: background 0.12s;
}
.ph-init-header:hover { background: var(--color-surface-hover); }
.ph-init-icon { color: var(--color-primary); flex-shrink: 0; }
.ph-init-name { font-size: 12px; font-weight: 600; color: var(--color-heading); flex: 1; min-width: 0; truncate: true; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ph-feature { padding-left: 16px; }
.ph-feat-header {
  display: flex; align-items: center; gap: 5px;
  width: 100%; padding: 3px 4px; border-radius: 4px; cursor: pointer;
  background: transparent; border: none; text-align: left;
  transition: background 0.12s;
}
.ph-feat-header:hover { background: var(--color-surface-hover); }
.ph-feat-icon { color: var(--color-muted); flex-shrink: 0; }
.ph-feat-name { font-size: 11px; color: var(--color-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ph-pack {
  display: flex; align-items: center; gap: 1px;
  padding-left: 28px; border-radius: 5px;
  transition: background 0.12s;
}
.ph-pack:hover { background: var(--color-surface-hover); }
.ph-pack--selected { background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
.ph-pack--selected .ph-pack-name { color: var(--color-primary); font-weight: 500; }
.ph-pack-btn {
  display: flex; align-items: center; gap: 5px; flex: 1; min-width: 0;
  padding: 4px 4px; background: transparent; border: none; cursor: pointer; text-align: left;
}
.ph-pack-icon { flex-shrink: 0; color: var(--color-primary); }
.ph-pack-icon--muted { color: var(--color-muted); }
.ph-pack-name { font-size: 11px; color: var(--color-heading); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ph-count { font-size: 10px; color: var(--color-muted); flex-shrink: 0; padding: 0 2px; }
.ph-chevron { flex-shrink: 0; color: var(--color-muted); }
.ph-action {
  flex-shrink: 0; padding: 3px 4px; background: transparent; border: none;
  cursor: pointer; color: var(--color-muted); border-radius: 3px;
  transition: color 0.12s;
}
.ph-action:hover { color: var(--color-primary); }
.ph-action--danger:hover { color: var(--color-danger); }
</style>
