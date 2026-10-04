<template>
  <div class="space-y-6" data-testid="page-test-generator">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <p class="text-body text-body-color">
          {{ mode === 'build' ? 'AI-powered test generation for all test types using Playwright' : 'Validate and stabilise imported tests before adding them to active packs' }}
        </p>
      </div>
      <div class="flex items-center gap-1 p-1 rounded-lg" style="background:var(--color-surface)">
        <button
          @click="switchMode('build')"
          :class="['flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all', mode === 'build' ? 'bg-primary text-white' : 'text-muted hover:text-heading']"
        >
          <Terminal :size="14" />
          Build
        </button>
        <button
          @click="switchMode('review')"
          :class="['flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all', mode === 'review' ? 'bg-primary text-white' : 'text-muted hover:text-heading']"
        >
          <ClipboardCheck :size="14" />
          Review
          <span v-if="reviewPendingCount > 0" class="badge badge-warning" style="font-size:10px;padding:1px 5px;">{{ reviewPendingCount }}</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- ── BUILD: Test Configuration Panel ── -->
      <div v-if="mode === 'build'" class="card">
        <div class="card-header">
          <h3 class="card-title flex items-center gap-2">
            <Settings :size="18" class="text-primary" />
            Test Configuration
          </h3>
        </div>
        <div class="card-body space-y-4">
          <!-- Test Type Selector -->
          <div>
            <label class="form-label">Test Type<HelpTooltip text="Functional: tests that click through your web application like a real user. API: tests that check your application's data endpoints directly." position="right" /></label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="type in testTypes"
                :key="type.id"
                @click="selectTestType(type.id)"
                :disabled="hasActiveTest"
                class="test-type-btn"
                :class="{ active: testConfig.type === type.id, disabled: hasActiveTest }"
              >
                <component :is="type.icon" :size="18" />
                <span>{{ type.label }}</span>
              </button>
            </div>
          </div>

          <div>
            <label class="form-label">Test Name</label>
            <input
              v-model="testConfig.name"
              type="text"
              :placeholder="namePlaceholder"
              class="form-input"
              :disabled="hasActiveTest"
            />
          </div>

          <div>
            <label class="form-label">{{ urlLabel }}</label>
            <input
              v-model="testConfig.url"
              type="text"
              :placeholder="urlPlaceholder"
              class="form-input"
              :disabled="hasActiveTest"
            />
          </div>

          <!-- API-specific fields -->
          <div v-if="testConfig.type === 'api'" class="space-y-4">
            <!-- API Discovery Section -->
            <div class="api-discovery-section">
              <div class="flex items-center justify-between mb-2">
                <label class="form-label mb-0">Discover APIs<HelpTooltip text="Scans the URL you entered to find available API endpoints automatically. Useful if you're not sure what endpoints your application has." position="right" /></label>
                <button
                  @click="scanForAPIs"
                  :disabled="!testConfig.url || isScanning || hasActiveTest"
                  class="btn btn-sm btn-secondary"
                >
                  <Search :size="14" :class="{ 'animate-spin': isScanning }" />
                  {{ isScanning ? 'Scanning...' : 'Scan Domain' }}
                </button>
              </div>

              <!-- Discovered Endpoints Dropdown -->
              <div v-if="discoveredEndpoints.length > 0" class="mt-2">
                <select
                  v-model="selectedEndpoint"
                  @change="applyDiscoveredEndpoint"
                  class="form-select"
                  :disabled="hasActiveTest"
                >
                  <option value="">Select discovered endpoint...</option>
                  <optgroup v-if="swaggerEndpoints.length > 0" label="From OpenAPI/Swagger">
                    <option
                      v-for="ep in swaggerEndpoints"
                      :key="ep.fullUrl + ep.method"
                      :value="JSON.stringify(ep)"
                    >
                      {{ ep.method }} {{ ep.path }} {{ ep.summary ? `- ${ep.summary}` : '' }}
                    </option>
                  </optgroup>
                  <optgroup v-if="probedEndpoints.length > 0" label="Discovered Endpoints">
                    <option
                      v-for="ep in probedEndpoints"
                      :key="ep.fullUrl + ep.method"
                      :value="JSON.stringify(ep)"
                    >
                      {{ ep.method }} {{ ep.path }} {{ ep.requiresAuth ? '🔒' : '' }} {{ ep.summary ? `- ${ep.summary}` : '' }}
                    </option>
                  </optgroup>
                </select>
                <div class="text-xs text-muted mt-1">
                  Found {{ discoveredEndpoints.length }} endpoint(s)
                  <span v-if="swaggerSpecUrl" class="ml-2">
                    • <a :href="swaggerSpecUrl" target="_blank" class="text-primary hover:underline">OpenAPI Spec</a>
                  </span>
                </div>
              </div>

              <!-- Scan Status -->
              <div v-if="scanError" class="mt-2 text-xs text-danger">
                {{ scanError }}
              </div>
            </div>

            <div>
              <label class="form-label">HTTP Method</label>
              <select v-model="testConfig.method" class="form-select" :disabled="hasActiveTest">
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label class="form-label">Headers (JSON)</label>
              <textarea
                v-model="testConfig.headers"
                rows="2"
                placeholder='{"Authorization": "Bearer token"}'
                class="form-input font-mono text-sm"
                :disabled="hasActiveTest"
              ></textarea>
            </div>
          </div>

          <div>
            <label class="form-label">Template<HelpTooltip text="Pre-written test descriptions for common scenarios like login, form submission, or page load checks. Select one to use it as a starting point." position="right" /></label>
            <select
              v-model="selectedTemplate"
              @change="applyTemplate"
              class="form-select"
              :disabled="hasActiveTest"
            >
              <option value="">Select a template...</option>
              <option v-for="template in filteredTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </option>
            </select>
          </div>

          <div v-if="hasActiveTest" class="pt-2 border-t border-default">
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted">Active Test:</span>
              <span class="font-medium text-heading">{{ testConfig.name }}</span>
            </div>
            <div class="flex items-center justify-between text-sm mt-1">
              <span class="text-muted">Type:</span>
              <span :class="['badge', getTypeBadgeClass(testConfig.type)]">{{ testConfig.type }}</span>
            </div>
            <div class="flex items-center justify-between text-sm mt-1">
              <span class="text-muted">Status:</span>
              <span :class="['badge', getStatusBadgeClass(currentStatus)]">{{ currentStatus }}</span>
            </div>
            <button
              @click="resetTest"
              class="btn btn-secondary w-full mt-3"
              :disabled="isProcessing"
            >
              Start New Test
            </button>
          </div>
        </div>
      </div>

      <!-- ── REVIEW: Queue Panel ── -->
      <div v-if="mode === 'review'" class="card" style="overflow:hidden;position:sticky;top:24px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;">
        <div class="card-header" style="flex-shrink:0;">
          <h3 class="card-title flex items-center gap-2">
            <ClipboardCheck :size="16" class="text-primary" />
            Review Queue
          </h3>
          <div class="flex items-center gap-2">
            <span v-if="reviewPendingCount > 0" class="badge badge-warning">{{ reviewPendingCount }} pending</span>
            <button @click="openCreatePack" class="btn btn-sm btn-primary" title="New Pack">
              <Plus :size="12" />
            </button>
            <button @click="fetchReviewQueue" class="btn btn-sm btn-secondary" :disabled="reviewLoading">
              <RefreshCw :size="12" :class="reviewLoading ? 'animate-spin' : ''" />
            </button>
          </div>
        </div>
        <div class="card-body !p-0" style="flex:1;overflow-y:auto;min-height:0;">
          <div v-if="reviewLoading" class="p-6 text-center text-muted text-sm">Loading…</div>
          <div v-else-if="reviewQueueError" class="p-4">
            <p class="text-xs text-danger font-medium mb-1">Failed to load queue</p>
            <p class="text-xs text-muted">{{ reviewQueueError }}</p>
            <button @click="fetchReviewQueue" class="btn btn-sm btn-secondary mt-3">Retry</button>
          </div>
          <div v-else-if="reviewQueue.length === 0" class="p-6 text-center">
            <ClipboardCheck :size="32" class="text-success mx-auto mb-2" />
            <p class="text-sm text-heading font-medium">No test packs found</p>
            <p class="text-xs text-muted mt-1">Click the + button above to create one, or create packs in the Test Packs view</p>
          </div>
          <div v-else>
            <div v-for="pack in reviewQueue" :key="pack.packId"
              :class="['border-b border-default last:border-0', selectedReviewPack?.packId === pack.packId && !selectedReviewSpec ? 'bg-primary/5' : '']"
            >
              <!-- Pack row: chevron expands list, name selects pack -->
              <div class="flex items-center">
                <!-- Chevron — expand/collapse spec list only -->
                <button
                  @click="toggleExpandOnly(pack.packId)"
                  class="pl-3 pr-1 py-3 text-muted hover:text-heading transition-colors flex-shrink-0"
                  :title="expandedPacks.has(pack.packId) ? 'Collapse' : 'Expand spec list'"
                >
                  <component :is="expandedPacks.has(pack.packId) ? ChevronDown : ChevronRight" :size="14" />
                </button>

                <!-- Pack name — selects pack and shows detail in right pane -->
                <button
                  @click="selectPack(pack)"
                  class="flex items-center gap-2 px-2 py-3 text-left flex-1 min-w-0"
                >
                  <span class="text-sm font-medium text-heading flex-1 truncate">{{ pack.packName }}</span>
                  <span v-if="pack.passed === pack.total && pack.specs.every(s => s.hasCode)" class="badge badge-success flex-shrink-0" style="font-size:10px;">✓ all passed</span>
                  <span v-else-if="pack.failed > 0" class="badge badge-danger flex-shrink-0" style="font-size:10px;">{{ pack.failed }} failed</span>
                  <span v-else-if="pack.draft > 0" class="badge badge-warning flex-shrink-0" style="font-size:10px;">{{ pack.draft }} pending</span>
                </button>

                <!-- Pack actions -->
                <div class="pr-3 flex-shrink-0 flex items-center gap-1">
                  <span v-if="packGenerating.get(pack.packId)" class="text-xs text-muted font-mono">
                    {{ packGenerating.get(pack.packId).done }}/{{ packGenerating.get(pack.packId).total }}
                  </span>
                  <!-- Generate/Regenerate — always available -->
                  <button
                    v-if="!packGenerating.get(pack.packId)"
                    @click.stop="generatePackSpecs(pack)"
                    class="p-1.5 rounded text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                    :title="pack.specs.some(s => s.hasCode) ? 'Regenerate all specs (uses pack variables)' : 'Generate code for all specs'"
                  >
                    <Bot :size="14" />
                  </button>
                  <!-- Run -->
                  <button
                    v-if="!packRunning.has(pack.packId) && pack.specs.some(s => s.hasCode)"
                    @click.stop="runPackAll(pack)"
                    class="p-1.5 rounded text-muted hover:text-success hover:bg-success/10 transition-colors"
                    title="Run all specs"
                  >
                    <Play :size="14" />
                  </button>
                  <span v-if="packRunning.has(pack.packId)" class="text-xs text-muted font-mono">running…</span>
                </div>
              </div>

              <!-- Spec list (only when expanded) -->
              <div v-if="expandedPacks.has(pack.packId)">
                <div
                  v-for="spec in pack.specs"
                  :key="spec.specId"
                  @click="selectReviewSpec(pack, spec)"
                  :class="['group w-full flex items-center gap-2 pl-0 pr-2 py-2 text-sm transition-colors cursor-pointer',
                    spec.excluded ? 'opacity-40' : '',
                    selectedReviewSpec?.specId === spec.specId ? 'bg-primary/10' : 'hover:bg-surface']"
                  :style="selectedReviewSpec?.specId === spec.specId ? 'border-left:2px solid var(--color-primary);padding-left:calc(2.25rem - 2px)' : 'border-left:2px solid transparent;padding-left:calc(2.25rem - 2px)'"
                >
                  <button
                    @click.stop="selectReviewSpec(pack, spec)"
                    :class="['flex items-center gap-2 flex-1 min-w-0 text-left',
                      selectedReviewSpec?.specId === spec.specId ? 'text-primary' : 'text-body']"
                  >
                    <component :is="reviewStatusIcon(spec)" :size="13" :style="{ color: spec.excluded ? 'var(--color-muted)' : reviewStatusColor(spec), flexShrink: 0 }" />
                    <span :class="['truncate flex-1', spec.excluded ? 'line-through text-muted' : '']">{{ spec.name }}</span>
                    <span v-if="spec.healCount > 0" class="text-xs text-muted flex-shrink-0">×{{ spec.healCount }}</span>
                    <span :class="['text-xs flex-shrink-0 px-1.5 py-0.5 rounded font-mono',
                      spec.testType === 'api' ? 'bg-info/10 text-info' : 'bg-success/10 text-success']"
                      style="font-size:9px;">{{ spec.testType === 'api' ? 'API' : 'E2E' }}</span>
                  </button>
                  <button
                    @click.stop="toggleExcludeSpec(pack, spec)"
                    :title="spec.excluded ? 'Re-include in pack runs' : 'Exclude from pack runs'"
                    :class="['flex-shrink-0 p-1 rounded transition-colors',
                      spec.excluded ? 'text-warning hover:text-heading' : 'text-muted hover:text-warning opacity-0 group-hover:opacity-100']"
                  >
                    <Ban v-if="!spec.excluded" :size="11" />
                    <CheckCircle v-else :size="11" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── BUILD: Terminal Container ── -->
      <div v-if="mode === 'build'" class="lg:col-span-2 flex flex-col gap-2">

        <!-- Action bar — above the terminal -->
        <div class="terminal-actions">
          <!-- Authoring steps: Probe → Plan → Edit → Generate -->
          <button
            v-if="testConfig.type === 'functional'"
            @click="doProbe"
            :disabled="!canProbe"
            class="action-btn probe"
            aria-label="Probe Page"
          >
            <Scan :size="14" />
            Probe
            <HelpTooltip text="Step 0 (optional) — Scans the target URL with a real browser to extract navigation links, headings and forms. The AI uses these real element names to write more accurate tests." position="top" />
          </button>
          <button
            @click="doPlan"
            :disabled="!canPlan"
            class="action-btn plan"
            aria-label="Plan"
          >
            <FileText :size="14" />
            Plan
            <HelpTooltip text="Step 1 — Aurora reads your plain-English description and breaks it into a step-by-step test plan. Review it before generating." position="top" />
          </button>
          <button
            @click="showEditSpec"
            :disabled="!canEditSpec"
            class="action-btn edit"
            aria-label="Edit Spec"
          >
            <Pencil :size="14" />
            Edit
            <HelpTooltip text="Refine the test plan before code is generated. Useful if the AI misunderstood part of your description." position="top" />
          </button>
          <button
            @click="doGenerate"
            :disabled="!canGenerate"
            class="action-btn generate action-btn--primary"
            aria-label="Generate Code"
          >
            <Code :size="16" />
            Generate
            <HelpTooltip text="Step 2 — Aurora writes the test code from your plan. You don't need to read or understand the code — just run it." position="top" />
          </button>

          <div class="flex-1"></div>

          <!-- Execution steps: Run · Heal · Validate — grouped right -->
          <button
            @click="doRun"
            :disabled="!canRun"
            class="action-btn run"
            aria-label="Run Test"
          >
            <Play :size="14" />
            Run
            <HelpTooltip text="Step 3 — Runs the test against your application in a real browser. Results appear in the terminal above." position="top" />
          </button>
          <button
            @click="doHeal"
            :disabled="!canHeal"
            class="action-btn heal"
            aria-label="Heal Test"
          >
            <Wrench :size="14" />
            Heal
            <HelpTooltip text="If a test fails because your app's layout changed, Heal asks the AI to update the test automatically. No rewriting needed." position="top" />
          </button>
          <button
            v-if="store.selectedSpec && store.selectedSpec.generatedCode"
            @click="openValidate(store.selectedSpec.specId)"
            class="action-btn validate"
            aria-label="Validate with Browser"
          >
            <ScanEye :size="14" />
            Validate
            <HelpTooltip text="Drive a real browser through each step to discover correct selectors and produce a spec that works first time." position="top" />
          </button>
          <button
            v-if="canSave"
            @click="saveTest"
            :disabled="savingTest"
            class="action-btn save"
            aria-label="Save Test"
          >
            <Save :size="14" />
            {{ savingTest ? 'Saving...' : 'Save Test' }}
          </button>
        </div>

        <div class="terminal-container">
          <!-- Terminal Header -->
          <div class="terminal-header">
            <div class="terminal-dots">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <div class="terminal-title">aurora-generator ~ {{ testConfig.type || 'agent' }}</div>
            <div class="terminal-status">
              <span class="status-dot" :class="connectionClass"></span>
              <span class="status-text">{{ connectionStatus }}</span>
            </div>
          </div>

          <!-- Terminal Output -->
          <div class="terminal-output" ref="outputRef">
            <div v-if="messages.length === 0" class="terminal-welcome">
              <div class="welcome-text">Welcome to Aurora Test Generator</div>
              <div class="welcome-hint">{{ welcomeHint }}</div>
            </div>
            <div
              v-for="(msg, i) in messages"
              :key="i"
              class="terminal-line"
              :class="msg.type"
            >
              <span class="line-prefix">{{ getPrefix(msg.type) }}</span>
              <span class="line-content" v-html="formatContent(msg.content)"></span>
            </div>
            <div v-if="isProcessing" class="terminal-line processing">
              <span class="line-prefix">→</span>
              <span class="line-content">{{ processingText }}<span class="cursor">▌</span></span>
            </div>
          </div>

          <!-- Terminal Input -->
          <div class="terminal-input-container">
            <span class="input-prompt">❯</span>
            <textarea
              ref="inputRef"
              v-model="userInput"
              @keydown="handleKeydown"
              :placeholder="inputPlaceholder"
              :disabled="isProcessing"
              class="terminal-input"
              rows="3"
              spellcheck="false"
              autocomplete="off"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- ── REVIEW: Right Panel ── -->
      <div v-if="mode === 'review'" class="lg:col-span-2 space-y-4">

        <!-- No pack selected yet -->
        <div v-if="!selectedReviewPack" class="card h-full" style="min-height:400px;display:flex;align-items:center;justify-content:center;">
          <div class="text-center">
            <ClipboardCheck :size="40" class="text-muted mx-auto mb-3" />
            <p class="text-heading font-medium">Select a test pack to review</p>
            <p class="text-sm text-muted mt-1">Click a pack name on the left to get started</p>
          </div>
        </div>

        <template v-else>
          <!-- Pack summary -->
          <div class="card">
            <div class="card-body" style="padding:16px 20px;">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-heading text-base">{{ selectedReviewPack.packName }}</h3>
                  <p class="text-xs text-muted mt-0.5">{{ selectedReviewPack.total }} {{ specLabel(selectedReviewPack.engine, { plural: selectedReviewPack.total !== 1, lower: true }) }} in this pack</p>
                  <!-- Pipeline assignment badges -->
                  <div v-if="selectedReviewPack.initiativeName || selectedReviewPack.featureName" class="flex items-center gap-2 mt-2 flex-wrap">
                    <span v-if="selectedReviewPack.initiativeName" class="badge badge-primary text-xs flex items-center gap-1">
                      <Target :size="10" />{{ selectedReviewPack.initiativeName }}
                    </span>
                    <span v-if="selectedReviewPack.featureName" class="badge badge-secondary text-xs">{{ selectedReviewPack.featureName }}</span>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-3 flex-shrink-0">
                  <div class="flex items-center gap-3">
                    <div class="text-center">
                      <div class="text-xl font-bold text-success">{{ selectedReviewPack.passed }}</div>
                      <div class="text-xs text-muted">passed</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold text-danger">{{ selectedReviewPack.failed }}</div>
                      <div class="text-xs text-muted">failed</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold text-warning">{{ selectedReviewPack.draft }}</div>
                      <div class="text-xs text-muted">pending</div>
                    </div>
                    <div class="text-center">
                      <div class="text-xl font-bold text-muted">{{ selectedReviewPack.total - selectedReviewPack.passed - selectedReviewPack.failed - selectedReviewPack.draft }}</div>
                      <div class="text-xs text-muted">ready</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      @click="startPackValidation"
                      :disabled="packValidating"
                      class="btn btn-sm flex items-center gap-1.5"
                      style="background:#00CFE8;color:#1a1b26;border:none;"
                      title="Validate all specs in this pack sequentially using a live browser, then auto-apply corrected code"
                    >
                      <ScanEye :size="13" />
                      {{ packValidating ? 'Validating…' : 'Validate Pack' }}
                    </button>
                    <button
                      @click="openPromoteModal"
                      :class="['btn btn-sm flex items-center gap-1.5',
                        selectedReviewPack.passed === selectedReviewPack.total && selectedReviewPack.total > 0
                          ? 'btn-success' : 'btn-secondary']"
                      :title="selectedReviewPack.initiativeName ? 'Update pipeline assignment' : 'Assign this pack to a strategic initiative and feature'"
                    >
                      <GitMerge :size="13" />
                      {{ selectedReviewPack.initiativeName ? 'Update pipeline' : 'Assign to pipeline' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Generation progress — visible when generating at pack level (no spec selected) -->
          <div v-if="packGenerating.get(selectedReviewPack.packId) && reviewLogs.length > 0"
            style="border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#0d1117;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.35);">
              <div style="display:flex;align-items:center;gap:8px;">
                <Terminal :size="13" style="color:rgba(255,255,255,0.35);" />
                <span style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.45);">
                  aurora-generate ~ {{ selectedReviewPack.packName }}
                  ({{ packGenerating.get(selectedReviewPack.packId).done }}/{{ packGenerating.get(selectedReviewPack.packId).total }})
                </span>
              </div>
              <span style="font-size:10px;color:#60a5fa;font-family:monospace;">generating…</span>
            </div>
            <div ref="reviewConsoleEl" style="padding:14px 16px;font-family:monospace;font-size:12px;min-height:80px;max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;">
              <div v-for="(log, i) in reviewLogs" :key="i" style="display:flex;gap:10px;line-height:1.5;">
                <span style="color:rgba(255,255,255,0.18);flex-shrink:0;">{{ log.time }}</span>
                <span :style="{ color: log.type==='step' ? '#60a5fa' : log.type==='done' ? '#4ade80' : log.type==='error' ? '#f87171' : log.type==='warn' ? '#fbbf24' : 'rgba(255,255,255,0.45)' }">{{ log.message }}</span>
              </div>
              <div v-if="packGenerating.get(selectedReviewPack.packId)" style="display:flex;gap:10px;line-height:1.5;margin-top:2px;">
                <span class="review-pulse-dot" style="color:#60a5fa;flex-shrink:0;">●</span>
                <span style="color:#60a5fa;opacity:0.7;">Generating spec {{ packGenerating.get(selectedReviewPack.packId).done + 1 }} of {{ packGenerating.get(selectedReviewPack.packId).total }} — please wait…</span>
              </div>
            </div>
          </div>

          <!-- Variables & Secrets — collapsible when a pack is selected -->
          <div class="card">
            <div class="card-body" style="padding:16px 20px;">
              <div class="flex items-center justify-between" :class="varsCollapsed ? '' : 'mb-3'">
                <button
                  @click="varsCollapsed = !varsCollapsed"
                  class="flex items-center gap-2 text-sm font-semibold text-heading hover:text-primary transition-colors"
                >
                  <KeyRound :size="14" class="text-primary" />
                  Variables &amp; Secrets
                  <span class="text-xs font-normal text-muted">— {{ selectedReviewPack.packName }}</span>
                  <component :is="varsCollapsed ? ChevronRight : ChevronDown" :size="14" class="text-muted ml-1" />
                </button>
                <div v-if="!varsCollapsed" class="flex items-center gap-2">
                  <button
                    v-if="packSpecsWithCode > 0 && scanSuggestions.length === 0"
                    @click="scanPackCode()"
                    :disabled="scanLoading"
                    class="btn btn-sm btn-secondary flex items-center gap-1"
                    title="Scan spec code for hardcoded URLs, emails, and credentials"
                  >
                    <Loader2 v-if="scanLoading" :size="12" class="animate-spin" />
                    <Search v-else :size="12" />
                    Scan code
                  </button>
                  <button @click="openAddVar()" class="btn btn-sm btn-secondary flex items-center gap-1">
                    <Plus :size="12" />Add
                  </button>
                </div>
              </div>

              <!-- Collapsible body -->
              <template v-if="!varsCollapsed">

              <!-- Scan suggestions — shown when scan has found hardcoded values -->
              <div v-if="unaddedSuggestions.length > 0" class="mb-3 rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
                <div class="px-3 py-2 border-b border-warning/20 flex items-center gap-2">
                  <AlertCircle :size="13" class="text-warning flex-shrink-0" />
                  <span class="text-xs font-semibold text-warning">Hardcoded values detected in spec code</span>
                  <span class="text-xs text-muted ml-auto">Add as variables, then regenerate specs</span>
                </div>
                <table class="w-full text-sm">
                  <tbody>
                    <tr v-for="s in unaddedSuggestions" :key="s.name" class="border-t border-warning/10 first:border-t-0">
                      <td class="px-3 py-2">
                        <code class="font-mono text-primary text-xs">&#123;&#123;{{ s.name }}&#125;&#125;</code>
                      </td>
                      <td class="px-3 py-2 text-xs text-muted font-mono truncate max-w-[200px]">
                        <span v-if="s.type === 'password'" class="italic">password field detected</span>
                        <span v-else>{{ s.example }}</span>
                      </td>
                      <td class="px-3 py-2 text-right">
                        <button @click="openAddVar(s.name)" class="px-2 py-1 rounded text-xs border border-warning/40 hover:border-warning text-warning hover:bg-warning/10 transition-colors">
                          Add variable
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Variable table — always shown, even when empty -->
              <div class="overflow-hidden rounded-lg border border-default">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-default bg-surface-2">
                      <th class="text-left px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide w-8"></th>
                      <th class="text-left px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide">Variable</th>
                      <th class="text-left px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide">Value</th>
                      <th class="text-left px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide">Description</th>
                      <th class="w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="mergedVarRows.length === 0">
                      <td colspan="5" class="px-3 py-5 text-center text-muted text-xs leading-relaxed">
                        <template v-if="packSpecsTotal === 0">
                          No specs in this pack yet.
                        </template>
                        <template v-else-if="packSpecsWithCode === 0">
                          {{ specLabel(selectedReviewPack?.engine, { plural: true }) }} exist but haven't been generated yet — click the <strong>Generate</strong> button on the pack to create {{ engineName(selectedReviewPack?.engine) }} code, then add variables here and regenerate to inject them.
                        </template>
                        <template v-else>
                          No <code class="text-primary font-mono">&#123;&#123;PLACEHOLDER&#125;&#125;</code> patterns found.
                          Click <strong>Scan code</strong> to detect hardcoded values, or <strong>Add</strong> to define variables manually — then regenerate so the AI injects them as placeholders.
                        </template>
                      </td>
                    </tr>
                    <tr v-for="row in mergedVarRows" :key="row.name"
                      :class="['border-t border-default group transition-colors',
                        row.configured ? 'hover:bg-surface' : 'bg-warning/5 hover:bg-warning/10']"
                    >
                      <td class="px-3 py-2.5 text-center">
                        <component :is="row.configured ? CheckCircle : AlertCircle" :size="13"
                          :class="row.configured ? 'text-success' : 'text-warning'" />
                      </td>
                      <td class="px-3 py-2.5">
                        <code class="font-mono text-primary">&#123;&#123;{{ row.name }}&#125;&#125;</code>
                      </td>
                      <td class="px-3 py-2.5 font-mono text-muted">
                        <span v-if="!row.configured" class="text-warning italic not-italic text-xs">not set</span>
                        <span v-else class="flex items-center gap-1.5">
                          <span v-if="revealedVarIds.has(row.variable.id)" class="truncate max-w-[140px] text-xs">{{ row.variable.value || '—' }}</span>
                          <span v-else class="text-xs tracking-widest">••••••</span>
                          <button @click="toggleVarReveal(row.variable.id)" class="text-muted hover:text-heading flex-shrink-0">
                            <Eye v-if="!revealedVarIds.has(row.variable.id)" :size="11" />
                            <EyeOff v-else :size="11" />
                          </button>
                        </span>
                      </td>
                      <td class="px-3 py-2.5 text-muted text-xs">{{ row.configured ? (row.variable.description || '—') : '' }}</td>
                      <td class="px-3 py-2.5 text-right">
                        <div class="flex items-center justify-end gap-1" :class="row.configured ? 'opacity-0 group-hover:opacity-100 transition-opacity' : ''">
                          <button
                            v-if="row.configured"
                            @click="replaceVar(row.variable)"
                            :disabled="replacingVarId === row.variable.id"
                            class="px-2 py-1 rounded text-xs border border-info/40 hover:border-info hover:text-info text-muted transition-colors"
                            title="Replace hardcoded value in all spec code with {{NAME}} placeholder"
                          >{{ replacingVarId === row.variable.id ? '…' : 'Replace' }}</button>
                          <button
                            @click="row.configured ? openEditVar(row.variable) : openAddVar(row.name)"
                            class="px-2 py-1 rounded text-xs border border-default hover:border-primary hover:text-primary text-muted transition-colors"
                          >{{ row.configured ? 'Edit' : 'Set value' }}</button>
                          <button v-if="row.configured" @click="deleteVar(row.variable)"
                            class="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors">
                            <X :size="12" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              </template><!-- end collapsible body -->
            </div>
          </div>

          <!-- Spec area — only when a spec is selected -->
          <template v-if="selectedReviewSpec">
          <!-- Spec header -->
          <div class="card">
            <div class="card-body" style="padding:16px 20px;">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <component :is="reviewStatusIcon(selectedReviewSpec)" :size="15" :style="{ color: reviewStatusColor(selectedReviewSpec) }" />
                    <span class="font-semibold text-heading">{{ selectedReviewSpec.name }}</span>
                    <span :class="['text-xs px-1.5 py-0.5 rounded font-mono',
                      selectedReviewSpec.testType === 'api' ? 'bg-info/10 text-info' : 'bg-success/10 text-success']"
                      style="font-size:10px;">{{ selectedReviewSpec.testType === 'api' ? 'API' : 'E2E' }}</span>
                    <span v-if="selectedReviewSpec.healCount > 0" class="text-xs text-muted">healed ×{{ selectedReviewSpec.healCount }}</span>
                  </div>
                  <div class="text-xs text-muted truncate">{{ selectedReviewSpec.url || 'No URL set' }}</div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <template v-if="selectedReviewSpec.hasCode">
                    <button
                      @click="runReviewSpec"
                      :disabled="reviewRunning || reviewHealing || reviewGenerating"
                      class="btn btn-sm flex items-center gap-1.5"
                      style="background:#7dcfff;color:#1a1b26;border:none;"
                    >
                      <Play :size="13" />
                      {{ reviewRunning ? 'Running…' : 'Run' }}
                    </button>
                    <button
                      @click="healReviewSpec"
                      :disabled="reviewRunning || reviewHealing || reviewGenerating || selectedReviewSpec.status !== 'failed'"
                      class="btn btn-sm flex items-center gap-1.5"
                      style="background:#e0af68;color:#1a1b26;border:none;"
                    >
                      <Wrench :size="13" />
                      {{ reviewHealing ? 'Healing…' : 'Heal' }}
                    </button>
                    <button
                      @click="openValidate(selectedReviewSpec.specId)"
                      class="btn btn-sm flex items-center gap-1.5"
                      style="background:#7367F0;color:#fff;border:none;"
                      title="Drive a real browser through each step to validate selectors"
                    >
                      <ScanEye :size="13" />
                      Validate
                    </button>
                  </template>
                  <span :class="['badge',
                    selectedReviewSpec.status === 'passed' ? 'badge-success' :
                    selectedReviewSpec.status === 'failed' ? 'badge-danger' :
                    selectedReviewSpec.hasCode ? 'badge-primary' : 'badge-warning']">
                    {{ selectedReviewSpec.hasCode && selectedReviewSpec.status === 'ready' ? 'ready to run' : selectedReviewSpec.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Console terminal -->
          <div style="border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#0d1117;">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.35);">
              <div style="display:flex;align-items:center;gap:8px;">
                <Terminal :size="13" style="color:rgba(255,255,255,0.35);" />
                <span style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.45);">aurora-review ~ {{ selectedReviewSpec.name }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span v-if="reviewRunning || reviewHealing || reviewGenerating" style="font-size:10px;color:#60a5fa;font-family:monospace;">
                  {{ reviewGenerating ? 'generating…' : reviewRunning ? 'running…' : 'healing…' }}
                </span>
              </div>
            </div>
            <!-- Log output -->
            <div ref="reviewConsoleEl" :style="{padding:'14px 16px',fontFamily:'monospace',fontSize:'12px',minHeight:(reviewRunning||reviewHealing||reviewGenerating)?'200px':'140px',maxHeight:'320px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'5px',transition:'min-height 0.3s ease'}">
              <div v-if="reviewLogs.length === 0" style="color:rgba(255,255,255,0.2);font-size:11px;">Ready — click Run or Heal to start</div>
              <div v-for="(log, i) in reviewLogs" :key="i" style="display:flex;gap:10px;line-height:1.5;">
                <span style="color:rgba(255,255,255,0.18);flex-shrink:0;font-variant-numeric:tabular-nums;">{{ log.time }}</span>
                <span :style="{
                  color: log.type==='step' ? '#60a5fa' : log.type==='done' ? '#4ade80' : log.type==='error' ? '#f87171' : log.type==='warn' ? '#fbbf24' : log.type==='info' ? '#94a3b8' : 'rgba(255,255,255,0.45)'
                }">{{ log.message }}</span>
              </div>
              <!-- Pulsing activity row while waiting for result -->
              <div v-if="reviewRunning || reviewHealing || reviewGenerating" style="display:flex;gap:10px;line-height:1.5;margin-top:2px;">
                <span class="review-pulse-dot" style="color:#60a5fa;flex-shrink:0;">●</span>
                <span style="color:#60a5fa;opacity:0.7;">
                  {{ reviewGenerating ? 'Generating code — this may take 30–60 seconds…' : reviewHealing ? 'Analysing failure and rewriting test — please wait…' : 'Executing test — please wait…' }}
                </span>
              </div>
              <!-- Run result summary -->
              <div v-if="reviewResult" style="margin-top:10px;border-radius:6px;padding:10px 12px;" :style="{
                border: reviewResult.status==='passed' ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(248,113,113,0.25)',
                background: reviewResult.status==='passed' ? 'rgba(74,222,128,0.05)' : 'rgba(248,113,113,0.05)'
              }">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:13px;font-weight:600;font-family:sans-serif;" :style="{ color: reviewResult.status==='passed' ? '#4ade80' : '#f87171' }">
                    {{ reviewResult.status === 'passed' ? '✓ PASSED' : '✗ FAILED' }}
                  </span>
                  <span style="color:rgba(255,255,255,0.25);font-size:11px;">{{ reviewResult.duration }}ms</span>
                </div>
                <p v-if="reviewResult.error" style="color:#fca5a5;font-size:11px;white-space:pre-wrap;word-break:break-all;margin:4px 0 0;font-family:sans-serif;">{{ reviewResult.error }}</p>
                <div v-if="reviewResult.steps?.length" style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">
                  <div v-for="(s, si) in reviewResult.steps" :key="si" style="display:flex;gap:8px;font-size:11px;">
                    <span :style="{ color: s.success ? '#4ade80' : '#f87171' }">{{ s.success ? '✓' : '✗' }}</span>
                    <span :style="{ color: s.success ? 'rgba(255,255,255,0.5)' : '#fca5a5' }">{{ s.action }}</span>
                    <span v-if="s.error" style="color:#f87171;"> — {{ s.error }}</span>
                  </div>
                </div>
                <EvidenceLinks v-if="reviewResult.evidenceDir" :evidence-dir="reviewResult.evidenceDir" dense />
              </div>
            </div>
          </div>

          <!-- Playwright Code editor -->
          <div v-if="selectedReviewSpec.hasCode"
            style="border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#0d1117;">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.35);">
              <div style="display:flex;align-items:center;gap:8px;">
                <Code :size="13" style="color:rgba(255,255,255,0.35);" />
                <span style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.45);">{{ selectedReviewSpec.name }}.spec.js</span>
                <span v-if="reviewCodeDirty" style="font-size:10px;color:#fbbf24;font-family:monospace;">● unsaved</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <!-- Toggle between highlighted view and editable textarea -->
                <button
                  v-if="codeViewMode && failingLineNums.length > 0"
                  @click="codeViewMode = false"
                  style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(255,159,67,0.4);background:rgba(255,159,67,0.1);color:#fbbf24;cursor:pointer;display:flex;align-items:center;gap:5px;"
                  title="Switch to edit mode"
                >
                  <Pencil :size="11" />
                  Edit
                </button>
                <button
                  v-if="!codeViewMode && failingLineNums.length > 0"
                  @click="codeViewMode = true"
                  style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.1);color:#f87171;cursor:pointer;display:flex;align-items:center;gap:5px;"
                  title="Show error highlights"
                >
                  <Eye :size="11" />
                  Errors
                </button>
                <button
                  v-if="reviewCodeDirty"
                  @click="saveReviewCode"
                  :disabled="reviewCodeSaving"
                  style="font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid rgba(99,102,241,0.5);background:rgba(99,102,241,0.15);color:#818cf8;cursor:pointer;font-family:monospace;display:flex;align-items:center;gap:5px;"
                >
                  <Loader2 v-if="reviewCodeSaving" :size="11" style="animation:spin 1s linear infinite;" />
                  <Save v-else :size="11" />
                  {{ reviewCodeSaving ? 'Saving…' : 'Save' }}
                </button>
                <button
                  @click="copyReviewCode"
                  style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:rgba(255,255,255,0.3);cursor:pointer;display:flex;align-items:center;gap:5px;"
                  title="Copy to clipboard"
                >
                  <ClipboardCopy :size="11" />
                </button>
              </div>
            </div>
            <!-- Line-highlighted view (shown after a failed run with known error lines) -->
            <div
              v-if="codeViewMode && failingLineNums.length > 0"
              style="overflow:auto;max-height:520px;min-height:280px;padding:10px 0;"
            >
              <div
                v-for="(line, i) in reviewCodeEdit.split('\n')"
                :key="i"
                :style="{
                  display:'flex',
                  background: failingLineNums.includes(i+1) ? 'rgba(239,68,68,0.15)' : 'transparent',
                  borderLeft: failingLineNums.includes(i+1) ? '2px solid #ef4444' : '2px solid transparent',
                  minHeight: '1.6em'
                }"
              >
                <span :style="{
                  width:'44px', flexShrink:0, textAlign:'right', paddingRight:'14px', paddingLeft:'8px',
                  color: failingLineNums.includes(i+1) ? '#f87171' : 'rgba(255,255,255,0.2)',
                  fontFamily:'JetBrains Mono,Menlo,Monaco,Consolas,monospace', fontSize:'12px',
                  lineHeight:'1.6', userSelect:'none'
                }">{{ i + 1 }}</span>
                <span :style="{
                  flex:1, whiteSpace:'pre', paddingRight:'16px',
                  fontFamily:'JetBrains Mono,Menlo,Monaco,Consolas,monospace', fontSize:'12px',
                  lineHeight:'1.6',
                  color: failingLineNums.includes(i+1) ? '#fca5a5' : 'rgba(255,255,255,0.82)'
                }">{{ line }}</span>
              </div>
            </div>
            <!-- Editable code textarea (default when no error highlights active) -->
            <textarea
              v-else
              v-model="reviewCodeEdit"
              @input="reviewCodeDirty = true"
              spellcheck="false"
              autocomplete="off"
              autocorrect="off"
              style="width:100%;min-height:280px;max-height:520px;resize:vertical;background:transparent;border:none;outline:none;padding:14px 16px;font-family:'JetBrains Mono',Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.82);tab-size:2;box-sizing:border-box;"
            ></textarea>
          </div>

          <!-- Action bar — Generate only shown when no code yet -->
          <div v-if="!selectedReviewSpec.hasCode" class="flex items-center gap-3">
            <button
              @click="generateReviewSpecCode"
              :disabled="reviewGenerating || reviewRunning || reviewHealing"
              class="btn btn-primary flex items-center gap-2"
            >
              <Bot :size="14" />
              {{ reviewGenerating ? 'Generating…' : 'Generate Code' }}
            </button>
            <span v-if="!reviewGenerating" class="text-xs text-muted">
              No Playwright code yet — generate it from the markdown spec
            </span>
          </div>
          </template><!-- end selectedReviewSpec -->
        </template><!-- end selectedReviewPack -->
      </div>
    </div>

    <!-- Assign to Pipeline Modal -->
    <Teleport to="body">
      <div v-if="showPromoteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showPromoteModal = false">
        <div class="bg-surface border border-default rounded-xl shadow-xl w-full max-w-md p-6">
          <div class="flex items-center justify-between mb-5">
            <div>
              <h3 class="text-base font-semibold text-heading flex items-center gap-2">
                <GitMerge :size="16" class="text-primary" />
                Assign to Pipeline
              </h3>
              <p class="text-xs text-muted mt-0.5">Link this pack to a strategic initiative and feature</p>
            </div>
            <button @click="showPromoteModal = false" class="text-muted hover:text-heading p-1 rounded"><X :size="16" /></button>
          </div>

          <div v-if="promoteInitiatives.length === 0" class="rounded-lg bg-warning/5 border border-warning/30 px-4 py-3 text-xs text-warning">
            No strategic initiatives found. Create them in <strong>Settings → Initiatives</strong> first.
          </div>
          <div class="space-y-4">
            <div>
              <label class="form-label">Strategic Initiative</label>
              <select v-model="promoteInitiativeId" @change="onPromoteInitiativeChange" class="form-select" :disabled="promoteInitiatives.length === 0">
                <option value="">— None —</option>
                <option v-for="i in promoteInitiatives" :key="i.id" :value="i.id">{{ i.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Feature</label>
              <select v-model="promoteFeatureId" class="form-select" :disabled="!promoteInitiativeId || promoteFeatures.length === 0">
                <option value="">— None —</option>
                <option v-for="f in promoteFeatures" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
              <p v-if="promoteInitiativeId && promoteFeatures.length === 0" class="text-xs text-muted mt-1">No features under this initiative yet.</p>
            </div>
          </div>

          <div v-if="promoteError" class="mt-3 text-xs text-danger">{{ promoteError }}</div>

          <div class="flex justify-end gap-3 mt-6">
            <button @click="showPromoteModal = false" class="btn btn-secondary">Cancel</button>
            <button @click="savePromotion" :disabled="promoteSaving" class="btn btn-primary flex items-center gap-2">
              <Loader2 v-if="promoteSaving" :size="14" class="animate-spin" />
              <GitMerge v-else :size="14" />
              {{ promoteSaving ? 'Saving…' : 'Save assignment' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Create Test Pack Modal -->
    <Teleport to="body">
      <div v-if="showCreatePack" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showCreatePack = false">
        <div class="bg-surface border border-default rounded-xl shadow-xl w-full max-w-md p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-semibold text-heading flex items-center gap-2">
              <Plus :size="16" class="text-primary" />
              Create Test Pack
            </h3>
            <button @click="showCreatePack = false" class="text-muted hover:text-heading p-1 rounded"><X :size="16" /></button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="form-label">Pack Name</label>
              <input v-model="newPack.name" type="text" placeholder="e.g., Smoke Tests, Login Suite" class="form-input" />
            </div>
            <div>
              <label class="form-label">Description <span class="text-muted text-xs">(optional)</span></label>
              <textarea v-model="newPack.description" rows="2" placeholder="Describe the purpose of this test pack..." class="form-input"></textarea>
            </div>
            <div>
              <label class="form-label">Feature <span class="text-muted text-xs">(optional)</span></label>
              <select v-model="newPack.featureId" class="form-select">
                <option value="">— No feature —</option>
                <option v-for="f in packFeatures" :key="f.id" :value="f.id">{{ f.name }}<template v-if="f.initiativeName"> ({{ f.initiativeName }})</template></option>
              </select>
              <p v-if="packFeatures.length === 0" class="text-xs text-muted mt-1">No features yet — create them under Settings → Initiatives first, or leave unassigned.</p>
            </div>
          </div>

          <div v-if="createPackError" class="mt-3 text-xs text-danger">{{ createPackError }}</div>

          <div class="flex justify-end gap-3 mt-6">
            <button @click="showCreatePack = false" class="btn btn-secondary">Cancel</button>
            <button @click="createReviewPack" :disabled="!newPack.name.trim() || creatingPack" class="btn btn-primary flex items-center gap-2">
              <Loader2 v-if="creatingPack" :size="14" class="animate-spin" />
              <Plus v-else :size="14" />
              {{ creatingPack ? 'Creating…' : 'Create Pack' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add/Edit Variable Modal -->
    <Teleport to="body">
      <div v-if="showVarModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showVarModal = false">
        <div class="bg-surface border border-default rounded-xl shadow-xl w-full max-w-md p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-heading flex items-center gap-2">
              <KeyRound :size="16" class="text-primary" />
              {{ editingVar ? 'Edit Variable' : 'Add Variable' }}
            </h3>
            <button @click="showVarModal = false" class="text-muted hover:text-heading"><X :size="18" /></button>
          </div>
          <div class="space-y-3">
            <div>
              <label class="form-label text-xs">Name <span class="text-muted">(used as &#123;&#123;NAME&#125;&#125; in specs)</span></label>
              <input v-model="varForm.name" type="text" class="form-input font-mono uppercase"
                placeholder="e.g. HOST or ADMIN_EMAIL"
                @input="varForm.name = varForm.name.toUpperCase().replace(/[^A-Z0-9_]/g, '')" />
            </div>
            <div>
              <label class="form-label text-xs">Value</label>
              <div class="relative">
                <input v-model="varForm.value" :type="showVarValue ? 'text' : 'password'"
                  class="form-input pr-10" placeholder="Value" />
                <button @click="showVarValue = !showVarValue" class="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-heading">
                  <Eye v-if="!showVarValue" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
              </div>
            </div>
            <div>
              <label class="form-label text-xs">Description <span class="text-muted">(optional)</span></label>
              <input v-model="varForm.description" type="text" class="form-input" placeholder="e.g. Admin login email for staging" />
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="varForm.sensitive" class="rounded" />
              <span class="text-sm text-body">Sensitive — encrypt stored value</span>
            </label>
            <p v-if="varFormError" class="text-xs text-danger">{{ varFormError }}</p>
          </div>
          <div class="flex justify-end gap-2 mt-5">
            <button @click="showVarModal = false" class="btn btn-secondary">Cancel</button>
            <button @click="saveVar()" :disabled="savingVar" class="btn btn-primary flex items-center gap-1">
              <Loader2 v-if="savingVar" :size="13" class="animate-spin" />
              {{ editingVar ? 'Save' : 'Add' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Pack Validation Progress Modal -->
    <div v-if="showPackValidationModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div class="card" style="width:640px;max-height:80vh;display:flex;flex-direction:column;">
        <div class="card-body" style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ScanEye :size="18" style="color:#00CFE8;" />
              <h3 class="font-semibold text-heading text-base">Validate Pack — {{ selectedReviewPack?.packName }}</h3>
            </div>
            <button v-if="!packValidating" @click="showPackValidationModal = false" class="text-muted hover:text-heading p-1 rounded"><X :size="16" /></button>
          </div>
          <!-- Overall progress bar -->
          <div class="mt-3" v-if="packValTotal > 0">
            <div class="flex justify-between text-xs text-muted mb-1">
              <span>{{ packValDone }} of {{ packValTotal }} specs</span>
              <span>{{ packValPassed }} passed · {{ packValFailed }} with issues</span>
            </div>
            <div class="w-full rounded-full overflow-hidden" style="height:6px;background:rgba(255,255,255,0.1);">
              <div class="h-full rounded-full transition-all" style="background:#00CFE8;"
                :style="{ width: `${Math.round(packValDone / packValTotal * 100)}%` }"></div>
            </div>
          </div>
        </div>
        <div class="overflow-y-auto flex-1" style="padding:12px 24px;">
          <div v-for="(s, i) in packValSpecs" :key="i" class="py-2 border-b border-white/5 last:border-0">
            <div class="flex items-center gap-2">
              <!-- status icon -->
              <span v-if="s.status === 'done'" style="color:#28C76F;">✓</span>
              <span v-else-if="s.status === 'partial'" style="color:#FF9F43;">⚠</span>
              <span v-else-if="s.status === 'error'" style="color:#EA5455;">✗</span>
              <span v-else-if="s.status === 'skipped'" class="text-muted">—</span>
              <span v-else-if="s.status === 'running'" style="color:#00CFE8;" class="animate-pulse">▶</span>
              <span v-else class="text-muted opacity-30">○</span>
              <span class="text-sm" :class="s.status === 'running' ? 'text-heading font-medium' : 'text-muted'">{{ s.name }}</span>
              <span v-if="s.summary" class="ml-auto text-xs text-muted">
                {{ s.summary.pass }} pass · {{ s.summary.fail }} fail · {{ s.summary.skip }} skip
              </span>
              <span v-if="s.reason" class="ml-auto text-xs text-warning">{{ s.reason }}</span>
            </div>
            <!-- Current spec step log -->
            <div v-if="s.status === 'running' && s.steps.length" class="ml-6 mt-1 space-y-0.5">
              <div v-for="(st, j) in s.steps.slice(-4)" :key="j" class="text-xs text-muted flex items-center gap-1.5">
                <span v-if="st.status === 'pass'" style="color:#28C76F;">✓</span>
                <span v-else-if="st.status === 'skip'" style="color:#FF9F43;">↷</span>
                <span v-else-if="st.status === 'fail'" style="color:#EA5455;">✗</span>
                <span v-else class="opacity-40">·</span>
                <span class="truncate">{{ st.intent }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="card-body flex-shrink-0" style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.08);">
          <div v-if="packValidating" class="text-xs text-muted">
            <span v-if="packValDone === 0" style="color:#00CFE8;" class="animate-pulse">● </span>
            {{ packValDone === 0 ? 'Connecting to browser…' : 'Running in headed browser — validated code is auto-applied as each spec completes' }}
          </div>
          <div v-else class="flex items-center justify-between">
            <span class="text-sm text-success" v-if="packValFailed === 0 && packValDone === packValTotal">All specs validated and applied</span>
            <span class="text-sm text-warning" v-else-if="packValDone === packValTotal">{{ packValFailed }} spec{{ packValFailed !== 1 ? 's' : '' }} had steps that couldn't be resolved — validate those individually</span>
            <div class="flex items-center gap-2 ml-auto">
              <button @click="showPackValidationModal = false; reloadReviewSpecs(); runPackAll(selectedReviewPack)"
                class="btn btn-sm btn-success flex items-center gap-1.5">
                <Play :size="12" />Run Pack
              </button>
              <button @click="showPackValidationModal = false; reloadReviewSpecs()" class="btn btn-sm btn-secondary">Done</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Spec Modal -->
    <div v-if="editSpecVisible" class="spec-modal-overlay" @click.self="closeEditSpec">
      <div class="spec-modal">
        <div class="spec-modal-header">
          <h3 class="spec-modal-title">
            <Pencil :size="18" />
            Edit Test Spec
          </h3>
          <button @click="closeEditSpec" class="spec-modal-close">
            <X :size="20" />
          </button>
        </div>
        <div class="spec-modal-body">
          <p class="spec-help-text">
            Edit the test steps below. Each line starting with <code>-</code> is a test step.
            Use natural language to describe actions like navigate, click, fill, verify, etc.
          </p>
          <div class="spec-examples">
            <span class="spec-example-label">Examples:</span>
            <code>- Navigate to {URL}/login</code>
            <code>- Fill "username" in the email field</code>
            <code>- Click "Submit" button</code>
            <code>- Verify "Welcome" text is visible</code>
            <code>- Expect status code 200</code>
          </div>
          <textarea
            v-model="editableSpec"
            class="spec-editor"
            rows="15"
            spellcheck="false"
            placeholder="# Test Steps

- Navigate to the target URL
- Perform actions...
- Verify expected results..."
          ></textarea>
        </div>
        <div class="spec-modal-footer">
          <button @click="closeEditSpec" class="btn btn-secondary">
            Cancel
          </button>
          <button @click="applySpecChanges" class="btn btn-primary">
            <Check :size="16" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>

    <!-- Generated TypeScript Files Panel -->
    <div v-if="store.generatedFiles" class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h3 class="card-title flex items-center gap-2">
            <Code :size="18" class="text-primary" />
            Generated TypeScript Files
          </h3>
          <div class="flex gap-2">
            <button @click="downloadFile('spec')" class="btn btn-sm btn-secondary">
              <Download :size="14" />
              .spec.ts
            </button>
            <button @click="downloadFile('fixture')" class="btn btn-sm btn-secondary">
              <Download :size="14" />
              Fixture
            </button>
            <button @click="downloadFile('pom')" class="btn btn-sm btn-secondary">
              <Download :size="14" />
              POM
            </button>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="file-tabs">
          <button
            v-for="tab in ['spec', 'fixture', 'pom']"
            :key="tab"
            @click="activeFileTab = tab"
            :class="['file-tab', { active: activeFileTab === tab }]"
          >
            {{ tabLabel(tab) }}
          </button>
        </div>
        <pre class="file-content"><code>{{ store.generatedFiles[activeFileTab] || '// File not generated' }}</code></pre>
      </div>
    </div>

    <!-- Test Results Panel -->
    <div v-if="lastRunResult" class="card">
      <div class="card-header">
        <div class="flex items-center justify-between w-full">
          <h3 class="card-title flex items-center gap-2">
            <ClipboardList :size="18" class="text-primary" />
            Test Results
          </h3>
          <span :class="['badge', lastRunResult.status === 'passed' ? 'badge-success' : 'badge-danger']">
            {{ lastRunResult.status }}
          </span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Results Summary -->
          <div class="space-y-4">
            <div class="p-4 rounded-lg bg-surface">
              <div class="text-sm text-muted mb-1">Test Name</div>
              <div class="font-medium text-heading">{{ lastRunResult.specName }}</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="p-3 rounded-lg bg-surface text-center">
                <div class="text-2xl font-bold" :class="lastRunResult.status === 'passed' ? 'text-success' : 'text-danger'">
                  {{ lastRunResult.duration ? Math.round(lastRunResult.duration / 1000 * 10) / 10 + 's' : '-' }}
                </div>
                <div class="text-xs text-muted">Duration</div>
              </div>
              <div class="p-3 rounded-lg bg-surface text-center">
                <div class="text-2xl font-bold text-heading">
                  {{ lastRunResult.steps?.length || 0 }}
                </div>
                <div class="text-xs text-muted">Steps</div>
              </div>
            </div>
            <div v-if="lastRunResult.healedSteps > 0" class="p-3 rounded-lg bg-warning-soft">
              <div class="flex items-center gap-2 text-warning">
                <Wrench :size="16" />
                <span class="text-sm font-medium">{{ lastRunResult.healedSteps }} step(s) auto-healed</span>
              </div>
            </div>
          </div>

          <!-- Step Details -->
          <div class="lg:col-span-2">
            <div class="text-sm font-medium text-heading mb-3">Step Results</div>
            <div class="space-y-2 max-h-48 overflow-y-auto">
              <div
                v-for="(step, index) in lastRunResult.steps"
                :key="index"
                class="flex items-start gap-3 p-3 rounded-lg"
                :class="step.success ? 'bg-success-soft' : step.skipped ? 'bg-surface' : 'bg-danger-soft'"
              >
                <div class="flex-shrink-0 mt-0.5">
                  <CheckCircle v-if="step.success" :size="16" class="text-success" />
                  <XCircle v-else-if="!step.skipped" :size="16" class="text-danger" />
                  <MinusCircle v-else :size="16" class="text-muted" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-heading truncate">{{ step.step }}</div>
                  <div v-if="step.error" class="text-xs text-danger mt-1">{{ step.error }}</div>
                  <div v-if="step.duration" class="text-xs text-muted mt-1">{{ step.duration }}ms</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Next Steps -->
        <div class="mt-6 pt-4 border-t border-default">
          <div class="text-sm font-medium text-heading mb-3">Next Steps</div>
          <div class="flex flex-wrap gap-3">
            <router-link
              v-if="currentStatus === 'passed' || currentStatus === 'saved'"
              to="/tests/packs?from=generator"
              class="btn btn-primary btn-sm"
            >
              <Package :size="16" />
              Add to Test Pack
            </router-link>
            <button
              v-if="lastRunResult.status === 'passed' && testConfig.type === 'functional'"
              @click="quickPromoteToSynthetic"
              class="btn btn-warning btn-sm"
            >
              <Activity :size="16" />
              Promote to Synthetic
            </button>
            <router-link to="/tests/functional" class="btn btn-secondary btn-sm">
              <Eye :size="16" />
              View in Functional Tests
            </router-link>
            <button @click="resetTest" class="btn btn-secondary btn-sm">
              <Plus :size="16" />
              Create Another Test
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- MCP Validation Modal -->
  <McpValidationView
    v-if="showValidateModal && validateSpecId"
    :spec-id="validateSpecId"
    @close="showValidateModal = false"
    @spec-applied="onSpecApplied"
  />

</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Settings, FileText, Code, Play, Wrench, Save,
  Bot, TestTube2, Globe, Activity, Pencil, X, Check,
  ClipboardList, CheckCircle, XCircle, MinusCircle, Package, Eye, Plus,
  Search, Scan, Download, Terminal, ChevronDown, ChevronRight,
  Hammer, RefreshCw, ClipboardCheck, AlertCircle, Clock, Settings2, KeyRound,
  EyeOff, Loader2, ClipboardCopy, GitMerge, Target, ScanEye, Ban
} from 'lucide-vue-next'
import { useTerminalStore } from '@/stores/terminalStore'
import api, { getApiBaseUrl } from '@/lib/api'
import { specLabel, engineName } from '@/lib/engineTerms'
import HelpTooltip from '@/components/HelpTooltip.vue'
import EvidenceLinks from '@/components/EvidenceLinks.vue'
import McpValidationView from '@/views/McpValidationView.vue'

const store = useTerminalStore()

// ── MCP Validation modal ────────────────────────────────────────
const showValidateModal = ref(false)
const validateSpecId    = ref(null)

function openValidate(specId) {
  validateSpecId.value = specId
  showValidateModal.value = true
}

async function onSpecApplied({ specId }) {
  // Re-fetch the spec so the review panel and code editor show the updated code/status
  if (selectedReviewSpec.value?.specId === specId) {
    try {
      const { data } = await api.get(`/api/agent-tests/specs/${specId}`)
      selectedReviewSpec.value = { ...selectedReviewSpec.value, ...data, hasCode: !!(data.generatedCode || data.codeStorage === 'file') }
      // The watch on specId won't fire (same spec), so manually push new code to editor
      reviewCodeEdit.value = data.generatedCode || ''
      reviewCodeDirty.value = false
    } catch {}
  }
  // Refresh the pack list so the spec's status badge updates
  fetchReviewQueue()
  showValidateModal.value = false
}

const outputRef = ref(null)
const inputRef = ref(null)
const userInput = ref('')
const STATIC_TEMPLATES = [
  { id: 'func-login', type: 'functional', name: 'Simple Login', description: 'Basic login flow', markdownSpec: `## Login Test\n\n- Navigate to {URL}/login\n- Fill "test@example.com" in the email field\n- Fill "password123" in the password field\n- Click the "Sign In" button\n- Verify "Dashboard" is visible` },
  { id: 'func-login-logout', type: 'functional', name: 'Login & Logout Journey', description: 'Complete login to logout user flow', markdownSpec: `## Login and Logout Journey\n\n### Login\n- Navigate to {URL}/login\n- Fill "test@example.com" in the email field\n- Fill "password123" in the password field\n- Click the "Sign In" button\n- Verify "Dashboard" is visible\n\n### Browse Site\n- Click the "Profile" link\n- Verify profile page loads\n- Click the "Settings" link\n- Verify settings page loads\n\n### Logout\n- Click the "Logout" button\n- Verify "Sign In" is visible` },
  { id: 'func-browse', type: 'functional', name: 'General Browse', description: 'Navigate and verify key pages load correctly', markdownSpec: `## General Browse Test\n\n### Home Page\n- Navigate to {URL}\n- Verify page title is visible\n- Verify the nav element is visible\n\n### Key Pages\n- Click the first navigation link\n- Verify page loads without errors\n- Go back to home\n\n- Click the second navigation link\n- Verify page loads without errors\n- Go back to home\n\n### Basic Content Check\n- Verify no error messages are visible\n- Verify the footer element is visible` },
  { id: 'func-e2e-flow', type: 'functional', name: 'End-to-End Flow', description: 'Full user workflow from start to completion', markdownSpec: `## End-to-End User Flow\n\n### Authentication\n- Navigate to {URL}/login\n- Fill "test@example.com" in the email field\n- Fill "password123" in the password field\n- Click the "Sign In" button\n- Verify "Dashboard" is visible\n\n### Core Workflow\n- Navigate to the main feature page\n- Create or initiate a new item\n- Fill in required fields with test data\n- Submit or save the form\n- Verify success message or confirmation is visible\n\n### Verification\n- Verify the new item appears in the list\n- Open the item to confirm details are correct\n\n### Cleanup\n- Delete or archive the test item\n- Verify item is no longer visible\n- Click the "Logout" button\n- Verify "Sign In" is visible` },
  { id: 'func-targeted-journey', type: 'functional', name: 'Targeted Journey', description: 'Focused test of a specific user journey — use Probe first for best results', markdownSpec: `## Targeted Journey Test\n\nURL: {URL}\n\nTest the page at {URL} based on what is actually visible there.\n\n- Navigate to {URL} and verify it loads successfully\n- Verify the main heading (h1) is visible\n- Verify the navigation is present\n- Test the primary call-to-action button or link that is most prominent on the page\n- Verify at least one internal navigation link works (click it, verify URL changes, go back)\n- Verify the footer is present\n- Verify no error messages are shown` },
  { id: 'api-health', type: 'api', name: 'Health Check', description: 'Simple API health check', markdownSpec: `## API Health Check\n\n- Send GET request to {URL}\n- Expect status code 200` },
  { id: 'api-post', type: 'api', name: 'POST Create', description: 'Test a POST endpoint', markdownSpec: `## POST Create Test\n\n- Send POST request to {URL}\n- Expect status code 201\n- Verify response contains "id"` }
]

const templates = ref(STATIC_TEMPLATES)
const selectedTemplate = ref('')
const savingTest = ref(false)
const editSpecVisible = ref(false)
const editableSpec = ref('')
const lastRunResult = ref(null)

// API Discovery state
const isScanning = ref(false)
const discoveredEndpoints = ref([])
const selectedEndpoint = ref('')
const scanError = ref('')
const swaggerSpecUrl = ref('')

// Test types configuration (2 types - synthetics are promoted functional tests)
const testTypes = [
  { id: 'functional', label: 'Functional', icon: TestTube2 },
  { id: 'api', label: 'API', icon: Globe }
]

const testConfig = ref({
  type: 'functional',
  name: '',
  url: '',
  method: 'GET',
  headers: ''
})

// Track the current test state
const currentSpecId = ref(null)
const currentStatus = ref('draft')
const generatedCode = ref(null)
const markdownSpec = ref('')
const activeFileTab = ref('spec')
const healAttempts = ref(0)

// Computed from store
const messages = computed(() => store.messages)
const isProcessing = computed(() => store.isProcessing)
const processingText = computed(() => store.processingText)

// Connection status
const connectionStatus = computed(() => store.isConnected ? 'connected' : 'disconnected')
const connectionClass = computed(() => store.isConnected ? 'connected' : 'disconnected')

// Dynamic labels based on test type
const urlLabel = computed(() => {
  if (testConfig.value.type === 'api') return 'API Endpoint'
  return 'Target URL'
})

const urlPlaceholder = computed(() => {
  if (testConfig.value.type === 'api') return 'https://api.example.com/users'
  return 'https://example.com'
})

const namePlaceholder = computed(() => {
  const placeholders = {
    functional: 'e.g., Login and Browse Flow',
    api: 'e.g., Get Users Endpoint'
  }
  return placeholders[testConfig.value.type] || 'e.g., My Test'
})

const welcomeHint = computed(() => {
  const hints = {
    functional: 'Describe the user journey you want to test (login, browse, checkout, etc.)',
    api: 'Specify the endpoint and expected response to test.'
  }
  return hints[testConfig.value.type] || 'Describe what you want to test.'
})

// Filter templates by test type
const filteredTemplates = computed(() => {
  return templates.value.filter(t => t.type === testConfig.value.type || !t.type)
})

// Filter discovered endpoints by source
const swaggerEndpoints = computed(() => {
  return discoveredEndpoints.value.filter(ep => ep.source === 'swagger')
})

const probedEndpoints = computed(() => {
  return discoveredEndpoints.value.filter(ep => ep.source !== 'swagger')
})

// State tracking
const hasActiveTest = computed(() => store.hasPlan || currentSpecId.value)
const canProbe = computed(() =>
  !isProcessing.value &&
  !!testConfig.value.url &&
  testConfig.value.type === 'functional'
)
const canPlan = computed(() => {
  return !isProcessing.value &&
         userInput.value.trim().length > 0 &&
         testConfig.value.name &&
         testConfig.value.url
})
const canEditSpec = computed(() => !isProcessing.value && store.hasPlan && markdownSpec.value)
const canGenerate = computed(() => !isProcessing.value && store.hasPlan && currentStatus.value === 'draft')
const canRun = computed(() => !isProcessing.value && store.hasTests)
const canHeal = computed(() => !isProcessing.value && store.hasFailures && healAttempts.value < 2)
const canSave = computed(() => {
  if (currentStatus.value === 'saved') return false
  if (testConfig.value.type === 'functional') {
    return !!store.currentSpecId
  }
  return store.hasTests && !!generatedCode.value
})

const inputPlaceholder = computed(() => {
  if (isProcessing.value) return 'Processing...'
  if (!testConfig.value.name || !testConfig.value.url) return 'Configure test name and URL first...'
  if (!store.hasPlan) {
    const placeholders = {
      functional: 'Describe the user flow to test...\n\nExample: Login with test@example.com, navigate to profile, update name, logout and verify logged out',
      api: 'Describe the API test...\n\nExample: Send GET request, verify status 200, check response is JSON array'
    }
    return placeholders[testConfig.value.type] || 'Describe what you want to test...'
  }
  return 'Add more details or modify the test...'
})

// ── Review mode ──────────────────────────────────────────────────────────────
const mode = ref('build') // 'build' | 'review'
const reviewQueue = ref([])
const reviewLoading = ref(false)
const reviewQueueError = ref('')
const expandedPacks = ref(new Set())
const selectedReviewSpec = ref(null)
const selectedReviewPack = ref(null)
const reviewLogs = ref([])
const reviewResult = ref(null)
const reviewRunning = ref(false)
const reviewHealing = ref(false)
const reviewGenerating = ref(false)
const reviewConsoleEl = ref(null)
const packGenerating = ref(new Map()) // packId → { done, total }
const packRunning = ref(new Set())     // packIds currently running
const packVariables        = ref([])
const varsCollapsed        = ref(false)
const packPlaceholderNames = ref([])   // {{NAME}} patterns found in pack's spec code
const packSpecsTotal       = ref(0)
const packSpecsWithCode    = ref(0)
const scanSuggestions      = ref([])   // detected hardcoded values from code scan
const scanLoading          = ref(false)
const reviewCodeEdit       = ref('')   // editable copy of selected spec's generated code
const reviewCodeDirty      = ref(false)
const reviewCodeSaving     = ref(false)
const codeViewMode         = ref(false) // true = line-highlighted view after failed run
const failingLineNums      = ref([])    // array of 1-based line numbers that failed

function refreshFailingLines() {
  if (!reviewResult.value || reviewResult.value.status !== 'failed') {
    failingLineNums.value = []
    return
  }
  const nums = []
  for (const step of reviewResult.value.steps || []) {
    if (!step.success && step.errorLine && !nums.includes(step.errorLine)) {
      nums.push(step.errorLine)
    }
  }
  failingLineNums.value = nums
}
const revealedVarIds       = ref(new Set())
const showCreatePack       = ref(false)
const creatingPack         = ref(false)
const createPackError      = ref('')
const newPack              = ref({ name: '', description: '', featureId: '' })
const packFeatures         = ref([])
const showPromoteModal          = ref(false)
const showPackValidationModal   = ref(false)
const packValidating            = ref(false)
const packValTotal              = ref(0)
const packValDone               = ref(0)
const packValPassed             = ref(0)
const packValFailed             = ref(0)
const packValSpecs              = ref([])
const promoteInitiatives   = ref([])
const promoteFeatures      = ref([])
const promoteInitiativeId  = ref('')
const promoteFeatureId     = ref('')
const promoteSaving        = ref(false)
const promoteError         = ref('')

const packVarNames = computed(() => packVariables.value.map(v => v.name))

// Merged view: all placeholder names (from specs) + any extra configured vars
const mergedVarRows = computed(() => {
  const configuredMap = Object.fromEntries(packVariables.value.map(v => [v.name, v]))
  const allNames = [...new Set([...packPlaceholderNames.value, ...packVarNames.value])]
  return allNames.map(name => ({
    name,
    configured: !!configuredMap[name],
    variable: configuredMap[name] || null
  }))
})

// Scan suggestions that haven't been added yet — stays visible while working through the list
const unaddedSuggestions = computed(() =>
  scanSuggestions.value.filter(s => !packVarNames.value.includes(s.name))
)

// Add/Edit variable modal state
const showVarModal  = ref(false)
const editingVar    = ref(null)
const showVarValue  = ref(false)
const savingVar     = ref(false)
const varFormError  = ref('')
const varForm       = ref({ name: '', value: '', description: '', sensitive: false })

// Detect {{NAME}} placeholders in the selected spec's code (for per-spec status)
const specPlaceholders = computed(() => {
  const code = selectedReviewSpec.value?.generatedCode || ''
  if (!code) return []
  const names = [...new Set([...code.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map(m => m[1]))]
  return names.map(name => ({ name, configured: packVarNames.value.includes(name) }))
})

async function fetchPackVarNames(packId) {
  if (!packId) {
    packVariables.value = []; packPlaceholderNames.value = []
    packSpecsTotal.value = 0; packSpecsWithCode.value = 0
    return
  }
  try {
    const [varRes, phRes] = await Promise.all([
      api.get(`/api/agent-tests/packs/${packId}/variables`),
      api.get(`/api/agent-tests/packs/${packId}/placeholders`)
    ])
    packVariables.value = varRes.data
    packPlaceholderNames.value = phRes.data.placeholders?.map(p => p.name) || []
    packSpecsTotal.value    = phRes.data.specsTotal    || 0
    packSpecsWithCode.value = phRes.data.specsWithCode || 0
  } catch { packVariables.value = []; packPlaceholderNames.value = [] }
}

async function scanPackCode() {
  if (!selectedReviewPack.value) return
  scanLoading.value = true
  scanSuggestions.value = []
  try {
    const { data } = await api.get(`/api/agent-tests/packs/${selectedReviewPack.value.packId}/scan-variables`)
    scanSuggestions.value = data.suggestions || []
  } catch { /* ignore */ } finally {
    scanLoading.value = false
  }
}

function openAddVar(prefillName = '') {
  editingVar.value = null
  varForm.value = { name: prefillName, value: '', description: '', sensitive: false }
  varFormError.value = ''
  showVarValue.value = false
  showVarModal.value = true
}

function openEditVar(v) {
  editingVar.value = v
  varForm.value = { name: v.name, value: v.sensitive ? '' : v.value, description: v.description || '', sensitive: v.sensitive }
  varFormError.value = ''
  showVarValue.value = false
  showVarModal.value = true
}

async function saveVar() {
  varFormError.value = ''
  if (!varForm.value.name) { varFormError.value = 'Name is required'; return }
  if (!varForm.value.value && !editingVar.value) { varFormError.value = 'Value is required'; return }
  savingVar.value = true
  try {
    const packId = selectedReviewPack.value.packId
    if (editingVar.value) {
      const payload = { description: varForm.value.description, sensitive: varForm.value.sensitive }
      if (varForm.value.value) payload.value = varForm.value.value
      await api.put(`/api/agent-tests/packs/${packId}/variables/${editingVar.value.id}`, payload)
    } else {
      await api.post(`/api/agent-tests/packs/${packId}/variables`, varForm.value)
    }
    await fetchPackVarNames(packId)
    showVarModal.value = false
  } catch (e) {
    varFormError.value = e.response?.data?.error || 'Failed to save variable'
  } finally {
    savingVar.value = false
  }
}

async function deleteVar(v) {
  if (!confirm(`Delete {{${v.name}}}?`)) return
  try {
    await api.delete(`/api/agent-tests/packs/${selectedReviewPack.value.packId}/variables/${v.id}`)
    await fetchPackVarNames(selectedReviewPack.value.packId)
  } catch { /* ignore */ }
}

const replacingVarId = ref(null)

async function replaceVar(v) {
  const valueHint = v.sensitive ? '(sensitive — value hidden)' : v.value ? `"${v.value}"` : '(no value set)'
  if (!confirm(`Search all specs in this pack for ${valueHint} and replace every occurrence with {{${v.name}}}?\n\nThis edits the spec code directly.`)) return
  replacingVarId.value = v.id
  try {
    const { data } = await api.post(
      `/api/agent-tests/packs/${selectedReviewPack.value.packId}/variables/${v.id}/replace`
    )
    let msg
    if (data.totalReplacements > 0) {
      msg = `Replaced ${data.totalReplacements} occurrence${data.totalReplacements !== 1 ? 's' : ''} across ${data.specsUpdated} spec${data.specsUpdated !== 1 ? 's' : ''} — code now uses {{${v.name}}}`
      if (data.alreadyPlaceholder > 0) msg += `\n(${data.alreadyPlaceholder} spec${data.alreadyPlaceholder !== 1 ? 's' : ''} already had {{${v.name}}} — skipped)`
    } else if (data.alreadyPlaceholder > 0) {
      msg = `{{${v.name}}} is already used in ${data.alreadyPlaceholder} spec${data.alreadyPlaceholder !== 1 ? 's' : ''} — no replacement needed.`
    } else {
      msg = `No hardcoded occurrences of this value were found in the spec code.\n\nThe AI may have generated a placeholder like 'your-password-here' instead of the real value — open the spec in the editor and manually change it to {{${v.name}}}.`
    }
    alert(msg)
    // Reload the open spec's code if it was updated
    if (data.specsUpdated > 0 && selectedReviewSpec.value) {
      const { data: spec } = await api.get(`/api/agent-tests/specs/${selectedReviewSpec.value.specId}`)
      reviewCodeEdit.value = spec.generatedCode || ''
      reviewCodeDirty.value = false
    }
    await fetchPackVarNames(selectedReviewPack.value.packId)
  } catch (err) {
    alert(err?.response?.data?.error || 'Failed to replace variable')
  } finally {
    replacingVarId.value = null
  }
}

// Keep code editor in sync with selected spec
watch(() => selectedReviewSpec.value?.specId, async (newId) => {
  if (!newId) { reviewCodeEdit.value = ''; reviewCodeDirty.value = false; return }
  // generatedCode may already be loaded; if not, fetch it
  let code = selectedReviewSpec.value?.generatedCode || ''
  if (!code && selectedReviewSpec.value?.hasCode) {
    try {
      const { data } = await api.get(`/api/agent-tests/specs/${newId}`)
      code = data.generatedCode || ''
      selectedReviewSpec.value = { ...selectedReviewSpec.value, generatedCode: code }
    } catch { /* ignore */ }
  }
  reviewCodeEdit.value = code
  reviewCodeDirty.value = false
  codeViewMode.value = false
})

async function saveReviewCode() {
  if (!selectedReviewSpec.value) return
  reviewCodeSaving.value = true
  try {
    await api.patch(`/api/agent-tests/specs/${selectedReviewSpec.value.specId}/code`, { code: reviewCodeEdit.value })
    selectedReviewSpec.value = { ...selectedReviewSpec.value, generatedCode: reviewCodeEdit.value, hasCode: true, status: 'ready' }
    reviewCodeDirty.value = false
    // Refresh placeholder scan since code changed
    if (selectedReviewPack.value) await fetchPackVarNames(selectedReviewPack.value.packId)
  } catch { /* ignore */ } finally {
    reviewCodeSaving.value = false
  }
}

async function copyReviewCode() {
  try { await navigator.clipboard.writeText(reviewCodeEdit.value) } catch { /* ignore */ }
}

function toggleVarReveal(varId) {
  const s = new Set(revealedVarIds.value)
  s.has(varId) ? s.delete(varId) : s.add(varId)
  revealedVarIds.value = s
}

async function openPromoteModal() {
  promoteError.value = ''
  promoteInitiativeId.value = selectedReviewPack.value?.initiativeId || ''
  promoteFeatureId.value = selectedReviewPack.value?.featureId || ''
  promoteInitiatives.value = []
  promoteFeatures.value = []
  try {
    const { data } = await api.get('/api/initiatives')
    promoteInitiatives.value = data.initiatives || []
  } catch { /* ignore */ }
  if (promoteInitiativeId.value) {
    try {
      const { data } = await api.get(`/api/features?initiativeId=${promoteInitiativeId.value}`)
      promoteFeatures.value = data.features || []
    } catch { /* ignore */ }
  }
  showPromoteModal.value = true
}

async function onPromoteInitiativeChange() {
  promoteFeatureId.value = ''
  promoteFeatures.value = []
  if (!promoteInitiativeId.value) return
  try {
    const { data } = await api.get(`/api/features?initiativeId=${promoteInitiativeId.value}`)
    promoteFeatures.value = data.features || []
  } catch { /* ignore */ }
}

async function savePromotion() {
  promoteSaving.value = true
  promoteError.value = ''
  try {
    await api.put(`/api/agent-tests/packs/${selectedReviewPack.value.packId}`, {
      initiativeId: promoteInitiativeId.value || null,
      featureId: promoteFeatureId.value || null
    })
    // Update local state so badges appear immediately
    const initiative = promoteInitiatives.value.find(i => i.id === promoteInitiativeId.value)
    const feature = promoteFeatures.value.find(f => f.id === promoteFeatureId.value)
    selectedReviewPack.value = {
      ...selectedReviewPack.value,
      initiativeId: promoteInitiativeId.value || null,
      initiativeName: initiative?.name || null,
      featureId: promoteFeatureId.value || null,
      featureName: feature?.name || null
    }
    showPromoteModal.value = false
  } catch (e) {
    promoteError.value = e.response?.data?.error || 'Failed to save'
  } finally {
    promoteSaving.value = false
  }
}

const reviewPendingCount = computed(() =>
  reviewQueue.value.reduce((n, p) => n + p.failed + p.draft, 0)
)

function reviewStatusIcon(spec) {
  if (spec.status === 'passed') return CheckCircle
  if (spec.status === 'failed') return XCircle
  if (spec.hasCode) return Play        // ready to run
  return AlertCircle                   // no code yet
}

function reviewStatusColor(spec) {
  if (spec.status === 'passed') return '#4ade80'
  if (spec.status === 'failed') return '#f87171'
  if (spec.hasCode) return '#7367F0'   // primary — ready to run
  return '#94a3b8'                     // muted — no code
}

function addReviewLog(type, message) {
  const time = new Date().toTimeString().slice(0, 8)
  reviewLogs.value.push({ type, message, time })
  nextTick(() => {
    if (reviewConsoleEl.value) reviewConsoleEl.value.scrollTop = reviewConsoleEl.value.scrollHeight
  })
}

// Toggle spec list expansion only — does not select the pack
function toggleExpandOnly(packId) {
  const next = new Set(expandedPacks.value)
  next.has(packId) ? next.delete(packId) : next.add(packId)
  expandedPacks.value = next
}

// Select pack — shows pack detail + variables in right pane, expands spec list
async function selectPack(pack) {
  selectedReviewPack.value = pack
  selectedReviewSpec.value = null
  reviewLogs.value = []
  reviewResult.value = null
  // Expand this pack's spec list so specs are clickable
  const next = new Set(expandedPacks.value)
  next.add(pack.packId)
  expandedPacks.value = next
  fetchPackVarNames(pack.packId)
}

function openCreatePack() {
  newPack.value = { name: '', description: '', featureId: '' }
  createPackError.value = ''
  fetchPackFeatures()
  showCreatePack.value = true
}

async function fetchPackFeatures() {
  try {
    const { data } = await api.get('/api/features')
    packFeatures.value = data.features || []
  } catch {
    packFeatures.value = []
  }
}

async function createReviewPack() {
  if (!newPack.value.name.trim()) return
  creatingPack.value = true
  createPackError.value = ''
  try {
    const { data } = await api.post('/api/agent-tests/packs', {
      name: newPack.value.name.trim(),
      description: newPack.value.description || '',
      featureId: newPack.value.featureId || null
    })
    // getReviewQueue filters out packs with zero specs, so a brand-new empty pack
    // would otherwise vanish immediately after creation — splice it in locally
    // instead of relying on a refetch, so it's there to add specs to right away.
    const entry = {
      packId: data.id, packName: data.name, specs: [], total: 0, passed: 0, failed: 0, draft: 0,
      engine: data.engine || null,
      initiativeId: data.initiativeId || null, initiativeName: data.initiativeName || null,
      featureId: data.featureId || null, featureName: data.featureName || null
    }
    reviewQueue.value = [entry, ...reviewQueue.value]
    showCreatePack.value = false
    selectPack(entry)
  } catch (e) {
    createPackError.value = e.response?.data?.error || 'Failed to create pack'
  } finally {
    creatingPack.value = false
  }
}

async function selectReviewSpec(pack, spec) {
  selectedReviewPack.value = pack
  selectedReviewSpec.value = spec
  reviewLogs.value = []
  reviewResult.value = null

  // Fetch full spec (with generatedCode) for placeholder detection
  if (spec.hasCode) {
    try {
      const { data } = await api.get(`/api/agent-tests/specs/${spec.specId}`)
      selectedReviewSpec.value = { ...spec, generatedCode: data.generatedCode }
    } catch { /* placeholder panel shows empty */ }
  }

  // Fetch pack's configured variable names for status indicators
  fetchPackVarNames(pack.packId)
}

async function toggleExcludeSpec(pack, spec) {
  const newExcluded = !spec.excluded
  try {
    await api.patch(`/api/agent-tests/packs/${pack.packId}/tests/${spec.specId}/excluded`, { excluded: newExcluded })
    // Update local state immediately without a full reload
    const p = reviewQueue.value.find(q => q.packId === pack.packId)
    if (p) {
      const s = p.specs.find(s => s.specId === spec.specId)
      if (s) s.excluded = newExcluded
    }
    // Keep selectedReviewSpec in sync
    if (selectedReviewSpec.value?.specId === spec.specId) {
      selectedReviewSpec.value = { ...selectedReviewSpec.value, excluded: newExcluded }
    }
  } catch (err) {
    alert(err?.response?.data?.error || 'Failed to update exclusion')
  }
}

async function fetchReviewQueue() {
  reviewLoading.value = true
  reviewQueueError.value = ''
  try {
    const { data } = await api.get('/api/agent-tests/review-queue')
    reviewQueue.value = data
    const next = new Set(expandedPacks.value)
    if (next.size === 0) {
      // First load: auto-expand packs with failures
      data.forEach(p => { if (p.failed > 0) next.add(p.packId) })
    }
    // Always keep the selected pack expanded
    if (selectedReviewPack.value) next.add(selectedReviewPack.value.packId)
    expandedPacks.value = next
  } catch (err) {
    reviewQueueError.value = err?.response?.data?.error || err?.message || 'Failed to load review queue'
  }
  finally { reviewLoading.value = false }
}

async function runReviewSpec() {
  if (!selectedReviewSpec.value) return
  reviewLogs.value = []
  reviewResult.value = null
  reviewRunning.value = true
  addReviewLog('step', `Running: ${selectedReviewSpec.value.name}`)
  try {
    const { data } = await api.post(
      `/api/agent-tests/specs/${selectedReviewSpec.value.specId}/run`, {}, { timeout: 120000 }
    )
    reviewResult.value = data
    refreshFailingLines()
    if (data.status === 'failed' && failingLineNums.value.length > 0) {
      codeViewMode.value = true
    }
    addReviewLog(
      data.status === 'passed' ? 'done' : 'error',
      data.status === 'passed' ? 'Test passed' : `Test failed — ${data.error || 'see steps below'}`
    )
    // Refresh spec status in queue
    selectedReviewSpec.value = { ...selectedReviewSpec.value, status: data.status }
    await fetchReviewQueue()
    // Re-select the same spec after refresh
    const updatedPack = reviewQueue.value.find(p => p.packId === selectedReviewPack.value?.packId)
    if (updatedPack) {
      selectedReviewPack.value = updatedPack
      const updatedSpec = updatedPack.specs.find(s => s.specId === selectedReviewSpec.value.specId)
      if (updatedSpec) selectedReviewSpec.value = updatedSpec
    }
  } catch (err) {
    addReviewLog('error', err?.response?.data?.error || err.message || 'Run failed')
  } finally { reviewRunning.value = false }
}

async function healReviewSpec() {
  if (!selectedReviewSpec.value) return
  reviewLogs.value = []
  reviewResult.value = null
  reviewHealing.value = true
  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(
      `${baseUrl}/api/agent-tests/specs/${selectedReviewSpec.value.specId}/heal-stream`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
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
            const ev = JSON.parse(line.slice(6))
            addReviewLog(ev.type, ev.message || '')
          } catch { /* skip malformed */ }
        }
      }
    }
  } catch (err) {
    addReviewLog('error', err.message || 'Heal failed')
  } finally {
    reviewHealing.value = false
    selectedReviewSpec.value = { ...selectedReviewSpec.value, status: 'ready' }
    await fetchReviewQueue()
    const updatedPack = reviewQueue.value.find(p => p.packId === selectedReviewPack.value?.packId)
    if (updatedPack) {
      selectedReviewPack.value = updatedPack
      const updatedSpec = updatedPack.specs.find(s => s.specId === selectedReviewSpec.value?.specId)
      if (updatedSpec) selectedReviewSpec.value = updatedSpec
    }
    // Pull healed code into editor
    if (selectedReviewSpec.value?.specId) {
      try {
        const { data } = await api.get(`/api/agent-tests/specs/${selectedReviewSpec.value.specId}`)
        reviewCodeEdit.value = data.generatedCode || ''
        reviewCodeDirty.value = false
      } catch { /* ignore */ }
    }
  }
}

async function generatePackSpecs(pack) {
  // Generate all specs — if they already have code, this regenerates them (picking up pack variables)
  const toGenerate = pack.specs
  if (!toGenerate.length) return

  // Select this pack so the right pane shows progress
  selectedReviewPack.value = pack
  selectedReviewSpec.value = null
  reviewLogs.value = []
  reviewResult.value = null

  const state = { done: 0, total: toGenerate.length }
  const next = new Map(packGenerating.value)
  next.set(pack.packId, state)
  packGenerating.value = next

  let errors = 0
  for (const spec of toGenerate) {
    addReviewLog('step', `[${state.done + 1}/${state.total}] Generating: ${spec.name}`)
    try {
      await api.post(`/api/agent-tests/specs/${spec.specId}/generate`, {}, { timeout: 180000 })
      addReviewLog('done', `✓ ${spec.name}`)
    } catch (err) {
      errors++
      const msg = err?.response?.data?.error || err.message || 'failed'
      addReviewLog('error', `✗ ${spec.name} — ${msg}`)
    }
    state.done++
    const m = new Map(packGenerating.value)
    m.set(pack.packId, { ...state })
    packGenerating.value = m
  }

  addReviewLog(errors === 0 ? 'done' : 'warn',
    errors === 0
      ? `All ${state.total} specs generated for ${pack.packName}`
      : `Done — ${state.total - errors} generated, ${errors} failed`
  )

  // Remove generating state and refresh queue
  const m = new Map(packGenerating.value)
  m.delete(pack.packId)
  packGenerating.value = m
  await fetchReviewQueue()
  // Re-select current spec if it was in this pack
  if (selectedReviewPack.value?.packId === pack.packId) {
    const updatedPack = reviewQueue.value.find(p => p.packId === pack.packId)
    if (updatedPack) {
      selectedReviewPack.value = updatedPack
      if (selectedReviewSpec.value) {
        const updatedSpec = updatedPack.specs.find(s => s.specId === selectedReviewSpec.value.specId)
        if (updatedSpec) selectedReviewSpec.value = updatedSpec
      }
    }
  }
  // Refresh placeholder scan so newly generated code's {{PLACEHOLDER}} patterns appear
  await fetchPackVarNames(pack.packId)
  scanSuggestions.value = []
}

async function reloadReviewSpecs() {
  if (!selectedReviewPack.value) return
  await fetchReviewQueue()
  const updated = reviewQueue.value.find(p => p.packId === selectedReviewPack.value.packId)
  if (updated) selectedReviewPack.value = updated
}

async function startPackValidation() {
  const pack = selectedReviewPack.value
  if (!pack) return

  const specsWithCode = pack.specs.filter(s => s.hasCode)
  if (!specsWithCode.length) {
    alert('No specs in this pack have generated code to validate. Generate code first.')
    return
  }

  // Reset state
  packValTotal.value  = pack.specs.length
  packValDone.value   = 0
  packValPassed.value = 0
  packValFailed.value = 0
  packValSpecs.value  = pack.specs.map(s => ({ specId: s.specId, name: s.name, status: 'pending', steps: [], summary: null, reason: null }))

  packValidating.value        = true
  showPackValidationModal.value = true

  try {
    const baseUrl = getApiBaseUrl()
    const resp = await fetch(`${baseUrl}/api/agent-tests/packs/${pack.packId}/validate-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headed: true })
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Server error ${resp.status}: ${errText}`)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const ev = JSON.parse(line.slice(6))
          handlePackValEvent(ev)
        } catch { /* ignore malformed */ }
      }
    }
  } catch (err) {
    console.error('Pack validation error:', err)
    packValSpecs.value = [
      { specId: '__error__', name: `Error: ${err.message}`, status: 'error', steps: [], summary: null, reason: null },
      ...packValSpecs.value
    ]
  } finally {
    packValidating.value = false
  }
}

function handlePackValEvent(ev) {
  switch (ev.type) {
    case 'pack-start':
      // already initialised — packValidating=true shows "Connecting…"
      break
    case 'spec-start':
      packValSpecs.value = packValSpecs.value.map(s =>
        s.specId === ev.specId ? { ...s, status: 'running' } : s)
      break
    case 'step-result':
      packValSpecs.value = packValSpecs.value.map(s =>
        s.specId === ev.specId
          ? { ...s, steps: [...s.steps, { intent: ev.intent, status: ev.status }] }
          : s)
      break
    case 'spec-complete': {
      const uiStatus = ev.status === 'validated' ? 'done'
        : ev.status === 'partial' ? 'partial'
        : ev.status === 'skipped' ? 'skipped'
        : 'error'
      packValSpecs.value = packValSpecs.value.map(s =>
        s.specId === ev.specId
          ? { ...s, status: uiStatus, summary: ev.summary || null, reason: ev.reason || null }
          : s)
      packValDone.value++
      if (ev.status === 'validated') packValPassed.value++
      else if (ev.status !== 'skipped') packValFailed.value++
      break
    }
    case 'pack-complete':
      packValidating.value = false
      break
    case 'error':
      packValSpecs.value = [
        { specId: '__error__', name: `Error: ${ev.message}`, status: 'error', steps: [], summary: null, reason: null },
        ...packValSpecs.value
      ]
      packValidating.value = false
      break
  }
}

async function runPackAll(pack) {
  // Auto-open the pack and show console in right panel
  const firstSpec = pack.specs.find(s => s.hasCode) || pack.specs[0]
  if (firstSpec) selectReviewSpec(pack, firstSpec)
  reviewLogs.value = []
  reviewResult.value = null

  const next = new Set(packRunning.value)
  next.add(pack.packId)
  packRunning.value = next

  addReviewLog('step', `Running ${pack.specs.filter(s => s.hasCode).length} tests in "${pack.packName}"…`)
  try {
    const { data } = await api.post(
      `/api/agent-tests/packs/${pack.packId}/run`, {}, { timeout: 600000 }
    )
    const { total, passed, failed, duration, results } = data
    addReviewLog(failed === 0 ? 'done' : 'warn',
      `${passed}/${total} passed · ${Math.round(duration / 1000)}s`
    )
    for (const r of (results || [])) {
      addReviewLog(r.status === 'passed' ? 'done' : 'error',
        `${r.status === 'passed' ? '✓' : '✗'} ${r.specName || r.specId}${r.error ? ` — ${r.error}` : ''}`
      )
    }
  } catch (err) {
    addReviewLog('error', err?.response?.data?.error || err.message || 'Run failed')
  } finally {
    const s = new Set(packRunning.value)
    s.delete(pack.packId)
    packRunning.value = s
    await fetchReviewQueue()
    const updatedPack = reviewQueue.value.find(p => p.packId === pack.packId)
    if (updatedPack) {
      selectedReviewPack.value = updatedPack
      if (selectedReviewSpec.value) {
        const updatedSpec = updatedPack.specs.find(s => s.specId === selectedReviewSpec.value.specId)
        if (updatedSpec) selectedReviewSpec.value = updatedSpec
      }
    }
  }
}

async function generateReviewSpecCode() {
  if (!selectedReviewSpec.value) return
  reviewLogs.value = []
  reviewResult.value = null
  reviewGenerating.value = true
  if (!selectedReviewSpec.value.url) {
    addReviewLog('error', 'No URL set on this spec — set a URL first via the Build tab')
    reviewGenerating.value = false
    return
  }
  addReviewLog('step', `Probing ${selectedReviewSpec.value.url}…`)
  addReviewLog('info', 'Generating Playwright code with AI (this takes ~30s)…')
  try {
    const { data } = await api.post(
      `/api/agent-tests/specs/${selectedReviewSpec.value.specId}/generate`, {}, { timeout: 180000 }
    )
    if (data.hallucinationWarning) {
      addReviewLog('warn', '⚠ Some locator names could not be confirmed in the page ARIA — auto-validating in browser to correct them…')
    } else {
      addReviewLog('done', 'Code generated — auto-validating in browser…')
    }
    selectedReviewSpec.value = { ...selectedReviewSpec.value, hasCode: true, status: data.status || 'ready', generatedCode: data.generatedCode }
    specVariables.value = extractSpecVariables(data.generatedCode)
    editedVariables.value = Object.fromEntries(specVariables.value.map(v => [v.key, v.value]))

    // Auto-validate: run headless browser validation immediately after generate
    await autoValidateReviewSpec(selectedReviewSpec.value.specId)

    // Refresh queue so the pack reflects the updated spec
    await fetchReviewQueue()
    const updatedPack = reviewQueue.value.find(p => p.packId === selectedReviewPack.value?.packId)
    if (updatedPack) {
      selectedReviewPack.value = updatedPack
      const updatedSpec = updatedPack.specs.find(s => s.specId === selectedReviewSpec.value.specId)
      if (updatedSpec) selectedReviewSpec.value = updatedSpec
    }
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || 'Generation failed'
    addReviewLog('error', msg)
  } finally { reviewGenerating.value = false }
}

async function autoValidateReviewSpec(specId) {
  const baseUrl = getApiBaseUrl()
  try {
    const resp = await fetch(`${baseUrl}/api/agent-tests/specs/${specId}/auto-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    if (!resp.ok) { addReviewLog('warn', 'Auto-validate could not start — validate manually before running'); return }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const ev = JSON.parse(line.slice(6))
          if (ev.type === 'auto-validate-complete') {
            const s = ev.summary || {}
            if (ev.status === 'ready') {
              addReviewLog('done', `✓ Auto-validated — ${s.pass} steps confirmed, code applied`)
            } else {
              addReviewLog('warn', `Auto-validate: ${s.pass} steps OK, ${s.skip || 0} need manual validate (modal forms or dynamic content)`)
            }
            selectedReviewSpec.value = { ...selectedReviewSpec.value, status: ev.status }
          } else if (ev.type === 'step-result' && ev.status === 'skip') {
            addReviewLog('info', `  ↷ skipped: ${ev.intent}`)
          } else if (ev.type === 'error') {
            addReviewLog('warn', `Auto-validate error: ${ev.message}`)
          }
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    addReviewLog('warn', `Auto-validate failed: ${err.message} — validate manually before running`)
  }
}

function switchMode(m) {
  mode.value = m
  if (m === 'review') fetchReviewQueue()
}
// ─────────────────────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  await store.initialize()
  fetchTemplates() // non-blocking: static list already loaded, API updates if available
  scrollToBottom()
  inputRef.value?.focus()
  if (route.query.mode === 'review') {
    switchMode('review')
  }
})

onUnmounted(() => {
  store.disconnect()
})

// Watch for store changes to update local state
watch(() => store.hasTests, (hasTests) => {
  if (hasTests) {
    currentStatus.value = 'ready'
  }
})

// Watch for terminal run completion (functional tests via WebSocket)
watch(() => store.lastRunSummary, (summary) => {
  if (!summary) return
  if (summary.failed > 0) {
    currentStatus.value = 'failed'
    lastRunResult.value = {
      specName: testConfig.value.name,
      status: 'failed',
      steps: summary.failures.map(f => ({ step: f.step, success: false, error: f.error }))
    }
    // Show the "could not heal" warning only after results confirm it still failed
    if (healAttempts.value >= 2) {
      store.addMessage('warning', 'Could not auto-heal after 2 attempts. The failing steps may be testing elements that do not exist on this page — try editing the spec (Edit button) or re-running Probe then Plan to regenerate.')
    }
  } else {
    currentStatus.value = 'passed'
    lastRunResult.value = {
      specName: testConfig.value.name,
      status: 'passed',
      steps: []
    }
    healAttempts.value = 0
  }
  scrollToBottom()
})

// Auto-scroll whenever a new message arrives — only if already near the bottom
// so the user can scroll up to re-read without being yanked back down
watch(() => messages.value.length, () => {
  nextTick(() => {
    if (!outputRef.value) return
    const el = outputRef.value
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 150) {
      el.scrollTop = el.scrollHeight
    }
  })
})

function selectTestType(type) {
  if (!hasActiveTest.value) {
    testConfig.value.type = type
    selectedTemplate.value = ''
    store.addMessage('info', `Switched to ${type} test mode`)
  }
}

async function fetchTemplates() {
  try {
    const response = await api.get('/api/agent-tests/templates')
    // Only replace static list if API returns at least as many templates (guards against stale backend)
    if (Array.isArray(response.data) && response.data.length >= STATIC_TEMPLATES.length) {
      templates.value = response.data
    }
  } catch {
    // Backend not ready yet — static templates are already loaded
  }
}

function applyTemplate() {
  const template = templates.value.find(t => t.id === selectedTemplate.value)
  if (template) {
    if (!testConfig.value.name) testConfig.value.name = template.name
    // Remove trailing slash from URL to avoid double slashes like http://example.com//login
    const cleanUrl = (testConfig.value.url || '{URL}').replace(/\/+$/, '')
    userInput.value = template.markdownSpec.replace(/{URL}/g, cleanUrl)
  }
}

// API Discovery functions
async function scanForAPIs() {
  if (!testConfig.value.url) return

  isScanning.value = true
  scanError.value = ''
  discoveredEndpoints.value = []
  swaggerSpecUrl.value = ''
  selectedEndpoint.value = ''

  try {
    store.addMessage('info', `Scanning ${testConfig.value.url} for API endpoints...`)

    const response = await api.post('/api/agent-tests/discover', {
      url: testConfig.value.url,
      options: {
        includeSwagger: true,
        probeCommonPaths: true,
        checkRobots: true,
        maxEndpoints: 50
      }
    })

    discoveredEndpoints.value = response.data.endpoints || []
    swaggerSpecUrl.value = response.data.swaggerSpec || ''

    if (discoveredEndpoints.value.length > 0) {
      store.addMessage('success', `Found ${discoveredEndpoints.value.length} API endpoint(s)`)
      if (swaggerSpecUrl.value) {
        store.addMessage('info', `OpenAPI spec detected at ${swaggerSpecUrl.value}`)
      }
    } else {
      store.addMessage('info', 'No API endpoints discovered. Try entering a more specific base URL.')
    }

    if (response.data.errors?.length > 0) {
      response.data.errors.forEach(err => {
        store.addMessage('error', `Scan warning: ${err.message}`)
      })
    }
  } catch (error) {
    scanError.value = error.response?.data?.error || error.message
    store.addMessage('error', `Scan failed: ${scanError.value}`)
  } finally {
    isScanning.value = false
  }

  scrollToBottom()
}

function applyDiscoveredEndpoint() {
  if (!selectedEndpoint.value) return

  try {
    const endpoint = JSON.parse(selectedEndpoint.value)

    // Update the URL to the full endpoint URL
    testConfig.value.url = endpoint.fullUrl

    // Set the HTTP method
    testConfig.value.method = endpoint.method || 'GET'

    // Generate a test name from the endpoint
    if (!testConfig.value.name || testConfig.value.name === '') {
      const pathParts = endpoint.path.split('/').filter(Boolean)
      const resourceName = pathParts[pathParts.length - 1] || 'endpoint'
      testConfig.value.name = `${endpoint.method} ${resourceName}`
    }

    // Pre-fill the test description
    let description = `## ${endpoint.method} ${endpoint.path}\n\n`
    if (endpoint.summary) {
      description += `${endpoint.summary}\n\n`
    }
    description += `- Send ${endpoint.method} request to {URL}\n`
    description += `- Expect status code ${endpoint.status || 200}\n`

    if (endpoint.method === 'GET') {
      description += `- Verify response is JSON\n`
    }
    if (endpoint.requiresAuth) {
      description += `- Note: This endpoint requires authentication\n`
    }

    userInput.value = description

    store.addMessage('info', `Selected: ${endpoint.method} ${endpoint.path}`)
  } catch (error) {
    console.error('Failed to apply endpoint:', error)
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  })
}

function getPrefix(type) {
  const prefixes = {
    user: '❯',
    system: '→',
    success: '✓',
    error: '✗',
    info: '•',
    code: '⌘'
  }
  return prefixes[type] || '•'
}

function formatContent(content) {
  return content
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/^(\d+\.)/gm, '<span class="step-num">$1</span>')
}

function getStatusBadgeClass(status) {
  const classes = {
    draft: 'badge-warning',
    ready: 'badge-success',
    running: 'badge-info',
    passed: 'badge-success',
    failed: 'badge-danger',
    saved: 'badge-primary'
  }
  return classes[status] || 'badge-secondary'
}

function getTypeBadgeClass(type) {
  const classes = {
    agent: 'badge-primary',
    functional: 'badge-success',
    api: 'badge-info',
    synthetic: 'badge-warning'
  }
  return classes[type] || 'badge-secondary'
}

function handleKeydown(e) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    if (canPlan.value && !store.hasPlan) {
      doPlan()
    }
  }
}

async function doProbe() {
  if (!testConfig.value.url) return
  store.addMessage('info', `Probing ${testConfig.value.url}...`)
  const data = await store.probe(testConfig.value.url)
  if (data) {
    store.addMessage('success', `Page structure captured — AI will use real element names when planning`)
  }
  scrollToBottom()
}

async function doPlan() {
  if (!userInput.value.trim() || !testConfig.value.name || !testConfig.value.url) return

  markdownSpec.value = userInput.value

  // Build context based on test type
  let context = `Test Type: ${testConfig.value.type}\nTest: ${testConfig.value.name}\nURL: ${testConfig.value.url}\n`

  if (testConfig.value.type === 'api') {
    context += `Method: ${testConfig.value.method}\n`
    if (testConfig.value.headers) {
      context += `Headers: ${testConfig.value.headers}\n`
    }
  }

  if (testConfig.value.type === 'synthetic') {
    context += `Schedule: ${testConfig.value.schedule}\n`
    context += `Alert Threshold: ${testConfig.value.alertThreshold}ms\n`
  }

  const prompt = `${context}\n${userInput.value}`
  userInput.value = ''

  if (!store.probeData && testConfig.value.type === 'functional') {
    store.addMessage('info', 'Tip: Use Probe first to give the AI real page structure — tests will be much more accurate.')
  }

  await store.plan(prompt, store.probeData)
  scrollToBottom()
}

async function doGenerate() {
  // Functional tests: use the TypeScript pipeline via terminal session
  if (testConfig.value.type === 'functional') {
    store.addMessage('info', `Generating TypeScript test files for "${testConfig.value.name}"...`)
    activeFileTab.value = 'spec'
    await store.generate(testConfig.value.url, testConfig.value.name)
    scrollToBottom()
    return
  }

  // API tests: existing agent-tests pipeline
  const typeLabel = testConfig.value.type.charAt(0).toUpperCase() + testConfig.value.type.slice(1)
  store.addMessage('info', `Generating ${typeLabel} test code for "${testConfig.value.name}"...`)

  try {
    const endpoint = getEndpointForType(testConfig.value.type)
    const payload = {
      name: testConfig.value.name,
      url: testConfig.value.url,
      markdownSpec: markdownSpec.value,
      testType: testConfig.value.type,
      method: testConfig.value.method,
      headers: testConfig.value.headers
    }

    const response = await api.post(endpoint.create, payload)
    currentSpecId.value = response.data.specId || response.data._id || response.data.transactionId
    store.addMessage('success', `Test spec created: ${currentSpecId.value}`)

    const genResponse = await api.post(endpoint.generate.replace(':id', currentSpecId.value))
    generatedCode.value = genResponse.data.generatedCode
    currentStatus.value = 'ready'
    store.addMessage('success', `${typeLabel} test code generated successfully`)
    store.addMessage('code', `Generated ${genResponse.data.generatedCode?.split('\n').length || 0} lines of Playwright code`)
    store.setHasTests(true)
  } catch (error) {
    store.addMessage('error', `Generation failed: ${error.response?.data?.error || error.message}`)
  }

  scrollToBottom()
}

function getEndpointForType(type) {
  // For now, all types use the agent-tests API with testType field
  // This can be expanded to route to different APIs per type
  return {
    create: '/api/agent-tests/specs',
    generate: '/api/agent-tests/specs/:id/generate',
    run: '/api/agent-tests/specs/:id/run',
    heal: '/api/agent-tests/specs/:id/heal'
  }
}

async function doRun() {
  store.addMessage('info', 'Running test...')
  currentStatus.value = 'running'
  lastRunResult.value = null
  healAttempts.value = 0

  // Functional tests: run via terminal session (results come via WebSocket)
  if (testConfig.value.type === 'functional') {
    await store.run()
    scrollToBottom()
    return
  }

  // API tests: run via agent-tests API
  if (!currentSpecId.value) {
    store.addMessage('error', 'No test spec found. Generate first.')
    currentStatus.value = 'failed'
    return
  }

  try {
    const endpoint = getEndpointForType(testConfig.value.type)
    const response = await api.post(endpoint.run.replace(':id', currentSpecId.value))

    lastRunResult.value = {
      ...response.data,
      specName: testConfig.value.name
    }

    if (response.data.status === 'passed') {
      store.addMessage('success', 'Test passed!')
      if (response.data.duration) {
        store.addMessage('info', `Completed in ${response.data.duration}ms`)
      }
      currentStatus.value = 'passed'
      store.setHasFailures(false)
    } else {
      const errorMsg = response.data.error || response.data.message || 'Test assertions failed'
      store.addMessage('error', `Test failed: ${errorMsg}`)
      if (response.data.steps) {
        const failedStep = response.data.steps.find(s => !s.success && !s.skipped)
        if (failedStep) {
          store.addMessage('error', `Failed at: ${failedStep.step}`)
        }
      }
      currentStatus.value = 'failed'
      store.setHasFailures(true)
    }
  } catch (error) {
    store.addMessage('error', `Run failed: ${error.response?.data?.error || error.message}`)
    currentStatus.value = 'failed'
    store.setHasFailures(true)
  }

  scrollToBottom()
}

async function doHeal() {
  healAttempts.value++
  store.addMessage('info', `Attempting to heal failing selectors (attempt ${healAttempts.value} of 2)...`)

  // Functional tests: heal via terminal session
  if (testConfig.value.type === 'functional') {
    await store.heal()
    scrollToBottom()
    return
  }

  // API tests: heal via agent-tests API
  if (!currentSpecId.value) {
    store.addMessage('error', 'No test spec found. Generate first.')
    return
  }

  try {
    const endpoint = getEndpointForType(testConfig.value.type)
    const response = await api.post(endpoint.heal.replace(':id', currentSpecId.value))

    if (response.data.healed) {
      store.addMessage('success', 'Test healed successfully! Running again...')
      generatedCode.value = response.data.generatedCode
      currentStatus.value = 'ready'
      store.setHasFailures(false)
      await doRun()
    } else {
      store.addMessage('error', 'Could not auto-heal the test. Manual intervention required.')
    }
  } catch (error) {
    store.addMessage('error', `Heal failed: ${error.response?.data?.error || error.message}`)
  }

  scrollToBottom()
}

async function saveTest() {
  savingTest.value = true

  try {
    if (testConfig.value.type === 'functional') {
      // Spec is already in the DB (created during generate). Just confirm.
      currentStatus.value = 'saved'
      store.addMessage('success', `"${testConfig.value.name}" saved to library`)
      store.addMessage('info', 'Find it in Functional Tests — you can promote it to a Synthetic Monitor from there')
      scrollToBottom()
      return
    }

    if (!currentSpecId.value) return
    store.addMessage('info', 'Saving test to library...')
    currentStatus.value = 'saved'
    store.addMessage('success', `"${testConfig.value.name}" saved to library`)
    store.addMessage('info', 'You can find and manage this test in Functional Tests')
  } catch (error) {
    store.addMessage('error', `Save failed: ${error.response?.data?.error || error.message}`)
  } finally {
    savingTest.value = false
    scrollToBottom()
  }
}

function showEditSpec() {
  editableSpec.value = markdownSpec.value
  editSpecVisible.value = true
}

function closeEditSpec() {
  editSpecVisible.value = false
}

function applySpecChanges() {
  if (editableSpec.value.trim()) {
    markdownSpec.value = editableSpec.value
    store.addMessage('success', 'Test spec updated')
    store.addMessage('info', 'Click Generate to create code from the updated spec')
  }
  editSpecVisible.value = false
  scrollToBottom()
}

async function quickPromoteToSynthetic() {
  if (!currentSpecId.value) return

  const schedule = prompt('Enter cron schedule (default: */30 * * * * - every 30 min):', '*/30 * * * *')
  if (schedule === null) return

  try {
    await api.post(`/api/agent-tests/specs/${currentSpecId.value}/promote`, {
      schedule: schedule || '*/30 * * * *',
      alertThreshold: 3
    })
    store.addMessage('success', `"${testConfig.value.name}" has been promoted to Synthetic Monitor`)
    store.addMessage('info', 'You can manage synthetic monitors in Settings > Synthetics')
  } catch (error) {
    store.addMessage('error', `Failed to promote: ${error.response?.data?.error || error.message}`)
  }
  scrollToBottom()
}

function tabLabel(tab) {
  return { spec: 'Spec (.spec.ts)', fixture: 'Fixture (.fixture.ts)', pom: 'Page Object (.page.ts)' }[tab]
}

function downloadFile(type) {
  const content = store.generatedFiles?.[type]
  if (!content) return
  const baseName = (testConfig.value.name || 'aurora-test').toLowerCase().replace(/\s+/g, '-')
  const names = {
    spec: `${baseName}.spec.ts`,
    fixture: `${baseName}.fixture.ts`,
    pom: `${baseName}.page.ts`
  }
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = names[type]
  a.click()
  URL.revokeObjectURL(url)
}

function resetTest() {
  const currentType = testConfig.value.type
  testConfig.value = {
    type: currentType,
    name: '',
    url: '',
    method: 'GET',
    headers: '',
    schedule: '*/30 * * * *',
    alertThreshold: 3000
  }
  selectedTemplate.value = ''
  userInput.value = ''
  currentSpecId.value = null
  currentStatus.value = 'draft'
  generatedCode.value = null
  markdownSpec.value = ''
  editableSpec.value = ''
  lastRunResult.value = null
  activeFileTab.value = 'spec'
  // Reset API discovery state
  discoveredEndpoints.value = []
  selectedEndpoint.value = ''
  scanError.value = ''
  swaggerSpecUrl.value = ''
  store.reset()
  store.addMessage('info', 'Ready to create a new test')
  scrollToBottom()
}
</script>

<style scoped>
.test-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 12px;
  font-weight: 500;
}

.test-type-btn:hover:not(.disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.test-type-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.test-type-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.terminal-container {
  background: #1a1b26;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
}

.terminal-header {
  background: #24283b;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #414868;
}

.terminal-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot-red { background: #f7768e; }
.dot-yellow { background: #e0af68; }
.dot-green { background: #9ece6a; }

.terminal-title {
  flex: 1;
  text-align: center;
  color: #787c99;
  font-size: 13px;
}

.terminal-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected { background: #9ece6a; }
.status-dot.disconnected { background: #f7768e; }

.status-text {
  color: #787c99;
}

.terminal-output {
  padding: 16px;
  min-height: 300px;
  max-height: 350px;
  overflow-y: auto;
  background: #1a1b26;
}

.terminal-welcome {
  text-align: center;
  padding: 40px 20px;
}

.welcome-text {
  color: #7aa2f7;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.welcome-hint {
  color: #565f89;
  font-size: 13px;
}

.terminal-line {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  line-height: 1.5;
}

.line-prefix {
  flex-shrink: 0;
  width: 16px;
  font-weight: 600;
}

.line-content {
  color: #a9b1d6;
  word-break: break-word;
  white-space: pre-wrap;
}

.terminal-line.user .line-prefix { color: #7aa2f7; }
.terminal-line.user .line-content { color: #c0caf5; }

.terminal-line.system .line-prefix { color: #bb9af7; }
.terminal-line.system .line-content { color: #9aa5ce; }

.terminal-line.success .line-prefix { color: #9ece6a; }
.terminal-line.success .line-content { color: #9ece6a; }

.terminal-line.error .line-prefix { color: #f7768e; }
.terminal-line.error .line-content { color: #f7768e; }

.terminal-line.info .line-prefix { color: #7dcfff; }
.terminal-line.info .line-content { color: #7dcfff; }

.terminal-line.code .line-prefix { color: #bb9af7; }
.terminal-line.code .line-content { color: #bb9af7; }

.terminal-line.processing .line-content { color: #bb9af7; }

:deep(.inline-code) {
  background: #24283b;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

:deep(.step-num) {
  color: #7aa2f7;
  font-weight: 600;
}

.cursor {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.review-pulse-dot {
  animation: review-pulse 1.2s ease-in-out infinite;
}

@keyframes review-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.15; }
}

.terminal-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #24283b;
  border-top: 1px solid #414868;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn.probe {
  background: #2ac3de;
  color: #1a1b26;
}
.action-btn.probe:hover:not(:disabled) { background: #4fd6e8; }

.action-btn.plan {
  background: #7aa2f7;
  color: #1a1b26;
}
.action-btn.plan:hover:not(:disabled) { background: #89b4fa; }

.action-btn.edit {
  background: #ff9e64;
  color: #1a1b26;
}
.action-btn.edit:hover:not(:disabled) { background: #fab387; }

.action-btn.generate {
  background: #9ece6a;
  color: #1a1b26;
}
.action-btn.generate:hover:not(:disabled) { background: #a6e3a1; }

.action-btn--primary {
  font-size: 15px;
  padding: 10px 22px;
  box-shadow: 0 0 0 2px rgba(158, 206, 106, 0.35);
}

.action-btn.run {
  background: #7dcfff;
  color: #1a1b26;
}
.action-btn.run:hover:not(:disabled) { background: #89dceb; }

.action-btn.heal {
  background: #e0af68;
  color: #1a1b26;
}
.action-btn.heal:hover:not(:disabled) { background: #f9e2af; }

.action-btn.validate {
  background: #7367F0;
  color: #fff;
}
.action-btn.validate:hover:not(:disabled) { background: #8a7ff5; }

.action-btn.save {
  background: #bb9af7;
  color: #1a1b26;
}
.action-btn.save:hover:not(:disabled) { background: #cba6f7; }

.terminal-input-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: #1a1b26;
  border-top: 1px solid #414868;
}

.input-prompt {
  color: #7aa2f7;
  font-weight: 600;
  padding-top: 4px;
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #c0caf5;
  font-family: inherit;
  font-size: 14px;
  resize: none;
  line-height: 1.5;
}

.terminal-input::placeholder {
  color: #565f89;
}

.terminal-input:disabled {
  opacity: 0.5;
}

/* Scrollbar styling */
.terminal-output::-webkit-scrollbar {
  width: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #1a1b26;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #414868;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover {
  background: #565f89;
}

/* Edit Spec Modal */
.spec-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.spec-modal {
  background: #1a1b26;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  border: 1px solid #414868;
}

.spec-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #414868;
  background: #24283b;
  border-radius: 12px 12px 0 0;
}

.spec-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #c0caf5;
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.spec-modal-close {
  background: transparent;
  border: none;
  color: #787c99;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.spec-modal-close:hover {
  color: #f7768e;
  background: rgba(247, 118, 142, 0.1);
}

.spec-modal-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.spec-help-text {
  color: #787c99;
  font-size: 13px;
  margin-bottom: 12px;
  line-height: 1.5;
}

.spec-help-text code {
  background: #24283b;
  padding: 2px 6px;
  border-radius: 4px;
  color: #7aa2f7;
}

.spec-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: #24283b;
  border-radius: 8px;
}

.spec-example-label {
  color: #787c99;
  font-size: 12px;
  font-weight: 600;
}

.spec-examples code {
  background: #1a1b26;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #9ece6a;
}

.spec-editor {
  width: 100%;
  background: #24283b;
  border: 1px solid #414868;
  border-radius: 8px;
  color: #c0caf5;
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  resize: vertical;
  min-height: 300px;
}

.spec-editor:focus {
  outline: none;
  border-color: #7aa2f7;
}

.spec-editor::placeholder {
  color: #565f89;
}

.spec-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #414868;
  background: #24283b;
  border-radius: 0 0 12px 12px;
}

.spec-modal-footer .btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* API Discovery Section */
.api-discovery-section {
  padding: 12px;
  background: var(--color-surface);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.api-discovery-section .form-label {
  font-size: 12px;
  font-weight: 600;
}

.api-discovery-section .btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.api-discovery-section select optgroup {
  font-weight: 600;
  color: var(--color-text-heading);
}

.api-discovery-section option {
  padding: 8px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* Generated TypeScript Files Panel */
.file-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0;
}

.file-tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s ease;
  border-radius: 4px 4px 0 0;
}

.file-tab:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.file-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.file-content {
  background: #1a1b26;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  max-height: 500px;
  overflow-y: auto;
  margin: 0;
}

.file-content code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #a9b1d6;
  white-space: pre;
}

.file-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.file-content::-webkit-scrollbar-track {
  background: #1a1b26;
}

.file-content::-webkit-scrollbar-thumb {
  background: #414868;
  border-radius: 4px;
}
</style>
