<template>
  <div class="space-y-6" data-testid="page-csv-import">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-heading">Import Test Cases</h1>
        <p class="text-body text-body-color">Import from CSV, paste from spreadsheet, or let AI extract from requirements</p>
      </div>
      <router-link to="/tests" class="btn btn-secondary">
        <ArrowLeft :size="18" />
        Back to Tests
      </router-link>
    </div>

    <!-- Import Mode Tabs -->
    <div class="flex gap-2 border-b border-border pb-0">
      <button
        v-for="tab in importTabs"
        :key="tab.id"
        @click="switchImportMode(tab.id)"
        class="px-4 py-2 -mb-px border-b-2 transition-colors flex items-center gap-2"
        :class="importMode === tab.id
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted hover:text-heading'"
      >
        <component :is="tab.icon" :size="16" />
        {{ tab.label }}
      </button>
    </div>

    <!-- AI Freeform Mode -->
    <div v-if="importMode === 'ai'" class="card max-w-3xl mx-auto">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <Sparkles :size="20" class="text-primary" />
          AI Test Case Extraction
        </h2>
        <p class="text-muted text-sm">Paste requirements, user stories, or specifications — AI will extract structured test cases</p>
      </div>
      <div class="card-body space-y-4">
        <div>
          <label class="form-label">Source Text</label>
          <textarea
            v-model="aiInput.text"
            rows="12"
            class="form-input font-mono text-sm"
            placeholder="Paste requirements, user stories, acceptance criteria, or any text describing features to test...

Example:
As a user, I want to log in with my email and password so I can access my dashboard.
- Email must be valid format
- Password minimum 8 characters
- Show error for invalid credentials
- Remember me option available
- Redirect to dashboard after successful login"
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Target URL (optional)</label>
            <input
              v-model="aiInput.targetUrl"
              type="url"
              class="form-input"
              placeholder="https://example.com"
            />
          </div>
          <div>
            <label class="form-label">Add to Pack</label>
            <select v-model="aiInput.packId" class="form-input">
              <option value="">Create new pack</option>
              <option v-for="pack in testPacks" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
            </select>
          </div>
        </div>

        <div v-if="aiInput.packId === ''" class="pl-4 border-l-2 border-primary">
          <label class="form-label text-sm">New Pack Name</label>
          <input
            v-model="aiInput.newPackName"
            type="text"
            class="form-input"
            placeholder="e.g., Login Tests, Checkout Flow"
          />
        </div>

        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            id="aiGenerateCode"
            v-model="aiInput.generateCode"
            class="w-4 h-4 text-primary"
          />
          <label for="aiGenerateCode" class="text-body">
            Generate Playwright tests immediately after extraction
          </label>
        </div>

        <div v-if="aiError" class="p-3 bg-danger-soft rounded-lg flex items-center gap-2">
          <AlertCircle :size="18" class="text-danger" />
          <span class="text-danger text-sm">{{ aiError }}</span>
        </div>

        <div class="flex justify-end">
          <button
            @click="extractWithAI"
            :disabled="!aiInput.text.trim() || aiExtracting"
            class="btn btn-primary"
          >
            <Loader2 v-if="aiExtracting" :size="18" class="animate-spin" />
            <Bot v-else :size="18" />
            {{ aiExtracting ? 'Extracting...' : 'Extract Test Cases' }}
          </button>
        </div>
      </div>
    </div>

    <!-- AI Extraction Results -->
    <div v-if="importMode === 'ai' && aiResults.length > 0" class="card max-w-3xl mx-auto">
      <div class="card-header">
        <h2 class="card-title">Extracted Test Cases ({{ aiResults.length }})</h2>
        <p class="text-muted text-sm">Review and edit before importing</p>
      </div>
      <div class="card-body space-y-3">
        <div
          v-for="(tc, idx) in aiResults"
          :key="idx"
          class="p-3 border border-border rounded-lg"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <input
                v-model="tc.name"
                class="form-input font-medium mb-2"
                placeholder="Test case name"
              />
              <textarea
                v-model="tc.steps"
                rows="3"
                class="form-input text-sm"
                placeholder="Test steps"
              ></textarea>
              <textarea
                v-model="tc.expected"
                rows="2"
                class="form-input text-sm mt-2"
                placeholder="Expected results"
              ></textarea>
            </div>
            <button @click="aiResults.splice(idx, 1)" class="text-muted hover:text-danger">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>

        <button @click="addEmptyTestCase" class="btn btn-secondary w-full">
          <Plus :size="16" />
          Add Test Case
        </button>

        <div class="flex justify-end gap-3 pt-4 border-t border-border">
          <button @click="aiResults = []" class="btn btn-secondary">
            Cancel
          </button>
          <button
            @click="importAIResults"
            :disabled="aiResults.length === 0 || aiImporting"
            class="btn btn-primary"
          >
            <Loader2 v-if="aiImporting" :size="18" class="animate-spin" />
            <Package v-else :size="18" />
            {{ aiImporting ? 'Importing...' : `Import ${aiResults.length} Test Cases` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Paste Mode -->
    <div v-if="importMode === 'paste'" class="card max-w-4xl mx-auto">
      <div class="card-header">
        <h2 class="card-title flex items-center gap-2">
          <ClipboardPaste :size="20" class="text-primary" />
          Paste from Spreadsheet
        </h2>
        <p class="text-muted text-sm">Copy rows from Excel/Sheets and paste directly — headers in first row</p>
      </div>
      <div class="card-body space-y-4">
        <div>
          <label class="form-label">Paste Test Data Here</label>
          <textarea
            v-model="pasteInput.text"
            @paste="handlePaste"
            rows="10"
            class="form-input font-mono text-sm"
            placeholder="Copy from Excel or Google Sheets and paste here...

Example (tab-separated):
Name	Email	Password	Role
John Doe	john@example.com	pass123	admin
Jane Smith	jane@example.com	pass456	user"
          ></textarea>
          <p class="text-xs text-muted mt-1">Tip: Select cells in your spreadsheet, Ctrl/Cmd+C, then Ctrl/Cmd+V here</p>
        </div>

        <div v-if="pastePreview.headers.length > 0" class="overflow-x-auto border border-border rounded-lg">
          <table class="w-full text-sm">
            <thead class="bg-muted">
              <tr>
                <th v-for="h in pastePreview.headers" :key="h" class="px-3 py-2 text-left font-medium text-heading">
                  {{ h }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in pastePreview.rows.slice(0, 5)" :key="i" class="border-t border-border">
                <td v-for="h in pastePreview.headers" :key="h" class="px-3 py-2 text-body">
                  {{ row[h] }}
                </td>
              </tr>
              <tr v-if="pastePreview.rows.length > 5" class="border-t border-border bg-muted">
                <td :colspan="pastePreview.headers.length" class="px-3 py-2 text-center text-muted">
                  + {{ pastePreview.rows.length - 5 }} more rows
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Import As</label>
            <select v-model="pasteInput.importAs" class="form-input">
              <option value="testData">Test Data (for injection into specs)</option>
              <option value="testCases">Test Cases (creates specs)</option>
            </select>
          </div>
          <div v-if="pasteInput.importAs === 'testData'">
            <label class="form-label">Dataset Name</label>
            <input
              v-model="pasteInput.datasetName"
              type="text"
              class="form-input"
              placeholder="e.g., Test Users, Products"
            />
          </div>
        </div>

        <!-- Column mapping for test cases -->
        <div v-if="pasteInput.importAs === 'testCases' && pastePreview.headers.length > 0" class="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <label class="form-label text-sm">Test Name Column *</label>
            <select v-model="pasteInput.mappings.name" class="form-input">
              <option value="">Select...</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label text-sm">Steps Column *</label>
            <select v-model="pasteInput.mappings.steps" class="form-input">
              <option value="">Select...</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label text-sm">Expected Results</label>
            <select v-model="pasteInput.mappings.expected" class="form-input">
              <option value="">None</option>
              <option v-for="h in pastePreview.headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
          <div>
            <label class="form-label text-sm">Add to Pack</label>
            <select v-model="pasteInput.packId" class="form-input">
              <option value="">Create new pack</option>
              <option v-for="pack in testPacks" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
            </select>
          </div>
        </div>

        <div v-if="pasteError" class="p-3 bg-danger-soft rounded-lg flex items-center gap-2">
          <AlertCircle :size="18" class="text-danger" />
          <span class="text-danger text-sm">{{ pasteError }}</span>
        </div>

        <div class="flex justify-end">
          <button
            @click="importPastedData"
            :disabled="pastePreview.rows.length === 0 || pasteImporting"
            class="btn btn-primary"
          >
            <Loader2 v-if="pasteImporting" :size="18" class="animate-spin" />
            <Database v-else :size="18" />
            {{ pasteImporting ? 'Importing...' : `Import ${pastePreview.rows.length} Rows` }}
          </button>
        </div>
      </div>
    </div>

    <!-- CSV Mode - existing steps -->
    <template v-if="importMode === 'csv'">
    <!-- Step Indicator -->
    <div class="flex items-center justify-center gap-2 py-4">
      <template v-for="(step, index) in steps" :key="step.id">
        <div
          class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          :class="currentStep === step.id ? 'bg-primary text-white' : currentStep > step.id ? 'bg-success-soft text-success' : 'bg-muted text-muted'"
        >
          <component :is="currentStep > step.id ? CheckCircle : step.icon" :size="18" />
          <span class="font-medium">{{ step.label }}</span>
        </div>
        <ChevronRight v-if="index < steps.length - 1" :size="18" class="text-muted" />
      </template>
    </div>

    <!-- Step 1: Upload -->
    <div v-if="currentStep === 1" class="card max-w-2xl mx-auto">
      <div class="card-header">
        <h2 class="card-title">Upload CSV File</h2>
      </div>
      <div class="card-body">
        <div
          @dragenter.prevent="dragOver = true"
          @dragover.prevent="dragOver = true"
          @dragleave.self="dragOver = false"
          @drop.prevent="handleDrop"
          class="border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer"
          :class="dragOver ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary'"
          @click="$refs.fileInput.click()"
        >
          <Upload :size="48" class="mx-auto mb-4 text-muted" />
          <p class="text-heading font-medium mb-2">Drag and drop a CSV file here</p>
          <p class="text-muted text-sm">or click to browse</p>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            @change="handleFileSelect"
          />
        </div>

        <div v-if="fileName" class="mt-4 p-4 bg-success-soft rounded-lg flex items-center gap-3">
          <FileText :size="20" class="text-success" />
          <span class="font-medium text-success">{{ fileName }}</span>
          <span class="text-muted text-sm ml-auto">{{ rowCount }} rows</span>
        </div>

        <div v-if="uploadError" class="mt-4 p-4 bg-danger-soft rounded-lg flex items-center gap-3">
          <AlertCircle :size="20" class="text-danger" />
          <span class="text-danger">{{ uploadError }}</span>
        </div>

        <div class="flex justify-end mt-6">
          <button
            @click="previewCsv"
            :disabled="!csvContent || previewing"
            class="btn btn-primary"
          >
            {{ previewing ? 'Processing...' : 'Next: Map Columns' }}
            <ChevronRight :size="18" />
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: Map Columns -->
    <div v-if="currentStep === 2" class="card max-w-4xl mx-auto">
      <div class="card-header">
        <h2 class="card-title">Map CSV Columns</h2>
        <p class="text-muted text-sm">Select which columns contain test pack names, test cases, steps, and expected results</p>
      </div>
      <div class="card-body">
        <!-- Preview Table -->
        <div class="overflow-x-auto mb-6">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th v-for="header in headers" :key="header" class="px-3 py-2 text-left text-muted font-medium">
                  {{ header }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in preview" :key="i" class="border-b border-border">
                <td v-for="header in headers" :key="header" class="px-3 py-2 text-body truncate max-w-[200px]">
                  {{ row[header] }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Column Mappings -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-label text-label-color block mb-1">
              Test Pack Name <span class="text-danger">*</span>
            </label>
            <select v-model="mappings.testPack" class="input w-full">
              <option value="">Select column...</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
            <p class="text-muted text-xs mt-1">Groups tests into packs</p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">
              Test Case Name <span class="text-danger">*</span>
            </label>
            <select v-model="mappings.testCase" class="input w-full">
              <option value="">Select column...</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
            <p class="text-muted text-xs mt-1">Name of each test</p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">
              Test Steps <span class="text-danger">*</span>
            </label>
            <select v-model="mappings.testSteps" class="input w-full">
              <option value="">Select column...</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
            <p class="text-muted text-xs mt-1">Actions to perform</p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">
              Expected Results <span class="text-danger">*</span>
            </label>
            <select v-model="mappings.expectedResults" class="input w-full">
              <option value="">Select column...</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
            <p class="text-muted text-xs mt-1">What to verify</p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">URL (optional)</label>
            <select v-model="mappings.url" class="input w-full">
              <option value="">None</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">Tags (optional)</label>
            <select v-model="mappings.tags" class="input w-full">
              <option value="">None</option>
              <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
            </select>
          </div>
        </div>

        <div v-if="mappingError" class="mt-4 p-4 bg-danger-soft rounded-lg flex items-center gap-3">
          <AlertCircle :size="20" class="text-danger" />
          <span class="text-danger">{{ mappingError }}</span>
        </div>

        <div class="flex justify-between mt-6">
          <button @click="currentStep = 1" class="btn btn-secondary">
            <ArrowLeft :size="18" />
            Back
          </button>
          <button
            @click="validateMappings"
            :disabled="!mappingsComplete"
            class="btn btn-primary"
          >
            Next: Review
            <ChevronRight :size="18" />
          </button>
        </div>
      </div>
    </div>

    <!-- Step 3: Review -->
    <div v-if="currentStep === 3" class="card max-w-4xl mx-auto">
      <div class="card-header">
        <h2 class="card-title">Review Import</h2>
        <p class="text-muted text-sm">{{ Object.keys(groupedTests).length }} test packs, {{ totalTests }} tests</p>
      </div>
      <div class="card-body">
        <!-- Grouped Preview -->
        <div class="space-y-4 max-h-[400px] overflow-y-auto">
          <div v-for="(tests, packName) in groupedTests" :key="packName" class="border border-border rounded-lg">
            <div class="px-4 py-3 bg-muted flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Package :size="18" class="text-primary" />
                <span class="font-medium text-heading">{{ packName }}</span>
              </div>
              <span class="text-muted text-sm">{{ tests.length }} tests</span>
            </div>
            <div class="divide-y divide-border">
              <div v-for="(test, i) in tests.slice(0, 3)" :key="i" class="px-4 py-2 text-sm">
                <span class="text-body">{{ test.name }}</span>
              </div>
              <div v-if="tests.length > 3" class="px-4 py-2 text-sm text-muted">
                + {{ tests.length - 3 }} more tests
              </div>
            </div>
          </div>
        </div>

        <!-- Options -->
        <div class="mt-6 p-4 bg-muted rounded-lg space-y-4">
          <div class="space-y-1">
            <div class="flex items-center gap-3">
              <input
                type="checkbox"
                id="generateImmediately"
                v-model="options.generateImmediately"
                class="w-4 h-4 text-primary"
              />
              <label for="generateImmediately" class="text-body font-medium">
                Generate Playwright code during import
              </label>
            </div>
            <p class="text-xs text-muted pl-7">
              Not recommended. Code generated here has no page context and selectors will likely fail.
              Leave unchecked — after import, verify URLs in the pack and use <strong>Generate All</strong> to probe the real pages first.
            </p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">Default URL (optional)</label>
            <input
              type="url"
              v-model="options.defaultUrl"
              placeholder="https://example.com"
              class="input w-full"
            />
            <p class="text-muted text-xs mt-1">Applied to tests without a URL column</p>
          </div>

          <div>
            <label class="text-label text-label-color block mb-1">Assign to Team</label>
            <select v-model="options.teamId" class="input w-full">
              <option value="">No team</option>
              <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </div>
        </div>

        <div class="flex justify-between mt-6">
          <button @click="currentStep = 2" class="btn btn-secondary">
            <ArrowLeft :size="18" />
            Back
          </button>
          <button
            @click="startImport"
            class="btn btn-primary"
          >
            <Sparkles :size="18" />
            {{ options.generateImmediately ? 'Import & Generate' : 'Import Tests' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Step 4: Progress -->
    <div v-if="currentStep === 4" class="card max-w-3xl mx-auto">
      <div class="card-header">
        <h2 class="card-title">
          {{ importComplete ? 'Import Complete' : 'Importing Tests...' }}
        </h2>
      </div>
      <div class="card-body">
        <!-- Progress Bar -->
        <div v-if="!importComplete" class="mb-6">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-muted">{{ progressPhase }}</span>
            <span class="text-muted">{{ progressCurrent }} / {{ progressTotal }}</span>
          </div>
          <div class="h-2 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-primary transition-all duration-300"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>

        <!-- Current Action -->
        <div v-if="currentAction && !importComplete" class="p-4 bg-muted rounded-lg mb-4">
          <div class="flex items-center gap-2">
            <Loader2 :size="18" class="animate-spin text-primary" />
            <span class="text-body">{{ currentAction }}</span>
          </div>
        </div>

        <!-- Results Log -->
        <div class="max-h-[300px] overflow-y-auto space-y-2">
          <div
            v-for="(event, i) in progressEvents"
            :key="i"
            class="flex items-center gap-2 text-sm py-1"
          >
            <CheckCircle v-if="event.status === 'ready' || event.status === 'complete'" :size="16" class="text-success" />
            <XCircle v-else-if="event.status === 'failed'" :size="16" class="text-danger" />
            <Loader2 v-else-if="event.status === 'generating'" :size="16" class="animate-spin text-primary" />
            <span class="text-body">{{ event.message }}</span>
          </div>
        </div>

        <!-- Summary -->
        <div v-if="importComplete" class="mt-6 space-y-4">
          <div class="p-4 bg-success-soft rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <CheckCircle :size="20" class="text-success" />
              <span class="font-medium text-success">Import Complete</span>
            </div>
            <div class="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span class="text-muted">Packs:</span>
                <span class="font-medium ml-2">{{ summary.packs }}</span>
              </div>
              <div>
                <span class="text-muted">Tests:</span>
                <span class="font-medium ml-2">{{ summary.specs }}</span>
              </div>
              <div v-if="summary.generated">
                <span class="text-muted">Generated:</span>
                <span class="font-medium ml-2">{{ summary.generated }}</span>
              </div>
            </div>
          </div>

          <div v-if="!options.generateImmediately" class="p-4 border border-primary rounded-lg bg-primary-soft">
            <div class="flex items-start gap-3">
              <Sparkles :size="20" class="text-primary mt-0.5 shrink-0" />
              <div>
                <p class="font-medium text-heading text-sm mb-1">Next: Generate Playwright Code</p>
                <p class="text-sm text-body">
                  Open each test pack, check the URLs are correct, then click <strong>Generate All</strong>.
                  Aurora will probe the live pages and generate accurate Playwright selectors.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-center mt-6">
          <router-link v-if="importComplete" to="/tests" class="btn btn-primary">
            <Package :size="18" />
            View Test Packs
          </router-link>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import api, { getApiBaseUrl } from '@/lib/api'
import {
  Upload, FileText, ChevronRight, ArrowLeft, CheckCircle, AlertCircle,
  Package, Sparkles, Loader2, XCircle, Bot, ClipboardPaste, Database,
  Trash2, Plus
} from 'lucide-vue-next'

// Import mode tabs
const importTabs = [
  { id: 'csv', label: 'CSV File', icon: FileText },
  { id: 'paste', label: 'Paste Data', icon: ClipboardPaste },
  { id: 'ai', label: 'AI Extract', icon: Sparkles }
]
const importMode = ref('csv')

function switchImportMode(mode) {
  importMode.value = mode
}

// Test packs for selection
const testPacks = ref([])

async function loadTestPacks() {
  try {
    const { data } = await api.get('/api/agent-tests/packs')
    testPacks.value = data || []
  } catch (e) {
    testPacks.value = []
  }
}

// ─── AI Extraction Mode ───────────────────────────────────
const aiInput = reactive({
  text: '',
  targetUrl: '',
  packId: '',
  newPackName: '',
  generateCode: true
})
const aiExtracting = ref(false)
const aiError = ref('')
const aiResults = ref([])
const aiImporting = ref(false)

async function extractWithAI() {
  if (!aiInput.text.trim()) return
  aiExtracting.value = true
  aiError.value = ''
  aiResults.value = []

  try {
    const { data } = await api.post('/api/test-cases/extract', {
      text: aiInput.text,
      targetUrl: aiInput.targetUrl || null
    })
    aiResults.value = data.testCases || []
    if (aiResults.value.length === 0) {
      aiError.value = 'No test cases could be extracted. Try adding more detail.'
    }
  } catch (e) {
    aiError.value = e.response?.data?.error || 'Failed to extract test cases'
  } finally {
    aiExtracting.value = false
  }
}

function addEmptyTestCase() {
  aiResults.value.push({ name: '', steps: '', expected: '' })
}

async function importAIResults() {
  if (aiResults.value.length === 0) return
  aiImporting.value = true

  try {
    const payload = {
      testCases: aiResults.value.filter(tc => tc.name.trim() && tc.steps.trim()),
      targetUrl: aiInput.targetUrl || null,
      packId: aiInput.packId || null,
      newPackName: aiInput.newPackName || null,
      generateCode: aiInput.generateCode
    }
    await api.post('/api/test-cases/import-extracted', payload)
    // Redirect to tests page on success
    router.push('/tests')
  } catch (e) {
    aiError.value = e.response?.data?.error || 'Failed to import test cases'
  } finally {
    aiImporting.value = false
  }
}

// ─── Paste Mode ───────────────────────────────────────────
const pasteInput = reactive({
  text: '',
  importAs: 'testData',
  datasetName: '',
  packId: '',
  mappings: { name: '', steps: '', expected: '' }
})
const pastePreview = reactive({ headers: [], rows: [] })
const pasteError = ref('')
const pasteImporting = ref(false)

watch(() => pasteInput.text, (text) => {
  parsePastedText(text)
})

function handlePaste(e) {
  // Let default paste happen, watch will parse
}

function parsePastedText(text) {
  if (!text.trim()) {
    pastePreview.headers = []
    pastePreview.rows = []
    return
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return

  // Detect delimiter: tab or comma
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const headers = firstLine.split(delimiter).map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter)
    const row = {}
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim() })
    return row
  })

  pastePreview.headers = headers
  pastePreview.rows = rows

  // Auto-suggest dataset name from first header
  if (!pasteInput.datasetName && headers[0]) {
    pasteInput.datasetName = headers[0].replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Imported Data'
  }
}

async function importPastedData() {
  if (pastePreview.rows.length === 0) return
  pasteImporting.value = true
  pasteError.value = ''

  try {
    if (pasteInput.importAs === 'testData') {
      // Import as test data for injection
      const csvText = [
        pastePreview.headers.join(','),
        ...pastePreview.rows.map(row => pastePreview.headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`).join(','))
      ].join('\n')

      await api.post(`/api/test-data?filename=${encodeURIComponent(pasteInput.datasetName || 'Pasted Data')}.csv`, csvText, {
        headers: { 'Content-Type': 'text/plain' }
      })
      router.push('/tests')
    } else {
      // Import as test cases
      if (!pasteInput.mappings.name || !pasteInput.mappings.steps) {
        pasteError.value = 'Please map the Name and Steps columns'
        pasteImporting.value = false
        return
      }

      const testCases = pastePreview.rows
        .filter(row => row[pasteInput.mappings.name]?.trim())
        .map(row => ({
          name: row[pasteInput.mappings.name] || '',
          steps: row[pasteInput.mappings.steps] || '',
          expected: pasteInput.mappings.expected ? (row[pasteInput.mappings.expected] || '') : ''
        }))

      await api.post('/api/test-cases/import-extracted', {
        testCases,
        packId: pasteInput.packId || null,
        generateCode: false
      })
      router.push('/tests')
    }
  } catch (e) {
    pasteError.value = e.response?.data?.error || 'Failed to import data'
  } finally {
    pasteImporting.value = false
  }
}

const router = useRouter()

// Step configuration
const steps = [
  { id: 1, label: 'Upload', icon: Upload },
  { id: 2, label: 'Map Columns', icon: FileText },
  { id: 3, label: 'Review', icon: Package },
  { id: 4, label: 'Import', icon: Sparkles }
]

const currentStep = ref(1)

// Step 1: Upload state
const dragOver = ref(false)
const fileName = ref('')
const csvContent = ref('')
const rowCount = ref(0)
const uploadError = ref('')
const previewing = ref(false)

// Step 2: Mapping state
const headers = ref([])
const preview = ref([])
const mappings = ref({
  testPack: '',
  testCase: '',
  testSteps: '',
  expectedResults: '',
  url: '',
  tags: ''
})
const mappingError = ref('')

// Step 3: Review state
const groupedTests = ref({})
const totalTests = ref(0)
const options = ref({
  generateImmediately: false,
  defaultUrl: '',
  teamId: ''
})
const teams = ref([])

// Step 4: Progress state
const progressPhase = ref('')
const progressCurrent = ref(0)
const progressTotal = ref(0)
const currentAction = ref('')
const progressEvents = ref([])
const importComplete = ref(false)
const summary = ref({})

const mappingsComplete = computed(() => {
  return mappings.value.testPack &&
         mappings.value.testCase &&
         mappings.value.testSteps &&
         mappings.value.expectedResults
})

const progressPercent = computed(() => {
  if (progressTotal.value === 0) return 0
  return Math.round((progressCurrent.value / progressTotal.value) * 100)
})

// File handling
function handleFileSelect(e) {
  const file = e.target.files[0]
  if (file) processFile(file)
}

function handleDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer.files[0]
  if (file) processFile(file)
}

function processFile(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    uploadError.value = 'Please upload a CSV file'
    return
  }

  uploadError.value = ''
  fileName.value = file.name

  const reader = new FileReader()
  reader.onload = (e) => {
    csvContent.value = e.target.result
    // Quick count of rows
    const lines = csvContent.value.split('\n').filter(l => l.trim())
    rowCount.value = Math.max(0, lines.length - 1) // Exclude header
  }
  reader.readAsText(file)
}

// Preview CSV
async function previewCsv() {
  previewing.value = true
  uploadError.value = ''

  try {
    const { data } = await api.post('/api/test-cases/preview', {
      csv: csvContent.value
    })

    headers.value = data.headers
    preview.value = data.preview
    rowCount.value = data.rowCount

    // Apply suggestions
    if (data.suggestions) {
      mappings.value.testPack = data.suggestions.testPack || ''
      mappings.value.testCase = data.suggestions.testCase || ''
      mappings.value.testSteps = data.suggestions.testSteps || ''
      mappings.value.expectedResults = data.suggestions.expectedResults || ''
      mappings.value.url = data.suggestions.url || ''
      mappings.value.tags = data.suggestions.tags || ''
    }

    currentStep.value = 2
  } catch (error) {
    uploadError.value = error.response?.data?.error || 'Failed to parse CSV'
  } finally {
    previewing.value = false
  }
}

// Validate mappings and group tests
function validateMappings() {
  mappingError.value = ''

  const required = ['testPack', 'testCase', 'testSteps', 'expectedResults']
  const missing = required.filter(f => !mappings.value[f])

  if (missing.length > 0) {
    mappingError.value = `Please select columns for: ${missing.join(', ')}`
    return
  }

  // Group tests by pack name from preview data
  // We'll do a quick grouping from the full CSV
  const { rows } = parseCSVLocal(csvContent.value)
  const grouped = {}

  for (const row of rows) {
    const packName = (row[mappings.value.testPack] || '').trim()
    const testName = (row[mappings.value.testCase] || '').trim()

    if (!packName || !testName) continue

    if (!grouped[packName]) {
      grouped[packName] = []
    }
    grouped[packName].push({ name: testName })
  }

  groupedTests.value = grouped
  totalTests.value = Object.values(grouped).flat().length

  currentStep.value = 3
}

// Simple CSV parser for client-side preview
function parseCSVLocal(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line) {
    const fields = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++
        let val = ''
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { val += line[i++] }
        }
        fields.push(val)
        if (line[i] === ',') i++
      } else {
        let val = ''
        while (i < line.length && line[i] !== ',') val += line[i++]
        fields.push(val.trim())
        if (line[i] === ',') i++
      }
    }
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : '' })
    return row
  })

  return { headers, rows }
}

// Start import
async function startImport() {
  currentStep.value = 4
  progressEvents.value = []
  importComplete.value = false
  progressPhase.value = 'Starting import...'
  progressCurrent.value = 0
  progressTotal.value = totalTests.value

  try {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/test-cases/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: csvContent.value,
        mappings: mappings.value,
        options: {
          generateImmediately: options.value.generateImmediately,
          teamId: options.value.teamId || null,
          defaultUrl: options.value.defaultUrl || ''
        }
      })
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
            handleProgressEvent(event)
          } catch (e) {
            console.error('Failed to parse SSE event:', e)
          }
        }
      }
    }
  } catch (error) {
    console.error('Import error:', error)
    progressEvents.value.push({
      status: 'failed',
      message: `Error: ${error.message}`
    })
  }
}

function handleProgressEvent(event) {
  if (event.phase === 'import') {
    progressPhase.value = 'Importing test cases...'
    if (event.status === 'starting') {
      progressTotal.value = event.totalRows || totalTests.value
      progressEvents.value.push({ status: 'info', message: `Starting import of ${event.totalRows} rows...` })
    } else if (event.status === 'progress') {
      currentAction.value = `Creating pack: ${event.currentPack}`
      progressCurrent.value = event.createdSpecs || 0
    } else if (event.status === 'complete') {
      progressEvents.value.push({
        status: 'complete',
        message: `Created ${event.packs} packs with ${event.specs} tests`
      })
      if (event.skipped > 0) {
        progressEvents.value.push({
          status: 'warning',
          message: `Skipped ${event.skipped} rows (missing data)`
        })
      }
    }
  } else if (event.phase === 'generation') {
    progressPhase.value = 'Generating Playwright tests...'
    if (event.status === 'starting') {
      progressTotal.value = event.total
      progressCurrent.value = 0
      progressEvents.value.push({ status: 'info', message: 'Starting AI test generation...' })
    } else if (event.status === 'generating') {
      currentAction.value = `Generating: ${event.specName}`
      progressCurrent.value = event.current
    } else if (event.status === 'ready') {
      progressEvents.value.push({ status: 'ready', message: `Generated: ${event.specName}` })
      progressCurrent.value = event.current
    } else if (event.status === 'failed') {
      progressEvents.value.push({ status: 'failed', message: `Failed: ${event.specName} - ${event.error}` })
      progressCurrent.value = event.current
    } else if (event.status === 'complete') {
      progressEvents.value.push({
        status: 'complete',
        message: `Generation complete: ${event.generated} succeeded, ${event.failed} failed`
      })
    }
  } else if (event.phase === 'complete') {
    summary.value = event.summary
    importComplete.value = true
    currentAction.value = ''
    progressPhase.value = 'Complete'
  } else if (event.phase === 'error') {
    progressEvents.value.push({ status: 'failed', message: event.error })
  }
}

// Load teams
async function loadTeams() {
  try {
    const { data } = await api.get('/api/teams')
    teams.value = data
  } catch (error) {
    console.error('Failed to load teams:', error)
  }
}

onMounted(() => {
  loadTeams()
  loadTestPacks()
})
</script>
