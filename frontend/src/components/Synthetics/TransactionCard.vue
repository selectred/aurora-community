<template>
  <div
    class="border rounded-lg p-4 hover:shadow-md transition cursor-pointer"
    :class="getCardClass()"
  >
    <div class="flex items-center justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-3">
          <div
            class="w-3 h-3 rounded-full"
            :class="result.status === 'passed' ? 'bg-green-500' : 'bg-red-500'"
          ></div>
          <h3 class="font-semibold" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ result.transactionName }}</h3>
        </div>
        <p class="text-sm mt-1" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">{{ result.description || result.url }}</p>
        <div class="flex items-center gap-4 mt-2 text-sm" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">
          <span>Duration: {{ formatDuration(result.duration) }}</span>
          <span>Pages: {{ result.pageMetrics?.length || 0 }}</span>
          <span>{{ formatTime(result.executedAt) }}</span>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span
          class="px-3 py-1 rounded-full text-sm font-medium"
          :class="result.status === 'passed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
        >
          {{ result.status.toUpperCase() }}
        </span>
        <button
          class="text-sm font-medium"
          :class="themeStore.isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'"
        >
          View Details →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()

const props = defineProps({
  result: {
    type: Object,
    required: true
  }
})

const getCardClass = () => {
  if (themeStore.isDark) {
    return props.result.status === 'passed'
      ? 'border-green-800 bg-green-900/30'
      : 'border-red-800 bg-red-900/30'
  }
  return props.result.status === 'passed'
    ? 'border-green-200 bg-green-50'
    : 'border-red-200 bg-red-50'
}

const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatTime = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return date.toLocaleDateString()
}
</script>
