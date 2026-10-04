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
  data: {
    type: Array,
    required: true
  }
})

const chartData = computed(() => {
  // Transform trend data for Chart.js
  const datasets = []
  const labels = new Set()

  props.data.forEach(transaction => {
    const passedData = []
    const failedData = []

    transaction.dataPoints.forEach(point => {
      labels.add(point.timestamp)
      if (point.status === 'passed') {
        passedData.push({ x: point.timestamp, y: point.count })
      } else {
        failedData.push({ x: point.timestamp, y: point.count })
      }
    })

    if (passedData.length > 0) {
      datasets.push({
        label: `${transaction.transactionName} (Passed)`,
        data: passedData,
        borderColor: '#28C76F',
        backgroundColor: 'rgba(40, 199, 111, 0.1)',
        tension: 0.3
      })
    }

    if (failedData.length > 0) {
      datasets.push({
        label: `${transaction.transactionName} (Failed)`,
        data: failedData,
        borderColor: '#EA5455',
        backgroundColor: 'rgba(234, 84, 85, 0.1)',
        tension: 0.3
      })
    }
  })

  return {
    labels: Array.from(labels).sort(),
    datasets
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top'
    },
    title: {
      display: false
    },
    tooltip: {
      mode: 'index',
      intersect: false
    }
  },
  scales: {
    x: {
      type: 'category',
      title: {
        display: true,
        text: 'Time'
      }
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: 'Test Runs'
      },
      ticks: {
        stepSize: 1
      }
    }
  }
}
</script>
