'use strict'

/**
 * featureHealthService.js — computes Tier 1 RAG (Red/Amber/Green) health status for a
 * Feature or a whole Initiative, per the failure-reporting spec's design principle:
 * stakeholders get a high-level status, not individual test names, at the summary level.
 *
 * Deliberately decoupled from HTTP/request objects so it can be reused later (e.g. if a
 * feature-level rollup ever needs pushing to Continuum) without entangling it with
 * controller concerns.
 *
 * Bucketing rule (simplified from the spec doc — Aurora has no test-criticality concept,
 * so Red is pass-rate-only, not "critical failure OR rate"):
 *   Green  — 100% pass rate
 *   Amber  — pass rate >= ragRedThresholdPct but < 100%
 *   Red    — pass rate <  ragRedThresholdPct
 *   Gray   — no results yet ("Not Run"), excluded from Red
 *
 * A spec's latest failing result counts as PASSED if a BugReport for that spec was
 * resolved via the AI heal flow (healId set) at or after the failure — the "healer-
 * resolved failures count as passed" rule from the spec doc.
 */

const prisma = require('../lib/prisma')
const path = require('path')
const evidenceStorage = require('../lib/evidenceStorage')
const evidenceReportService = require('./evidenceReportService')

function bucketStatus(total, passed, ragRedThresholdPct) {
  if (total === 0) return 'Gray'
  const passRate = (passed / total) * 100
  if (passRate === 100) return 'Green'
  if (passRate >= ragRedThresholdPct) return 'Amber'
  return 'Red'
}

/**
 * Given a set of TestPacks (each with tests: [{spec}] included), compute one RAG
 * row + the list of unresolved failing tests across all of them.
 *
 * @param {object[]} packs - TestPack records with `tests: { spec }` included
 * @param {string} rowName - label for this RAG row (Feature name or ungrouped pack name)
 * @param {string|null} rowId - Feature id, or null for an ungrouped legacy pack
 * @param {number} ragRedThresholdPct
 * @param {string} evidenceRoot
 * @returns {Promise<{name:string, id:string|null, status:string, passed:number, total:number, healedCount:number, failingTests:object[]}>}
 */
async function computeRowForPacks(packs, rowName, rowId, ragRedThresholdPct, evidenceRoot) {
  // Dedupe specs by id (a spec can appear in more than one pack) and remember which
  // pack each one belongs to for the failing-test detail rows.
  const specByPackName = new Map() // spec.id -> pack.name (first pack it's found in)
  const specMap = new Map()        // spec.id -> spec record
  for (const pack of packs) {
    for (const link of pack.tests || []) {
      const spec = link.spec
      if (!spec || link.excluded) continue
      if (!specMap.has(spec.id)) {
        specMap.set(spec.id, spec)
        specByPackName.set(spec.id, pack.name)
      }
    }
  }

  const specIds = [...specMap.keys()]
  if (specIds.length === 0) {
    return { name: rowName, id: rowId, status: 'Gray', passed: 0, total: 0, healedCount: 0, failingTests: [] }
  }

  // Latest TestResult per spec — fetch all recent results for these specs ordered
  // newest-first, then keep only the first (latest) one seen per specId.
  const recentResults = await prisma.testResult.findMany({
    where: { specId: { in: specIds } },
    orderBy: { executedAt: 'desc' }
  })
  const latestBySpec = new Map()
  for (const r of recentResults) {
    if (r.specId && !latestBySpec.has(r.specId)) latestBySpec.set(r.specId, r)
  }

  let passed = 0
  let total = 0
  let healedCount = 0
  const failingTests = []

  for (const [specId, spec] of specMap) {
    const latest = latestBySpec.get(specId)
    if (!latest) continue // never run — excluded from the total, not counted as a failure
    total++

    if (latest.status !== 'failed') {
      passed++
      continue
    }

    // Failed — check whether it's since been healer-resolved
    const healedResolution = await prisma.bugReport.findFirst({
      where: {
        specId,
        status: 'resolved',
        healId: { not: null },
        resolvedAt: { gte: latest.executedAt }
      },
      orderBy: { resolvedAt: 'desc' }
    })

    if (healedResolution) {
      passed++
      healedCount++
      continue
    }

    // A genuine, unresolved failure — surface it for the detail view / PDF
    const bundleDir = latest.evidenceDir ? evidenceStorage.resolveBundleDir(evidenceRoot, latest.evidenceDir) : null
    let steps = []
    try { steps = JSON.parse(spec.lastResultJson || '{}').failures?.map(f => ({ action: f.step, success: false, error: f.error })) || [] } catch {}

    failingTests.push({
      specId,
      testName: spec.name,
      packName: specByPackName.get(specId) || null,
      featureName: rowName,
      error: latest.errorMessage || null,
      evidenceDir: latest.evidenceDir || null,
      steps,
      hasScreenshot: bundleDir ? evidenceReportService.bundleHasFile(bundleDir, 'screenshot.png') : false,
      hasVideo: bundleDir ? evidenceReportService.bundleHasFile(bundleDir, 'replay.webm') : false,
      hasTrace: bundleDir ? evidenceReportService.bundleHasFile(bundleDir, 'trace.zip') : false
    })
  }

  return {
    name: rowName,
    id: rowId,
    status: bucketStatus(total, passed, ragRedThresholdPct),
    passed,
    total,
    healedCount,
    failingTests
  }
}

async function getRagThreshold() {
  const settings = await prisma.appSettings.findFirst().catch(() => null)
  return {
    settings,
    threshold: settings?.ragRedThresholdPct ?? 50,
    evidenceRoot: evidenceStorage.getEvidenceRoot(settings)
  }
}

/**
 * Compute RAG health for a single Feature.
 * @param {string} featureId
 * @returns {Promise<{scopeType:'Feature', scopeName:string, ragRows:object[], failingTests:object[]}|null>}
 */
async function computeFeatureHealth(featureId) {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    include: { testPacks: { include: { tests: { include: { spec: true } } } } }
  })
  if (!feature) return null

  const { threshold, evidenceRoot } = await getRagThreshold()
  const row = await computeRowForPacks(feature.testPacks, feature.name, feature.id, threshold, evidenceRoot)

  return {
    scopeType: 'Feature',
    scopeName: feature.name,
    ragRows: [row],
    failingTests: row.failingTests
  }
}

/**
 * Compute RAG health across an Initiative — every Feature underneath it, PLUS any
 * TestPacks linked directly via the legacy TestPack.initiativeId field (not all packs
 * go through a Feature).
 * @param {string} initiativeId
 * @returns {Promise<{scopeType:'Initiative', scopeName:string, ragRows:object[], failingTests:object[]}|null>}
 */
async function computeInitiativeHealth(initiativeId) {
  const initiative = await prisma.strategicInitiative.findUnique({
    where: { id: initiativeId },
    include: {
      features: { include: { testPacks: { include: { tests: { include: { spec: true } } } } } },
      testPacks: { include: { tests: { include: { spec: true } } } } // legacy direct-link packs
    }
  })
  if (!initiative) return null

  const { threshold, evidenceRoot } = await getRagThreshold()

  const ragRows = []
  const failingTests = []

  for (const feature of initiative.features) {
    const row = await computeRowForPacks(feature.testPacks, feature.name, feature.id, threshold, evidenceRoot)
    ragRows.push(row)
    failingTests.push(...row.failingTests)
  }

  // Legacy packs linked directly to the initiative (no featureId) — one row each,
  // since they were never grouped under a Feature.
  const ungroupedPacks = initiative.testPacks.filter(p => !p.featureId)
  for (const pack of ungroupedPacks) {
    const row = await computeRowForPacks([pack], pack.name, null, threshold, evidenceRoot)
    ragRows.push(row)
    failingTests.push(...row.failingTests)
  }

  return {
    scopeType: 'Initiative',
    scopeName: initiative.name,
    ragRows,
    failingTests
  }
}

module.exports = {
  computeFeatureHealth,
  computeInitiativeHealth,
  bucketStatus
}
