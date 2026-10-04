<template>
  <div class="p-6" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <FunctionalTestsComponent />
  </div>
</template>

<script setup>
import FunctionalTestsComponent from '@/components/TestTracker/FunctionalTestsView.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
