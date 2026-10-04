<template>
  <div class="space-y-4" data-testid="page-help">
    <!-- Search bar -->
    <div class="relative">
      <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search help documentation..."
        class="form-input pl-9"
      />
    </div>

    <div class="flex gap-5 items-start">
      <!-- Sidebar -->
      <div class="w-52 flex-shrink-0">
        <div class="card p-2 sticky top-4">
          <div v-if="filteredTopics.length === 0" class="text-sm text-muted px-3 py-4 text-center">
            No results for "{{ searchQuery }}"
          </div>
          <button
            v-for="topic in filteredTopics"
            :key="topic.id"
            @click="selectTopic(topic)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
              activeTopic?.id === topic.id
                ? 'bg-primary text-white font-medium'
                : 'text-body-color hover:bg-surface'
            ]"
          >
            <component :is="topic.icon" :size="15" class="flex-shrink-0" />
            <span class="truncate">{{ topic.label }}</span>
          </button>
        </div>
      </div>

      <!-- Content area -->
      <div class="flex-1 card min-w-0">
        <div class="p-6 md:p-8">
          <div
            v-if="activeTopic"
            v-html="renderedContent"
            class="help-content"
          />
          <div v-else class="text-center py-16 text-muted">
            <BookOpen :size="40" class="mx-auto mb-4 opacity-30" />
            <p>Select a topic from the sidebar to get started.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import {
  Search, BookOpen, LayoutDashboard, Boxes, Zap,
  Package, Activity, Target, Settings, HelpCircle, Bug, Gauge
} from 'lucide-vue-next'

import gettingStartedMd from '@/help/getting-started.md?raw'
import dashboardMd      from '@/help/dashboard.md?raw'
import featuresMd       from '@/help/features.md?raw'
import testGeneratorMd  from '@/help/test-generator.md?raw'
import testPacksMd      from '@/help/test-packs.md?raw'
import bugReportsMd     from '@/help/bug-reports.md?raw'
import syntheticsMd     from '@/help/synthetics.md?raw'
import performanceMd    from '@/help/performance.md?raw'
import initiativesMd    from '@/help/initiatives.md?raw'
import settingsMd       from '@/help/settings.md?raw'
import faqMd            from '@/help/faq.md?raw'

// Configure marked
marked.setOptions({ gfm: true, breaks: false })

const topics = [
  { id: 'getting-started', label: 'Getting Started', icon: BookOpen,        content: gettingStartedMd },
  { id: 'dashboard',       label: 'Dashboard',        icon: LayoutDashboard, content: dashboardMd      },
  { id: 'features',        label: 'Features',          icon: Boxes,           content: featuresMd       },
  { id: 'test-generator',  label: 'Test Generator',    icon: Zap,             content: testGeneratorMd  },
  { id: 'test-packs',      label: 'Test Packs',        icon: Package,         content: testPacksMd      },
  { id: 'bug-reports',     label: 'Bug Reports',       icon: Bug,             content: bugReportsMd     },
  { id: 'performance',     label: 'Performance Tests', icon: Gauge,           content: performanceMd    },
  { id: 'synthetics',      label: 'Synthetics',        icon: Activity,        content: syntheticsMd     },
  { id: 'initiatives',     label: 'Initiatives',       icon: Target,          content: initiativesMd    },
  { id: 'settings',        label: 'Settings',          icon: Settings,        content: settingsMd       },
  { id: 'faq',             label: 'FAQ',               icon: HelpCircle,      content: faqMd            },
]

const searchQuery  = ref('')
const activeTopic  = ref(topics[0])

const filteredTopics = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return topics
  return topics.filter(t =>
    t.label.toLowerCase().includes(q) ||
    t.content.toLowerCase().includes(q)
  )
})

const renderedContent = computed(() => {
  if (!activeTopic.value) return ''
  return marked(activeTopic.value.content)
})

function selectTopic(topic) {
  activeTopic.value = topic
  searchQuery.value = ''
  // Scroll content to top
  document.querySelector('.help-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// If search filters to one result and user clicks it, show it
onMounted(() => {
  activeTopic.value = topics[0]
})
</script>

<style scoped>
.help-content :deep(h1) {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-heading);
  margin-bottom: 0.5rem;
  line-height: 1.25;
}
.help-content :deep(h2) {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-heading);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--color-border-default);
}
.help-content :deep(h3) {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}
.help-content :deep(p) {
  color: var(--color-body);
  line-height: 1.7;
  margin-bottom: 0.75rem;
}
.help-content :deep(ul),
.help-content :deep(ol) {
  color: var(--color-body);
  margin-left: 1.25rem;
  margin-bottom: 0.75rem;
  line-height: 1.7;
}
.help-content :deep(ul) {
  list-style-type: disc;
}
.help-content :deep(ol) {
  list-style-type: decimal;
}
.help-content :deep(li) {
  margin-bottom: 0.25rem;
}
.help-content :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
}
.help-content :deep(strong) {
  font-weight: 600;
  color: var(--color-heading);
}
.help-content :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-primary);
}
.help-content :deep(pre) {
  background: var(--color-surface);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  padding: 1rem;
  overflow-x: auto;
  margin-bottom: 1rem;
}
.help-content :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--color-body);
  font-size: 0.85rem;
}
.help-content :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding: 0.5rem 1rem;
  margin: 1rem 0;
  background: var(--color-primary-soft, rgba(115, 103, 240, 0.08));
  border-radius: 0 6px 6px 0;
}
.help-content :deep(blockquote p) {
  margin-bottom: 0;
  font-size: 0.9rem;
}
.help-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.help-content :deep(th) {
  text-align: left;
  font-weight: 600;
  color: var(--color-heading);
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--color-border-default);
  background: var(--color-surface);
}
.help-content :deep(td) {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-body);
  vertical-align: top;
}
.help-content :deep(tr:last-child td) {
  border-bottom: none;
}
.help-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border-default);
  margin: 1.75rem 0;
}
</style>
