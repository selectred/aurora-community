<template>
  <span class="help-tooltip-wrap">
    <span class="help-icon">?</span>
    <span class="help-bubble" :class="`help-bubble--${position}`">
      {{ text }}
    </span>
  </span>
</template>

<script setup>
defineProps({
  text:     { type: String, required: true },
  position: { type: String, default: 'top' } // top | bottom | left | right
})
</script>

<style scoped>
.help-tooltip-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  vertical-align: middle;
}

.help-icon {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(115, 103, 240, 0.15);
  color: var(--color-primary, #7367f0);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.help-tooltip-wrap:hover .help-icon {
  background: var(--color-primary, #7367f0);
  color: #fff;
}

.help-bubble {
  position: absolute;
  z-index: 9999;
  width: 220px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.5;
  font-weight: 400;
  pointer-events: none;
  white-space: normal;
  opacity: 0;
  transition: opacity 0.15s;
  text-transform: none;
  letter-spacing: normal;

  background: #1f2937;
  color: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.help-tooltip-wrap:hover .help-bubble {
  opacity: 1;
}

/* Positions */
.help-bubble--top {
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}

.help-bubble--bottom {
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
}

.help-bubble--right {
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}

.help-bubble--left {
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
}
</style>
