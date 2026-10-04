<template>
  <div ref="consoleEl" class="terminal-console">
    <div v-if="messages.length === 0" class="terminal-empty">
      <span class="text-muted text-xs">No output yet...</span>
    </div>
    <div
      v-for="(msg, i) in messages"
      :key="i"
      class="terminal-line"
      :class="`terminal-line--${msg.type}`"
    >
      <span class="terminal-time">{{ formatTime(msg.timestamp) }}</span>
      <span class="terminal-text">{{ msg.content }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  messages: { type: Array, default: () => [] }
})

const consoleEl = ref(null)

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (consoleEl.value) consoleEl.value.scrollTop = consoleEl.value.scrollHeight
  })
})

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toTimeString().slice(0, 8)
}
</script>

<style scoped>
.terminal-console {
  background: #0d0d0d;
  color: #e2e8f0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 14px;
  overflow-y: auto;
  height: 100%;
  min-height: 120px;
}

.terminal-empty {
  display: flex;
  align-items: center;
  height: 100%;
  opacity: 0.5;
}

.terminal-line {
  display: flex;
  gap: 10px;
  padding: 1px 0;
}

.terminal-time {
  color: #4a5568;
  flex-shrink: 0;
  user-select: none;
}

.terminal-text {
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
}

.terminal-line--error .terminal-text   { color: #f87171; }
.terminal-line--success .terminal-text,
.terminal-line--done .terminal-text    { color: #4ade80; }
.terminal-line--warn .terminal-text    { color: #fbbf24; }
.terminal-line--step .terminal-text    { color: #93c5fd; }
.terminal-line--info .terminal-text    { color: #cbd5e1; }
.terminal-line--system .terminal-text  { color: #64748b; }
.terminal-line--user .terminal-text    { color: #c4b5fd; }
</style>
