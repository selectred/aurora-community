<template>
  <div id="app" class="min-h-screen" :class="themeStore.isDark ? 'dark' : 'light'">
    <!-- Loading state -->
    <div v-if="!appStore.isReady" class="h-screen bg-background flex items-center justify-center">
      <div class="text-center">
        <Loader2 :size="32" class="animate-spin text-primary mx-auto mb-4" />
        <p class="text-muted">Loading Aurora...</p>
      </div>
    </div>

    <!-- Setup page - full screen without sidebar -->
    <div v-else-if="isSetupPage" class="h-screen bg-background">
      <RouterView />
    </div>

    <!-- Wizard — full screen without sidebar -->
    <div v-else-if="isWizardPage" class="h-screen bg-background">
      <RouterView />
    </div>

    <!-- Generator window — no sidebar, minimal chrome -->
    <div v-else-if="isGeneratorWindow" class="h-screen bg-background flex flex-col overflow-hidden">
      <div class="generator-titlebar" data-tauri-drag-region>
        <span class="generator-titlebar-title">Test Generator</span>
        <button @click="hideGeneratorWindow" class="generator-close-btn" title="Close">
          <X :size="14" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <RouterView />
      </div>
    </div>

    <!-- Settings window — no sidebar, settings-specific chrome -->
    <div v-else-if="isSettingsWindow" class="h-screen bg-background flex flex-col overflow-hidden">
      <div class="settings-titlebar" data-tauri-drag-region>
        <span class="settings-titlebar-title">Settings</span>
        <button @click="hideSettingsWindow" class="settings-close-btn" title="Close">
          <X :size="14" />
        </button>
      </div>
      <div class="settings-body">
        <nav class="settings-window-nav">
          <RouterLink to="/settings/profile" class="settings-nav-link" :class="{ active: route.path === '/settings/profile' }">
            <User class="settings-nav-icon" />
            Profile
          </RouterLink>
          <RouterLink to="/settings/initiatives" class="settings-nav-link" :class="{ active: route.path === '/settings/initiatives' }">
            <Target class="settings-nav-icon" />
            Initiatives
          </RouterLink>
          <RouterLink to="/settings/features" class="settings-nav-link" :class="{ active: route.path === '/settings/features' }">
            <Layers class="settings-nav-icon" />
            Features
          </RouterLink>
          <RouterLink to="/settings/synthetics" class="settings-nav-link" :class="{ active: route.path === '/settings/synthetics' }">
            <Gauge class="settings-nav-icon" />
            Synthetics
          </RouterLink>
          <RouterLink to="/settings/performance" class="settings-nav-link" :class="{ active: route.path === '/settings/performance' }">
            <Timer class="settings-nav-icon" />
            Performance
          </RouterLink>
          <RouterLink to="/settings/system" class="settings-nav-link" :class="{ active: route.path === '/settings/system' }">
            <Cog class="settings-nav-icon" />
            System
          </RouterLink>
          <RouterLink to="/settings/data" class="settings-nav-link" :class="{ active: route.path === '/settings/data' }">
            <DatabaseBackup class="settings-nav-icon" />
            Backup
          </RouterLink>
          <RouterLink to="/settings/prompts" class="settings-nav-link" :class="{ active: route.path === '/settings/prompts' }">
            <BrainCircuit class="settings-nav-icon" />
            AI Prompts
          </RouterLink>
          <RouterLink to="/settings/tracker" class="settings-nav-link" :class="{ active: route.path === '/settings/tracker' }">
            <Ticket class="settings-nav-icon" />
            Issue Tracker
          </RouterLink>
          <RouterLink to="/settings/continuum" class="settings-nav-link" :class="{ active: route.path === '/settings/continuum' }">
            <Link2 class="settings-nav-icon" />
            Continuum
          </RouterLink>
          <RouterLink to="/settings/environments" class="settings-nav-link" :class="{ active: route.path === '/settings/environments' }">
            <Globe class="settings-nav-icon" />
            Environments
          </RouterLink>
          <RouterLink to="/settings/llm" class="settings-nav-link" :class="{ active: route.path === '/settings/llm' }">
            <Activity class="settings-nav-icon" />
            AI Health
          </RouterLink>
          <RouterLink to="/settings/variables" class="settings-nav-link" :class="{ active: route.path === '/settings/variables' }">
            <KeyRound class="settings-nav-icon" />
            Variables
          </RouterLink>
        </nav>
        <div class="settings-window-content">
          <RouterView />
        </div>
      </div>
    </div>

    <!-- Main layout with sidebar and top nav -->
    <div v-else class="min-h-screen bg-background">
      <!-- Sidebar -->
      <aside class="sidebar">
        <!-- macOS traffic-light drag region — sits above the logo, height matches the hidden title bar -->
        <div class="traffic-light-region" data-tauri-drag-region></div>

        <!-- Logo -->
        <div class="sidebar-logo">
          <RouterLink to="/dashboard" class="flex items-center hover:opacity-80 transition-opacity">
            <img src="/Logo.jpg" alt="Aurora" class="h-10 w-auto rounded" width="120" height="40" draggable="false" />
          </RouterLink>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <!-- Monitoring Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-title">Monitoring</div>
            <RouterLink
              to="/dashboard"
              class="sidebar-link"
              :class="{ active: route.path === '/dashboard' }"
              data-testid="nav-dashboard"
            >
              <LayoutDashboard class="sidebar-link-icon" />
              Overview
            </RouterLink>
            <RouterLink
              to="/monitoring/functional"
              class="sidebar-link"
              :class="{ active: route.path === '/monitoring/functional' }"
              data-testid="nav-functional"
            >
              <TestTube2 class="sidebar-link-icon" />
              Functional
            </RouterLink>
            <RouterLink
              to="/monitoring/api"
              class="sidebar-link"
              :class="{ active: route.path === '/monitoring/api' }"
              data-testid="nav-api"
            >
              <Code2 class="sidebar-link-icon" />
              API Tests
            </RouterLink>
            <RouterLink
              to="/monitoring/performance"
              class="sidebar-link"
              :class="{ active: route.path === '/monitoring/performance' }"
              data-testid="nav-performance-monitoring"
            >
              <Timer class="sidebar-link-icon" />
              Performance
            </RouterLink>
            <RouterLink
              to="/synthetics"
              class="sidebar-link"
              :class="{ active: route.path === '/synthetics' }"
              data-testid="nav-synthetics"
            >
              <Activity class="sidebar-link-icon" />
              Synthetics
            </RouterLink>
          </div>

          <!-- Testing Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-title">Testing</div>
            <RouterLink
              to="/testing/requirements"
              class="sidebar-link"
              :class="{ active: route.path === '/testing/requirements' }"
              data-testid="nav-requirements"
            >
              <ClipboardCheck class="sidebar-link-icon" />
              Requirements
            </RouterLink>
            <button
              @click="openGeneratorWindow"
              class="sidebar-link w-full"
              data-testid="nav-test-generator"
            >
              <Terminal class="sidebar-link-icon" />
              Test Generator
            </button>
            <RouterLink
              to="/testing/packs"
              class="sidebar-link"
              :class="{ active: route.path === '/testing/packs' }"
              data-testid="nav-test-packs"
            >
              <Package class="sidebar-link-icon" />
              Test Packs
            </RouterLink>
            <RouterLink
              to="/performance"
              class="sidebar-link"
              :class="{ active: route.path.startsWith('/performance') }"
              data-testid="nav-performance"
            >
              <Gauge class="sidebar-link-icon" />
              Performance Tests
            </RouterLink>
            <RouterLink
              to="/testing/bugs"
              class="sidebar-link"
              :class="{ active: route.path === '/testing/bugs' }"
              data-testid="nav-bug-reports"
            >
              <Bug class="sidebar-link-icon" />
              Bug Reports
            </RouterLink>
          </div>

          <!-- Help Section -->
          <div class="sidebar-section">
            <RouterLink
              to="/help"
              class="sidebar-link"
              :class="{ active: route.path.startsWith('/help') }"
              data-testid="nav-help"
            >
              <HelpCircle class="sidebar-link-icon" />
              Help & Documentation
            </RouterLink>
          </div>

          <!-- Configuration Section -->
          <div class="sidebar-section">
            <div class="sidebar-section-title">Configuration</div>
            <button
              @click="openSettingsWindow"
              class="sidebar-link w-full"
              data-testid="nav-settings"
            >
              <Settings class="sidebar-link-icon" />
              Settings
            </button>
          </div>
        </nav>

        <!-- Manager Section -->
        <div class="sidebar-footer relative">
          <!-- User menu popup (opens upward) -->
          <Transition name="user-menu">
            <div v-if="userMenuOpen" class="user-menu-popup">
              <RouterLink
                to="/settings/profile"
                class="user-menu-item"
                @click="userMenuOpen = false"
              >
                <User :size="14" />
                Profile Settings
              </RouterLink>
              <div class="user-menu-divider" />
              <button class="user-menu-item user-menu-signout" @click="handleSignOut">
                <LogOut :size="14" />
                Sign Out
              </button>
            </div>
          </Transition>

          <button
            class="user-trigger w-full"
            @click="userMenuOpen = !userMenuOpen"
            :aria-expanded="userMenuOpen"
            aria-label="Account menu"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {{ appStore.initials }}
              </div>
              <div class="flex-1 min-w-0 text-left">
                <div class="text-sm font-medium text-heading truncate">{{ appStore.managerName }}</div>
                <div class="text-xs text-muted truncate">{{ appStore.licenseTier === 'community' ? appStore.licenseTierName : `${appStore.licenseTierName} License` }}</div>
              </div>
            </div>
            <ChevronDown
              :size="14"
              class="shrink-0 text-muted transition-transform duration-200"
              :class="userMenuOpen ? 'rotate-180' : ''"
            />
          </button>
        </div>
      </aside>

      <!-- Top Navigation -->
      <header class="topnav">
        <div class="topnav-left">
          <h1 class="text-page-title">{{ pageTitle }}</h1>
        </div>
        <!-- Drag handle — fills the centre gap, no interactive children -->
        <div class="topnav-drag" data-tauri-drag-region></div>
        <div class="topnav-right">
          <!-- Theme Toggle -->
          <button
            @click="themeStore.toggleTheme"
            class="btn btn-icon btn-secondary"
            :title="themeStore.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <Sun v-if="themeStore.isDark" :size="18" />
            <Moon v-else :size="18" />
          </button>
        </div>
      </header>


      <!-- Storage health banner — shown when file-backed packs have missing files -->
      <div
        v-if="storageHealthBanner"
        class="fixed top-0 left-0 right-0 z-50 bg-warning text-white text-sm flex items-center justify-between px-4 py-2"
        style="margin-left: var(--sidebar-width, 260px)"
      >
        <span>
          Some file-backed test packs are missing from disk. Check
          <RouterLink to="/settings/system" class="underline font-medium">Pack Storage settings</RouterLink>
          to reconfigure the packs directory.
        </span>
        <button @click="storageHealthBanner = false" class="ml-4 opacity-80 hover:opacity-100">✕</button>
      </div>

      <!-- Main Content -->
      <main ref="mainContent" class="main-content">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <Transition name="fade">
            <component :is="Component" :key="viewRoute.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from './stores/appStore'
import api from './lib/api'
import { openGeneratorWindow as openGeneratorWindowShared } from './lib/windows'
import { useThemeStore } from './stores/themeStore'
import {
  LayoutDashboard,
  Timer,
  Activity,
  Package,
  Settings,
  User,
  Users,
  Boxes,
  Cog,
  Gauge,
  Target,
  HelpCircle,
  ChevronDown,
  TestTube2,
  Code2,
  Sun,
  Moon,
  Terminal,
  Loader2,
  DatabaseBackup,
  Bug,
  LogOut,
  BrainCircuit,
  Link2,
  Layers,
  X,
  DatabaseZap,
  Globe,
  KeyRound,
  ClipboardCheck,
  Ticket
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const themeStore = useThemeStore()

// Window context — detect whether we're in the generator window
const windowLabel = ref('main')
const isGeneratorWindow = computed(() => windowLabel.value === 'generator')
const isSettingsWindow = computed(() =>
  windowLabel.value === 'settings' ||
  (!window.__TAURI__ && route.path.startsWith('/settings'))
)

function openGeneratorWindow() {
  return openGeneratorWindowShared(router)
}

async function hideGeneratorWindow() {
  if (!window.__TAURI__) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

async function openSettingsWindow() {
  if (!window.__TAURI__) {
    router.push('/settings/profile')
    return
  }
  const { Window } = await import('@tauri-apps/api/window')
  const win = await Window.getByLabel('settings')
  if (win) {
    await win.show()
    await win.setFocus()
  }
}

async function hideSettingsWindow() {
  if (!window.__TAURI__) {
    router.push('/dashboard')
    return
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

// Menu states
const userMenuOpen = ref(false)
const storageHealthBanner = ref(false)
const licenseWarningBannerDismissed = ref(false)
const licenseLockBannerDismissed = ref(false)
const mainContent = ref(null)

// Scroll to top on every route change
watch(() => route.path, () => {
  if (mainContent.value) mainContent.value.scrollTop = 0
})

// Page title based on current route
const pageTitle = computed(() => {
  const titles = {
    '/dashboard': 'Overview',
    '/monitoring/functional': 'Functional Tests',
    '/monitoring/api': 'API Tests',
    '/monitoring/performance': 'Performance',
    '/performance': 'Performance Tests',
    '/synthetics': 'Synthetic Monitoring',
    '/testing/requirements': 'Requirements',
    '/testing/generator': 'Test Generator',
    '/testing/packs': 'Test Packs',
    '/testing/bugs': 'Bug Reports',
    '/help': 'Help & Documentation',
    '/settings/profile': 'Profile Settings',
    '/settings/teams': 'Features',
    '/settings/synthetics': 'Synthetic Settings',
    '/settings/performance': 'Performance Settings',
    '/settings/initiatives': 'Initiative Settings',
    '/settings/system': 'System Settings',
    '/settings/data': 'Backup',
    '/settings/prompts': 'AI Prompts',
    '/settings/tracker': 'Issue Tracker',
    '/settings/continuum': 'Continuum Integration',
    '/settings/llm': 'AI Health',
  }
  return titles[route.path] || (route.path.startsWith('/performance/') ? 'Performance Tests' : 'Aurora')
})

// Check if current page is setup or wizard
const isSetupPage = computed(() => route.name === 'Setup')
const isWizardPage = computed(() => route.name === 'Wizard')

async function handleSignOut() {
  userMenuOpen.value = false
  await appStore.logout()
  router.push('/setup')
}

// Close user menu on route change
watch(() => route.path, () => { userMenuOpen.value = false })

async function checkStorageHealth() {
  try {
    const response = await api.get('/api/agent-tests/storage-health')
    if (response.data && !response.data.healthy && response.data.missingFiles?.length > 0) {
      storageHealthBanner.value = true
    }
  } catch {
    // Non-critical — silently ignore if the endpoint fails
  }
}

// Initialize app on mount
onMounted(async () => {
  // Detect which Tauri window we're in
  if (window.__TAURI__) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    windowLabel.value = win.label

    if (win.label === 'generator') {
      router.replace('/testing/generator')
      await win.onCloseRequested(async (event) => {
        event.preventDefault()
        await win.hide()
      })
      await appStore.initialize()
      return
    }

    if (win.label === 'settings') {
      router.replace('/settings/profile')
      await win.onCloseRequested(async (event) => {
        event.preventDefault()
        await win.hide()
      })
      await appStore.initialize()
      return
    }
  }

  // Cmd+, shortcut opens settings window (main window only)
  window.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      await openSettingsWindow()
    }
  })

  // Main window init
  await appStore.initialize()

  // Redirect to setup if not completed
  if (!appStore.setupCompleted && route.name !== 'Setup') {
    router.push('/setup')
  }

  // Auto-launch wizard on first use after setup
  if (
    appStore.setupCompleted &&
    !localStorage.getItem('aurora_wizard_completed') &&
    route.name !== 'Wizard' &&
    route.name !== 'Setup'
  ) {
    router.push('/wizard')
  }

  // Check for missing file-backed packs (non-blocking)
  checkStorageHealth()
})
</script>

<style scoped>
/* Fade transition for route changes */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ── User trigger button ── */
.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
  text-align: left;
}
.user-trigger:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border);
}

/* ── User menu popup ── */
.user-menu-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  z-index: 100;
}

.user-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 14px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-body);
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.12s ease, color 0.12s ease;
}
.user-menu-item:hover {
  background: var(--color-surface-2);
  color: var(--color-text-heading);
}

.user-menu-signout { color: var(--color-danger); }
.user-menu-signout:hover { background: rgba(234, 84, 85, 0.08); color: var(--color-danger); }

.user-menu-divider {
  height: 1px;
  background: var(--color-border);
  margin: 2px 0;
}

/* Menu transition */
.user-menu-enter-active { transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1); }
.user-menu-leave-active { transition: all 0.1s ease-in; }
.user-menu-enter-from  { opacity: 0; transform: translateY(6px); }
.user-menu-leave-to    { opacity: 0; transform: translateY(4px); }

/* ── Generator window chrome ── */
.generator-titlebar {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 80px; /* clear macOS traffic lights */
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--bg-sidebar, var(--bg-card));
  user-select: none;
}
.generator-titlebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.generator-close-btn {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-app-region: no-drag;
}
.generator-close-btn:hover {
  background: var(--color-surface-2);
  color: var(--text-heading);
}

/* ── Settings window chrome ── */
.settings-titlebar {
  position: relative;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 80px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
  background: var(--bg-sidebar, var(--bg-card));
  user-select: none;
}
.settings-titlebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}
.settings-close-btn {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-app-region: no-drag;
}
.settings-close-btn:hover {
  background: var(--color-surface-2);
  color: var(--text-heading);
}
.settings-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.settings-window-nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--bg-sidebar, var(--bg-card));
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.settings-nav-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-body);
  text-decoration: none;
  transition: background 0.12s, color 0.12s;
}
.settings-nav-link:hover {
  background: var(--color-surface-2);
  color: var(--color-text-heading);
}
.settings-nav-link.active {
  background: var(--color-primary);
  color: #fff;
}
.settings-nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.settings-window-content {
  flex: 1;
  overflow-y: auto;
}
</style>
