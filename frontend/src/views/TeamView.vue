<template>
  <div class="p-6" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <TeamViewComponent />
  </div>
</template>

<script setup>
import TeamViewComponent from '@/components/TestTracker/TeamView.vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
