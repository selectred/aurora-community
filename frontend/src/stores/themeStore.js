import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  // Initialize from localStorage or default to dark
  const savedTheme = localStorage.getItem('aurora-theme')
  const isDark = ref(savedTheme ? savedTheme === 'dark' : true)

  // Apply theme to document
  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }

  // Toggle theme
  function toggleTheme() {
    isDark.value = !isDark.value
  }

  // Set specific theme
  function setTheme(dark) {
    isDark.value = dark
  }

  // Watch for changes and persist
  watch(isDark, (newValue) => {
    localStorage.setItem('aurora-theme', newValue ? 'dark' : 'light')
    applyTheme()
  }, { immediate: true })

  return {
    isDark,
    toggleTheme,
    setTheme,
    applyTheme
  }
})
