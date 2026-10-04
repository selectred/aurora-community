<template>
  <div class="p-6" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <ExecutiveViewComponent />
  </div>
</template>

<script setup>
import ExecutiveViewComponent from '@/components/TestTracker/ExecutiveView.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
