<template>
  <div class="min-h-screen" :class="themeStore.isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <div class="p-6">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()
</script>
