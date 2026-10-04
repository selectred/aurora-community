import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/lib/api'

export const useAppStore = defineStore('app', () => {
  // State
  const settings = ref(null)
  const license = ref(null)
  const isReady = ref(false)
  const setupCompleted = ref(false)

  // Computed
  const managerName = computed(() => settings.value?.managerName || 'Manager')
  const email = computed(() => settings.value?.email || '')
  const initials = computed(() => {
    const name = managerName.value
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  })

  const licenseTier = computed(() => license.value?.tier || 'free')
  const licenseTierName = computed(() => license.value?.tierName || 'Free')
  const licenseWarning = computed(() => license.value?.validationWarning === true)
  const licenseLocked = computed(() => license.value?.locked === true)
  const licenseDaysUntilLock = computed(() => license.value?.daysUntilLock ?? null)

  // Check app status on load — retries while backend is starting (Tauri sidecar)
  async function checkStatus() {
    const maxAttempts = 12
    const delay = ms => new Promise(r => setTimeout(r, ms))
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await api.get('/api/auth/status')
        setupCompleted.value = response.data.setupCompleted
        if (response.data.managerName) {
          settings.value = { managerName: response.data.managerName }
        }
        license.value = response.data.license
        isReady.value = true
        return { success: true, setupCompleted: setupCompleted.value }
      } catch (error) {
        const isNetworkError = !error.response
        if (isNetworkError && attempt < maxAttempts - 1) {
          await delay(500)
          continue
        }
        console.error('Failed to check app status:', error)
        isReady.value = true
        return { success: false, error: error.message }
      }
    }
  }

  // Complete initial setup
  async function completeSetup(setupData) {
    try {
      const response = await api.post('/api/auth/setup', setupData)
      settings.value = response.data.settings
      setupCompleted.value = true
      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.message || 'Setup failed' }
    }
  }

  // Fetch full profile/settings
  async function fetchProfile() {
    try {
      const response = await api.get('/api/auth/profile')
      settings.value = response.data.profile
      license.value = response.data.license
      return { success: true }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      return { success: false, error: error.message }
    }
  }

  // Update profile/settings
  async function updateProfile(profileData) {
    try {
      const response = await api.put('/api/auth/profile', profileData)
      settings.value = response.data.profile
      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.message || 'Update failed' }
    }
  }

  // Update Anthropic API key
  async function updateAnthropicKey(apiKey) {
    try {
      const response = await api.put('/api/settings/anthropic', { apiKey })
      return { success: true, maskedKey: response.data.maskedKey }
    } catch (error) {
      return { success: false, error: error.response?.data?.message || 'Update failed' }
    }
  }

  // Initialize app
  async function initialize() {
    await checkStatus()
    if (setupCompleted.value) {
      await fetchProfile()
    }
  }

  // Sign out — resets in-memory session; data in DB is preserved
  async function logout() {
    try { await api.post('/api/auth/logout') } catch { /* non-fatal */ }
    setupCompleted.value = false
    settings.value = null
    isReady.value = true
  }

  return {
    // State
    settings,
    license,
    isReady,
    setupCompleted,

    // Computed
    managerName,
    email,
    initials,
    licenseTier,
    licenseTierName,
    licenseWarning,
    licenseLocked,
    licenseDaysUntilLock,

    // Actions
    checkStatus,
    completeSetup,
    fetchProfile,
    updateProfile,
    updateAnthropicKey,
    initialize,
    logout
  }
})
