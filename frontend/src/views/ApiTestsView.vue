<template>
  <div class="p-6" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <APITestsComponent />
  </div>
</template>

<script setup>
import APITestsComponent from '@/components/TestTracker/APITestsView.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
