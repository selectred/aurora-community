<template>
  <div :style="{ height: `${height}px` }">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
// Line chart for performance data. Each series: { label, data: number[], color,
// axis: 'y' | 'y1', dashed?, fill?, stepped? }. Labels are the x values.
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const props = defineProps({
  labels: { type: Array, required: true },
  series: { type: Array, required: true },
  yTitle: { type: String, default: '' },
  y1Title: { type: String, default: '' },
  xTitle: { type: String, default: '' },
  height: { type: Number, default: 260 },
  yMin: { type: Number, default: 0 },
  y1Max: { type: Number, default: undefined },
  formatY: { type: Function, default: null },
  formatY1: { type: Function, default: null }
})

function hexToRgba (hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '')
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : hex
}

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map(s => ({
    label: s.label,
    data: s.data,
    yAxisID: s.axis || 'y',
    borderColor: s.color,
    backgroundColor: s.fill ? hexToRgba(s.color, 0.12) : s.color,
    fill: !!s.fill,
    borderDash: s.dashed ? [6, 4] : undefined,
    stepped: s.stepped || false,
    tension: s.stepped ? 0 : 0.25,
    pointRadius: s.data.length > 40 ? 0 : 2,
    borderWidth: 2,
    spanGaps: true
  }))
}))

const hasY1 = computed(() => props.series.some(s => s.axis === 'y1'))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
    tooltip: {
      callbacks: {
        label: ctx => {
          const s = props.series[ctx.datasetIndex]
          const f = s?.axis === 'y1' ? props.formatY1 : props.formatY
          const v = ctx.parsed.y
          return `${ctx.dataset.label}: ${v === null || v === undefined ? '—' : (f ? f(v) : v)}`
        }
      }
    }
  },
  scales: {
    x: { title: { display: !!props.xTitle, text: props.xTitle }, ticks: { maxTicksLimit: 10, autoSkip: true }, grid: { display: false } },
    y: { min: props.yMin, title: { display: !!props.yTitle, text: props.yTitle }, ticks: props.formatY ? { callback: v => props.formatY(v) } : {} },
    ...(hasY1.value
      ? { y1: { position: 'right', min: 0, max: props.y1Max, title: { display: !!props.y1Title, text: props.y1Title }, grid: { drawOnChartArea: false }, ticks: props.formatY1 ? { callback: v => props.formatY1(v) } : {} } }
      : {})
  }
}))
</script>
