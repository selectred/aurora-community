<template>
  <div class="space-y-6" data-testid="page-profile">
    <!-- Page Header -->
    <div>
      <p class="text-body text-body-color">Manage your profile and preferences</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Profile Information -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <User :size="20" class="text-primary" />
            Profile Information
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div>
            <label class="form-label">Name</label>
            <input
              v-model="formData.managerName"
              type="text"
              class="form-input max-w-xs"
              placeholder="Your name"
            />
          </div>
          <div>
            <label class="form-label">Email <span class="text-muted">(optional)</span></label>
            <input
              v-model="formData.email"
              type="email"
              class="form-input max-w-xs"
              placeholder="you@example.com"
            />
            <p class="text-xs text-muted mt-1">Used for test reports</p>
          </div>
          <div class="pt-2 flex items-center gap-3">
            <button
              @click="saveProfile"
              :disabled="saving"
              class="btn btn-primary"
              aria-label="Save Profile"
            >
              {{ saving ? 'Saving...' : 'Save Profile' }}
            </button>
            <span v-if="saveMessage" data-testid="toast-notification" role="status" class="text-sm" :class="saveSuccess ? 'text-success' : 'text-danger'">
              {{ saveMessage }}
            </span>
          </div>
        </div>
      </div>

      <!-- Setup Guide -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <BookOpen :size="20" class="text-primary" />
            Setup Guide
          </h2>
        </div>
        <div class="card-body">
          <p class="text-sm text-muted mb-4">
            Re-run the setup wizard to create features, initiatives and learn about Aurora's capabilities.
          </p>
          <button @click="router.push('/wizard')" class="btn btn-secondary">
            Launch Setup Guide
          </button>
        </div>
      </div>

      <!-- Appearance -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Palette :size="20" class="text-primary" />
            Appearance
          </h2>
        </div>
        <div class="card-body space-y-3">
          <div class="flex items-center justify-between p-3 border border-default rounded-lg">
            <div>
              <div class="font-medium text-sm text-heading">Dark Mode</div>
              <div class="text-xs text-muted mt-0.5">Switch between light and dark theme</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="themeStore.isDark" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- Theme Preview -->
          <div class="grid grid-cols-2 gap-3 mt-4">
            <button
              @click="themeStore.setTheme(false)"
              class="p-4 rounded-lg border-2 transition-all bg-white"
              :class="!themeStore.isDark ? 'border-primary' : 'border-border-default hover:border-primary/50'"
              aria-label="Switch to Light Mode"
            >
              <div class="flex items-center justify-center gap-2 mb-2">
                <Sun :size="20" :class="!themeStore.isDark ? 'text-primary' : 'text-muted'" />
                <span class="font-medium text-sm" :class="!themeStore.isDark ? 'text-primary' : 'text-muted'">Light</span>
              </div>
              <div class="h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
                <div class="w-8 h-2 bg-gray-300 rounded"></div>
              </div>
            </button>
            <button
              @click="themeStore.setTheme(true)"
              class="p-4 rounded-lg border-2 transition-all bg-gray-800"
              :class="themeStore.isDark ? 'border-primary' : 'border-gray-600 hover:border-primary/50'"
              aria-label="Switch to Dark Mode"
            >
              <div class="flex items-center justify-center gap-2 mb-2">
                <Moon :size="20" :class="themeStore.isDark ? 'text-primary' : 'text-gray-500'" />
                <span class="font-medium text-sm" :class="themeStore.isDark ? 'text-primary' : 'text-gray-500'">Dark</span>
              </div>
              <div class="h-12 rounded bg-gray-900 border border-gray-700 flex items-center justify-center">
                <div class="w-8 h-2 bg-gray-600 rounded"></div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- License Information -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title flex items-center gap-2">
            <Award :size="20" class="text-primary" />
            License
          </h2>
        </div>
        <div class="card-body space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Award :size="24" class="text-primary" />
            </div>
            <div>
              <div class="font-semibold text-heading">{{ appStore.licenseTierName }}</div>
              <div class="text-sm text-muted">Current license tier</div>
            </div>
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Features</span>
              <span class="text-heading">{{ licenseUsage.features }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Initiatives</span>
              <span class="text-heading">{{ licenseUsage.initiatives }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-default">
              <span class="text-muted">Test Packs</span>
              <span class="text-heading">{{ licenseUsage.testPacks }}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-muted">Synthetic Monitors</span>
              <span class="text-heading">{{ licenseUsage.synthetics }}</span>
            </div>
          </div>

          <RouterLink to="/settings/system" class="btn btn-secondary w-full mt-4">
            Manage License
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { User, Palette, Sun, Moon, Award, BookOpen } from 'lucide-vue-next'
import { useAppStore } from '@/stores/appStore'
import { useThemeStore } from '@/stores/themeStore'

const router = useRouter()
const appStore = useAppStore()
const themeStore = useThemeStore()

const formData = ref({
  managerName: '',
  email: ''
})

const saving = ref(false)
const saveMessage = ref('')
const saveSuccess = ref(false)

const licenseUsage = computed(() => {
  const license = appStore.license
  if (!license) return { features: '0', initiatives: '0', testPacks: '0', synthetics: '0' }

  const fmt = (current, max) => max === -1 ? `${current} / Unlimited` : `${current} / ${max}`

  return {
    features:    fmt(license.usage?.features    || 0, license.limits?.maxFeatures),
    initiatives: fmt(license.usage?.initiatives || 0, license.limits?.maxInitiatives),
    testPacks:   fmt(license.usage?.testPacks   || 0, license.limits?.maxTestPacks),
    synthetics:  fmt(license.usage?.synthetics  || 0, license.limits?.maxSyntheticMonitors)
  }
})

onMounted(async () => {
  // Fetch fresh profile data to ensure preferences (including notifications) are loaded
  await appStore.fetchProfile()
  if (appStore.settings) {
    formData.value.managerName = appStore.settings.managerName || ''
    formData.value.email = appStore.settings.email || ''
  }
})

async function saveProfile() {
  saving.value = true
  saveMessage.value = ''

  try {
    const result = await appStore.updateProfile({
      managerName: formData.value.managerName,
      email: formData.value.email
    })

    if (result.success) {
      saveSuccess.value = true
      saveMessage.value = 'Profile updated!'
    } else {
      saveSuccess.value = false
      saveMessage.value = result.error || 'Failed to update profile'
    }
  } catch (error) {
    saveSuccess.value = false
    saveMessage.value = 'An error occurred'
  } finally {
    saving.value = false
    setTimeout(() => { saveMessage.value = '' }, 3000)
  }
}
</script>
