<script setup>
defineProps({
  label: String,
  icon: Object,
  active: Boolean
})

defineEmits(['click'])
</script>

<template>
  <button
    @click="$emit('click')"
    :class="[
      'flex items-center gap-2 px-4 py-2 rounded w-full text-left transition font-semibold',
      active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
    ]"
  >
    <component :is="icon" :size="18" />
    <span>{{ label }}</span>
  </button>
</template>
