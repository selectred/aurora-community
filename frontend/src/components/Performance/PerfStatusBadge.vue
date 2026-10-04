<template>
  <span class="inline-flex items-center gap-1">
    <span :class="['badge', info.cls]">{{ info.label }}</span>
    <span v-if="regressed" class="badge badge-warning" title="Slower or more errors than the baseline">Regressed</span>
    <span v-if="baseline" class="badge badge-primary" title="Later runs with the same load are compared with this one">Baseline</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { STATUS } from './perfFormat'

const props = defineProps({
  status: { type: String, required: true },
  regressed: { type: Boolean, default: false },
  baseline: { type: Boolean, default: false }
})
const info = computed(() => STATUS[props.status] || { label: props.status, cls: 'badge-info' })
</script>
