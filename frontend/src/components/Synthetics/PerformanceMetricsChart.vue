<template>
  <div class="h-80">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const props = defineProps({
  results: {
    type: Array,
    required: true
  }
})

const chartData = computed(() => {
  // Group results by transaction
  const transactionGroups = {}

  props.results.forEach(result => {
    if (!transactionGroups[result.transactionName]) {
      transactionGroups[result.transactionName] = []
    }
    transactionGroups[result.transactionName].push({
      timestamp: new Date(result.executedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      duration: result.duration,
      fcp: result.pageMetrics?.[0]?.fcp || null,
      tti: result.pageMetrics?.[0]?.tti || null,
      loadTime: result.pageMetrics?.[0]?.loadTime || null,
      fullPageLoad: result.pageMetrics?.[0]?.fullPageLoad || null
    })
  })

  // Create datasets for each metric
  const datasets = []
  const colors = [
    { border: '#00CFE8', bg: 'rgba(0, 207, 232, 0.1)' },
    { border: '#28C76F', bg: 'rgba(40, 199, 111, 0.1)' },
    { border: '#FF9F43', bg: 'rgba(255, 159, 67, 0.1)' },
  ]

  let colorIndex = 0
  Object.entries(transactionGroups).forEach(([transactionName, data]) => {
    const color = colors[colorIndex % colors.length]

    // Duration line
    datasets.push({
      label: `${transactionName} - Duration`,
      data: data.map(d => ({ x: d.timestamp, y: d.duration })),
      borderColor: color.border,
      backgroundColor: color.bg,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5
    })

    // FCP line
    const fcpData = data.filter(d => d.fcp !== null)
    if (fcpData.length > 0) {
      datasets.push({
        label: `${transactionName} - FCP`,
        data: fcpData.map(d => ({ x: d.timestamp, y: d.fcp })),
        borderColor: color.border,
        backgroundColor: color.bg,
        borderDash: [5, 5],
        tension: 0.3,
        borderWidth: 1,
        pointRadius: 2,
        pointHoverRadius: 4
      })
    }

    // TTI line
    const ttiData = data.filter(d => d.tti !== null)
    if (ttiData.length > 0) {
      datasets.push({
        label: `${transactionName} - TTI`,
        data: ttiData.map(d => ({ x: d.timestamp, y: d.tti })),
        borderColor: color.border,
        backgroundColor: color.bg,
        borderDash: [2, 2],
        tension: 0.3,
        borderWidth: 1,
        pointRadius: 2,
        pointHoverRadius: 4
      })
    }

    // Load Time line
    const loadTimeData = data.filter(d => d.loadTime !== null)
    if (loadTimeData.length > 0) {
      datasets.push({
        label: `${transactionName} - Load Time`,
        data: loadTimeData.map(d => ({ x: d.timestamp, y: d.loadTime })),
        borderColor: color.border,
        backgroundColor: color.bg,
        borderDash: [8, 4],
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5
      })
    }

    colorIndex++
  })

  return {
    datasets
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        usePointStyle: true,
        padding: 15,
        font: {
          size: 11
        }
      }
    },
    title: {
      display: false
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: function(context) {
          let label = context.dataset.label || ''
          if (label) {
            label += ': '
          }
          if (context.parsed.y !== null) {
            label += context.parsed.y + 'ms'
          }
          return label
        }
      }
    }
  },
  scales: {
    x: {
      type: 'category',
      title: {
        display: true,
        text: 'Time'
      },
      ticks: {
        maxRotation: 45,
        minRotation: 45,
        font: {
          size: 10
        }
      }
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Time (ms)'
      },
      ticks: {
        callback: function(value) {
          return value + 'ms'
        }
      }
    }
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false
  }
}
</script>
