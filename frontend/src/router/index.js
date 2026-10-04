import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '../stores/appStore'

// Lazy load components for better performance
const DashboardView = () => import('../views/DashboardView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const SyntheticsView = () => import('../views/SyntheticsView.vue')
const AgentTestsView = () => import('../views/AgentTestsView.vue')
const SetupView = () => import('../views/SetupView.vue')

const FunctionalTestsView = () => import('../views/FunctionalTestsView.vue')
const ApiTestsView = () => import('../views/ApiTestsView.vue')
const AgentTerminalView = () => import('../views/AgentTerminalView.vue')
const TestIDEView = () => import('../views/TestIDEView.vue')
const WizardView = () => import('../views/WizardView.vue')
const HelpView = () => import('../views/HelpView.vue')

const routes = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/setup',
    name: 'Setup',
    component: SetupView,
    meta: { requiresSetup: false }
  },
  // ── Monitoring ──────────────────────────────────────
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: DashboardView
  },
  {
    path: '/monitoring/functional',
    name: 'FunctionalTests',
    component: FunctionalTestsView
  },
  {
    path: '/monitoring/api',
    name: 'ApiTests',
    component: ApiTestsView
  },
  {
    path: '/monitoring/performance',
    name: 'PerformanceMonitoring',
    component: () => import('../views/PerformanceMonitoringView.vue')
  },
  {
    path: '/synthetics',
    name: 'Synthetics',
    component: SyntheticsView
  },
  // ── Performance (k6) ────────────────────────────────
  {
    path: '/performance',
    name: 'Performance',
    component: () => import('../views/PerformanceView.vue')
  },
  {
    path: '/performance/scripts/:id',
    name: 'PerfScript',
    component: () => import('../views/PerfScriptView.vue')
  },
  {
    path: '/performance/scenarios/:id',
    name: 'PerfScenario',
    component: () => import('../views/PerfScenarioView.vue')
  },
  {
    path: '/performance/runs/:id',
    name: 'PerfRun',
    component: () => import('../views/PerfRunView.vue')
  },
  // ── Testing ─────────────────────────────────────────
  {
    path: '/testing/generator',
    name: 'TestGenerator',
    component: TestIDEView
  },
  {
    path: '/testing/generator-legacy',
    name: 'TestGeneratorLegacy',
    component: AgentTerminalView
  },
  {
    path: '/testing/packs',
    name: 'TestPacks',
    component: AgentTestsView
  },
  {
    path: '/testing/bugs',
    name: 'BugReports',
    component: () => import('@/components/BugReportsView.vue')
  },
  {
    path: '/testing/requirements',
    name: 'Requirements',
    component: () => import('../views/RequirementsView.vue')
  },
  {
    path: '/testing/import',
    name: 'CsvImport',
    component: () => import('../views/CsvImportView.vue')
  },
  // ── Setup Wizard ─────────────────────────────────────
  {
    path: '/wizard',
    name: 'Wizard',
    component: WizardView
  },
  // ── Help ─────────────────────────────────────────────
  {
    path: '/help',
    name: 'Help',
    component: HelpView
  },
  // ── Legacy redirects ─────────────────────────────────
  { path: '/view/team',      redirect: '/dashboard' },
  { path: '/view/manager',   redirect: '/dashboard' },
  { path: '/view/executive', redirect: '/dashboard' },
  { path: '/views/summary',    redirect: '/dashboard' },
  { path: '/views/initiatives', redirect: '/dashboard' },
  { path: '/tests',          redirect: '/testing/packs' },
  { path: '/tests/terminal', redirect: '/testing/generator' },
  { path: '/tests/packs',    redirect: '/testing/packs' },
  { path: '/tests/functional', redirect: '/monitoring/functional' },
  { path: '/tests/api',      redirect: '/monitoring/api' },
  { path: '/agent-tests',    redirect: '/testing/packs' },
  { path: '/tests/agent',    redirect: '/testing/packs' },
  { path: '/bug-reports',    redirect: '/testing/bugs' },
  { path: '/login',          redirect: '/setup' },
  // ── Settings ─────────────────────────────────────────
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    redirect: '/settings/profile',
    children: [
      {
        path: 'profile',
        name: 'ProfileSettings',
        component: () => import('@/components/Settings/ProfileSettings.vue')
      },
      {
        path: 'features',
        name: 'FeaturesSettings',
        component: () => import('@/components/Settings/FeaturesSettings.vue')
      },
      {
        path: 'teams',
        name: 'TeamManagement',
        component: () => import('@/components/Settings/TeamManagement.vue')
      },
      {
        path: 'synthetics',
        name: 'SyntheticSettings',
        component: () => import('@/components/Settings/SyntheticSettings.vue')
      },
      {
        path: 'performance',
        name: 'PerformanceSettings',
        component: () => import('@/components/Settings/PerformanceSettings.vue')
      },
      {
        path: 'initiatives',
        name: 'InitiativeSettings',
        component: () => import('@/components/Settings/InitiativeSettings.vue')
      },
      {
        path: 'system',
        name: 'SystemSettings',
        component: () => import('@/components/Settings/SystemSettings.vue')
      },
      {
        path: 'data',
        name: 'DataSettings',
        component: () => import('@/components/Settings/DataSettings.vue')
      },
      {
        path: 'prompts',
        name: 'PromptsSettings',
        component: () => import('@/components/Settings/PromptsSettings.vue')
      },
      {
        path: 'tracker',
        name: 'TrackerSettings',
        component: () => import('@/components/Settings/TrackerSettings.vue')
      },
      {
        path: 'continuum',
        name: 'ContinuumSettings',
        component: () => import('@/components/Settings/ContinuumSettings.vue')
      },
      {
        path: 'environments',
        name: 'EnvironmentsSettings',
        component: () => import('@/components/Settings/EnvironmentsSettings.vue')
      },
      {
        path: 'llm',
        name: 'LLMHealthSettings',
        component: () => import('@/components/Settings/LLMHealthSettings.vue')
      },
      {
        path: 'variables',
        name: 'VariablesSettings',
        component: () => import('@/components/Settings/VariablesSettings.vue')
      },
      // Legacy redirects
      { path: 'user', redirect: '/settings/profile' },
      { path: 'team', redirect: '/settings/teams' }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Navigation guard - redirect to setup if not completed
router.beforeEach(async (to, _from, next) => {
  const appStore = useAppStore()

  // Wait for app to be ready
  if (!appStore.isReady) {
    await appStore.checkStatus()
  }

  // Allow setup page always
  if (to.name === 'Setup') {
    // If setup is already completed, redirect to dashboard
    if (appStore.setupCompleted) {
      next('/dashboard')
      return
    }
    next()
    return
  }

  // Redirect to setup if not completed
  if (!appStore.setupCompleted) {
    next('/setup')
    return
  }

  next()
})

export default router
