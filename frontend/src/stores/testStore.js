import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/lib/api'

export const useTestStore = defineStore('test', () => {
  // State
  const testResults = ref([])
  const functionalTests = ref([])
  const apiTests = ref([])
  const loading = ref(false)
  const error = ref(null)
  
  // Filters
  const filters = ref({
    dateRange: 'week', // 'week', 'month', 'quarter'
    team: 'all',
    status: 'all',
    testType: 'all'
  })
  
  // Computed
  const totalTests = computed(() => testResults.value.length)
  const passedTests = computed(() => testResults.value.filter(t => t.status === 'passed').length)
  const failedTests = computed(() => testResults.value.filter(t => t.status === 'failed').length)
  const passRate = computed(() => {
    if (totalTests.value === 0) return 0
    return ((passedTests.value / totalTests.value) * 100).toFixed(1)
  })
  
  // Actions
  async function fetchTestResults(params = {}) {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/api/tests/results', { params })
      testResults.value = response.data.results
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch test results'
      console.error('Error fetching test results:', err)
    } finally {
      loading.value = false
    }
  }
  
  async function fetchFunctionalTests(params = {}) {
    loading.value = true
    try {
      const response = await api.get('/api/tests/functional', { params })
      functionalTests.value = response.data.tests
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch functional tests'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function fetchAPITests(params = {}) {
    loading.value = true
    try {
      const response = await api.get('/api/tests/api', { params })
      apiTests.value = response.data.tests
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch API tests'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function fetchTestMetrics(timeRange = 'week') {
    try {
      const response = await api.get('/api/tests/metrics', {
        params: { timeRange }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch test metrics'
      throw err
    }
  }
  
  async function fetchQualityTrends(timeRange = 'weekly') {
    try {
      const response = await api.get('/api/tests/quality-trends', {
        params: { timeRange }
      })
      return response.data
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch quality trends'
      throw err
    }
  }
  
  async function fetchFailedTests(testType = 'all') {
    try {
      const response = await api.get('/api/tests/failed', {
        params: { testType }
      })
      return response.data.tests
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch failed tests'
      throw err
    }
  }
  
  async function fetchFlakyTests(testType = 'all') {
    try {
      const response = await api.get('/api/tests/flaky', {
        params: { testType }
      })
      return response.data.tests
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to fetch flaky tests'
      throw err
    }
  }
  
  function setFilter(filterName, value) {
    filters.value[filterName] = value
  }
  
  function resetFilters() {
    filters.value = {
      dateRange: 'week',
      team: 'all',
      status: 'all',
      testType: 'all'
    }
  }
  
  return {
    // State
    testResults,
    functionalTests,
    apiTests,
    loading,
    error,
    filters,
    
    // Computed
    totalTests,
    passedTests,
    failedTests,
    passRate,
    
    // Actions
    fetchTestResults,
    fetchFunctionalTests,
    fetchAPITests,
    fetchTestMetrics,
    fetchQualityTrends,
    fetchFailedTests,
    fetchFlakyTests,
    setFilter,
    resetFilters
  }
})