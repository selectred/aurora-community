import { ref, computed } from 'vue'
import api from '@/lib/api'

const SAVINGS_MINS = {
  TestGen:     120,
  LocatorHeal:  30,
  PlanGen:      60,
  BugTitle:      5,
  PageObject:   90,
  Fixture:      45,
}
const DEFAULT_SAVINGS_MINS = 20
const HOURLY_RATE_GBP = 55

export const FEATURE_LABELS = {
  TestGen:     'Test Generation',
  LocatorHeal: 'Locator Healing',
  PlanGen:     'Plan Generation',
  BugTitle:    'Bug Titles',
  PageObject:  'Page Objects',
  Fixture:     'Fixtures',
  SeedCode:    'Seed Code',
}

const PALETTE = ['#7367F0', '#00CFE8', '#28C76F', '#FF9F43', '#EA5455']

let _cache = null
let _promise = null

export function useAiTelemetry(days = 30) {
  const data = ref(_cache)
  const loading = ref(false)

  async function load() {
    if (_cache) { data.value = _cache; return }
    loading.value = true
    try {
      if (!_promise) {
        _promise = api.get(`/api/llm/health?days=${days}`)
          .then(r => { _cache = r.data; return r.data })
          .catch(() => null)
      }
      data.value = await _promise
    } finally {
      loading.value = false
    }
  }

  const summary = computed(() => data.value?.summary ?? null)
  const byFeature = computed(() => data.value?.byFeature ?? {})

  // Horizontal bar: usage rate % by feature (non-rejected / total)
  // Using usage rate rather than acceptance rate so pending interactions show as activity
  const acceptanceChartData = computed(() => {
    const features = Object.entries(byFeature.value)
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => b[1].total - a[1].total)
    if (!features.length) return null
    return {
      labels: features.map(([k]) => FEATURE_LABELS[k] ?? k),
      datasets: [{
        label: 'Usage Rate %',
        data: features.map(([, v]) => {
          const used = v.total - (v.rejected ?? 0)
          return Math.round((used / v.total) * 100)
        }),
        backgroundColor: '#7367F0',
        borderRadius: 6,
      }]
    }
  })

  // Doughnut: cost share by feature
  const costChartData = computed(() => {
    const features = Object.entries(byFeature.value)
      .filter(([, v]) => (v.totalCost ?? 0) > 0)
      .sort((a, b) => b[1].totalCost - a[1].totalCost)
    if (!features.length) return null
    return {
      labels: features.map(([k]) => FEATURE_LABELS[k] ?? k),
      datasets: [{
        data: features.map(([, v]) => v.totalCost),
        backgroundColor: features.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 0,
      }]
    }
  })

  // Grouped bar: accept/edit/reject for a single feature key
  function outcomeChartData(featureKey) {
    const f = byFeature.value[featureKey]
    if (!f || f.total === 0) return null
    return {
      labels: [FEATURE_LABELS[featureKey] ?? featureKey],
      datasets: [
        { label: 'Accepted', data: [f.accepted ?? 0],  backgroundColor: '#28C76F', borderRadius: 6 },
        { label: 'Edited',   data: [f.edited ?? 0],    backgroundColor: '#FF9F43', borderRadius: 6 },
        { label: 'Rejected', data: [f.rejected ?? 0],  backgroundColor: '#EA5455', borderRadius: 6 },
      ]
    }
  }

  // Grouped bar: accepted/edited/pending/rejected across ALL features with activity
  const allFeaturesOutcomeChartData = computed(() => {
    const features = Object.entries(byFeature.value)
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => b[1].total - a[1].total)
    if (!features.length) return null
    return {
      labels: features.map(([k]) => FEATURE_LABELS[k] ?? k),
      datasets: [
        { label: 'Accepted', data: features.map(([, v]) => v.accepted ?? 0), backgroundColor: '#28C76F', borderRadius: 6 },
        { label: 'Edited',   data: features.map(([, v]) => v.edited ?? 0),   backgroundColor: '#FF9F43', borderRadius: 6 },
        { label: 'Pending',  data: features.map(([, v]) => v.pending ?? 0),  backgroundColor: '#00CFE8', borderRadius: 6 },
        { label: 'Rejected', data: features.map(([, v]) => v.rejected ?? 0), backgroundColor: '#EA5455', borderRadius: 6 },
      ]
    }
  })

  // CBA rows sorted by hours saved descending.
  // "used" = accepted + edited + pending (all non-rejected interactions that saved time).
  // Rejected outputs are excluded — they added no value.
  const cbaSavings = computed(() => {
    return Object.entries(byFeature.value)
      .map(([key, v]) => {
        const used = (v.accepted ?? 0) + (v.edited ?? 0) + (v.pending ?? 0)
        return { key, v, used }
      })
      .filter(({ used }) => used > 0)
      .map(({ key, v, used }) => {
        const hrs = (used * (SAVINGS_MINS[key] ?? DEFAULT_SAVINGS_MINS)) / 60
        const gross = hrs * HOURLY_RATE_GBP
        const cost = v.totalCost ?? 0
        const net = gross - cost
        const roi = cost > 0 ? net / cost : (net > 0 ? 999 : 0)
        return { key, label: FEATURE_LABELS[key] ?? key, used, hrs, cost, net, roi }
      })
      .sort((a, b) => b.hrs - a.hrs)
  })

  // Dual-axis grouped bar for CBA chart (hours saved left, cost right)
  const cbaChartData = computed(() => {
    if (!cbaSavings.value.length) return null
    return {
      labels: cbaSavings.value.map(r => r.label),
      datasets: [
        {
          label: 'Time Saved (hrs)',
          data: cbaSavings.value.map(r => Math.round(r.hrs * 10) / 10),
          backgroundColor: '#28C76F',
          borderRadius: 6,
          yAxisID: 'y',
        },
        {
          label: 'AI Cost (£)',
          data: cbaSavings.value.map(r => Math.round(r.cost * 1000) / 1000),
          backgroundColor: '#7367F0',
          borderRadius: 6,
          yAxisID: 'y2',
        },
      ]
    }
  })

  return {
    data, loading, load, summary, byFeature,
    acceptanceChartData, costChartData, outcomeChartData,
    allFeaturesOutcomeChartData, cbaSavings, cbaChartData,
  }
}
