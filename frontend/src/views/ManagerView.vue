<template>
  <div class="p-6" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <ManagerViewComponent />
  </div>
</template>

<script setup>
import ManagerViewComponent from '@/components/TestTracker/ManagerView.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
