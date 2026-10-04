<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BarChart3, Activity, Settings, CheckCircle, Code } from 'lucide-vue-next'
import TeamView from './TeamView.vue'
import FunctionalTestsView from './FunctionalTestsView.vue'
import APITestsView from './APITestsView.vue'
import ManagerView from './ManagerView.vue'
import ExecutiveView from './ExecutiveView.vue'
import NavButton from './NavButton.vue'

const router = useRouter()

const currentView = ref('team')
const userRole = ref('team')

// In desktop mode, manager has access to all views
const canAccessManagerView = true
const canAccessExecutiveView = true

// Initialize view - default to team view for desktop app
onMounted(() => {
  userRole.value = 'team'
  currentView.value = 'team'
})

// Update current view when role changes
watch(userRole, (newRole) => {
  if (newRole === 'team') {
    currentView.value = 'team'
  } else if (newRole === 'manager') {
    currentView.value = 'manager'
  } else {
    currentView.value = 'executive'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <div class="border-b bg-white px-6 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-gray-900">Test Results Tracker</h1>
        <div class="flex items-center gap-4">
          <div class="flex gap-2">
            <button
              @click="userRole = 'team'"
              :class="[
                'px-3 py-1 text-sm rounded font-semibold',
                userRole === 'team' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              ]"
            >
              Team View
            </button>
            <button
              v-if="canAccessManagerView"
              @click="userRole = 'manager'"
              :class="[
                'px-3 py-1 text-sm rounded font-semibold',
                userRole === 'manager' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              ]"
            >
              Manager View
            </button>
            <button
              v-if="canAccessExecutiveView"
              @click="userRole = 'executive'"
              :class="[
                'px-3 py-1 text-sm rounded font-semibold',
                userRole === 'executive' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              ]"
            >
              Executive View
            </button>
          </div>
          <Settings :size="20" class="text-gray-600 cursor-pointer hover:text-gray-800" @click="router.push('/settings')" />
        </div>
      </div>
    </div>

    <!-- Sidebar + Content -->
    <div class="flex">
      <!-- Sidebar Navigation -->
      <div class="w-64 bg-white border-r min-h-screen p-4">
        <nav class="space-y-1">
          <template v-if="userRole === 'team'">
            <NavButton label="Team Dashboard" :icon="Activity" @click="currentView = 'team'" :active="currentView === 'team'" />
            <NavButton label="Functional Tests" :icon="CheckCircle" @click="currentView = 'functional'" :active="currentView === 'functional'" />
            <NavButton label="API Tests" :icon="Code" @click="currentView = 'api'" :active="currentView === 'api'" />
          </template>
          <template v-else-if="userRole === 'manager'">
            <NavButton label="Quality Overview" :icon="BarChart3" @click="currentView = 'manager'" :active="currentView === 'manager'" />
            <NavButton label="Functional Tests" :icon="CheckCircle" @click="currentView = 'functional'" :active="currentView === 'functional'" />
            <NavButton label="API Tests" :icon="Code" @click="currentView = 'api'" :active="currentView === 'api'" />
          </template>
          <template v-else>
            <NavButton label="Executive Dashboard" :icon="BarChart3" @click="currentView = 'executive'" :active="currentView === 'executive'" />
          </template>
        </nav>
      </div>

      <!-- Main Content -->
      <div class="flex-1 p-6">
        <TeamView v-if="currentView === 'team'" />
        <FunctionalTestsView v-else-if="currentView === 'functional'" />
        <APITestsView v-else-if="currentView === 'api'" />
        <ManagerView v-else-if="currentView === 'manager'" />
        <ExecutiveView v-else-if="currentView === 'executive'" />
      </div>
    </div>
  </div>
</template>
