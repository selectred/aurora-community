<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
    <div class="rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden" :class="themeStore.isDark ? 'bg-gray-800' : 'bg-white'">
      <!-- Header -->
      <div class="p-6 border-b flex items-center justify-between" :class="themeStore.isDark ? 'border-gray-700' : 'border-gray-200'">
        <div>
          <h2 class="text-2xl font-bold" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ result.transactionName }}</h2>
          <p class="text-sm mt-1" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">{{ result.url }}</p>
        </div>
        <button
          @click="$emit('close')"
          class="text-2xl"
          :class="themeStore.isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'"
        >
          ×
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
        <!-- Overall Status -->
        <div class="mb-6">
          <div class="grid grid-cols-3 gap-4">
            <div class="p-4 rounded" :class="themeStore.isDark ? 'bg-gray-700' : 'bg-gray-50'">
              <div class="text-sm" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">Status</div>
              <div
                class="text-lg font-semibold mt-1"
                :class="result.status === 'passed' ? 'text-green-500' : 'text-red-500'"
              >
                {{ result.status.toUpperCase() }}
              </div>
            </div>
            <div class="p-4 rounded" :class="themeStore.isDark ? 'bg-gray-700' : 'bg-gray-50'">
              <div class="text-sm" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">Total Duration</div>
              <div class="text-lg font-semibold mt-1" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">
                {{ formatDuration(result.duration) }}
              </div>
            </div>
            <div class="p-4 rounded" :class="themeStore.isDark ? 'bg-gray-700' : 'bg-gray-50'">
              <div class="text-sm" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-600'">Executed At</div>
              <div class="text-lg font-semibold mt-1" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">
                {{ new Date(result.executedAt).toLocaleString() }}
              </div>
            </div>
          </div>
        </div>

        <!-- Error Message (if failed) -->
        <div v-if="result.status === 'failed' && result.errorMessage" class="mb-6 border rounded-lg p-4" :class="themeStore.isDark ? 'bg-red-900/30 border-red-800' : 'bg-red-50 border-red-200'">
          <h3 class="font-semibold mb-2" :class="themeStore.isDark ? 'text-red-400' : 'text-red-900'">Error Message</h3>
          <p class="text-sm font-mono" :class="themeStore.isDark ? 'text-red-300' : 'text-red-800'">{{ result.errorMessage }}</p>
          <details v-if="result.stackTrace" class="mt-2">
            <summary class="text-sm cursor-pointer" :class="themeStore.isDark ? 'text-red-400' : 'text-red-700'">View Stack Trace</summary>
            <pre class="text-xs mt-2 overflow-x-auto" :class="themeStore.isDark ? 'text-red-300' : 'text-red-800'">{{ result.stackTrace }}</pre>
          </details>
        </div>

        <!-- Page Metrics -->
        <div v-if="result.pageMetrics && result.pageMetrics.length > 0">
          <h3 class="font-semibold mb-3" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">Page Metrics</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y" :class="themeStore.isDark ? 'divide-gray-700' : 'divide-gray-200'">
              <thead :class="themeStore.isDark ? 'bg-gray-700/50' : 'bg-gray-50'">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">Page</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">HTTP Status</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">Load Time</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">Full Page Load</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">FCP</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase" :class="themeStore.isDark ? 'text-gray-400' : 'text-gray-500'">TTI</th>
                </tr>
              </thead>
              <tbody class="divide-y" :class="themeStore.isDark ? 'divide-gray-700' : 'divide-gray-200'">
                <tr v-for="(page, index) in result.pageMetrics" :key="index">
                  <td class="px-4 py-3 text-sm" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ page.pageName }}</td>
                  <td class="px-4 py-3 text-sm">
                    <span
                      class="px-2 py-1 rounded text-xs font-medium"
                      :class="getStatusClass(page.httpStatusCode)"
                    >
                      {{ page.httpStatusCode }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ formatDuration(page.loadTime) }}</td>
                  <td class="px-4 py-3 text-sm" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ page.fullPageLoad ? formatDuration(page.fullPageLoad) : 'N/A' }}</td>
                  <td class="px-4 py-3 text-sm" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ page.fcp ? formatDuration(page.fcp) : 'N/A' }}</td>
                  <td class="px-4 py-3 text-sm" :class="themeStore.isDark ? 'text-white' : 'text-gray-900'">{{ page.tti ? formatDuration(page.tti) : 'N/A' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import { useThemeStore } from '@/stores/themeStore'

const themeStore = useThemeStore()

const props = defineProps({
  result: {
    type: Object,
    required: true
  }
})

defineEmits(['close'])

const formatDuration = (ms) => {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const getStatusClass = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) {
    return 'bg-green-100 text-green-800'
  } else if (statusCode >= 300 && statusCode < 400) {
    return 'bg-blue-100 text-blue-800'
  } else if (statusCode >= 400 && statusCode < 500) {
    return 'bg-yellow-100 text-yellow-800'
  } else {
    return 'bg-red-100 text-red-800'
  }
}
</script>
