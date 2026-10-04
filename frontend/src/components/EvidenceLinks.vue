<template>
  <div class="evidence-links" :class="dense ? 'evidence-links--dense' : ''">
    <a v-if="showThumbnail" :href="screenshotUrl" target="_blank" rel="noopener" class="evidence-thumb" title="View full-size screenshot">
      <img :src="screenshotUrl" alt="Failure screenshot" @error="thumbFailed = true" v-show="!thumbFailed" />
    </a>
    <div class="evidence-actions">
      <a :href="videoUrl" target="_blank" rel="noopener" class="evidence-link">
        <Play :size="12" /> Watch replay
      </a>
      <a :href="traceUrl" target="_blank" rel="noopener" class="evidence-link">
        <FileArchive :size="12" /> Download trace
      </a>
      <button @click="downloadBundle" :disabled="downloading" class="evidence-link evidence-link--btn">
        <Loader2 v-if="downloading" :size="12" class="animate-spin" />
        <Download v-else :size="12" />
        {{ downloading ? 'Preparing…' : 'Download failure package' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Download, Play, FileArchive, Loader2 } from 'lucide-vue-next'
import api, { getApiBaseUrl } from '@/lib/api'

const props = defineProps({
  evidenceDir: { type: String, required: true },
  showThumbnail: { type: Boolean, default: true },
  dense: { type: Boolean, default: false }
})

const downloading = ref(false)
const thumbFailed = ref(false)

const base = getApiBaseUrl()
const screenshotUrl = computed(() => `${base}/api/evidence/${props.evidenceDir}/screenshot.png`)
const videoUrl = computed(() => `${base}/api/evidence/${props.evidenceDir}/replay.webm`)
const traceUrl = computed(() => `${base}/api/evidence/${props.evidenceDir}/trace.zip`)

async function downloadBundle() {
  downloading.value = true
  try {
    const resp = await api.get(`/api/evidence/${props.evidenceDir}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.evidenceDir}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Non-fatal — evidence may have been pruned by the retention cleanup job
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.evidence-links { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; }
.evidence-links--dense { margin-top: 4px; }
.evidence-thumb { flex-shrink: 0; display: block; width: 64px; height: 40px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color, rgba(255,255,255,0.1)); }
.evidence-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.evidence-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.evidence-link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: #6c5ce7; text-decoration: none;
  background: none; border: none; padding: 0; cursor: pointer;
}
.evidence-link:hover { text-decoration: underline; }
.evidence-link--btn:disabled { opacity: 0.6; cursor: default; text-decoration: none; }
</style>
