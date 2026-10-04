'use strict'
// ============================================================
// seedService.js
// Inserts sample data so new users see a populated dashboard.
// Safe to call multiple times — skips if teams already exist.
// ============================================================
const prisma = require('../lib/prisma')

// ── Helpers ──────────────────────────────────────────────────
function daysAgo(n, offsetHours = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(offsetHours, Math.floor(n * 7) % 60, 0, 0)
  return d
}

// Deterministic cycling status — weighted 78% pass, 14% fail, 5% flaky, 3% skipped
const STATUS_CYCLE = [
  'passed','passed','passed','passed','passed','passed','passed','passed',
  'failed','failed','flaky','passed','passed','passed','passed','passed',
  'passed','passed','failed','passed','passed','passed','passed','skipped',
  'passed','passed','passed','failed','passed','passed','flaky','passed',
]

function status(i) { return STATUS_CYCLE[i % STATUS_CYCLE.length] }
function duration(i) { return 900 + (i * 317) % 7200 } // 0.9s–8.1s

// Build test result rows for a date range (day start–end inclusive)
// startDay = further in past (larger number), endDay = closer to now (smaller number)
function makeResults({ specs, memberIds, teamId, startDay, endDay, perDay, typeFilter }) {
  const rows = []
  let idx = startDay * 13
  for (let day = endDay; day <= startDay; day++) {
    for (let r = 0; r < perDay; r++) {
      const s = typeFilter
        ? specs.find(sp => sp.testType === typeFilter) || specs[0]
        : specs[idx % specs.length]
      const st = status(idx)
      rows.push({
        testCaseId: `${s.specId}-c${(idx % 5) + 1}`,
        testName: `${s.name} — case ${(idx % 5) + 1}`,
        testType: s.testType,
        suite: s.name,
        status: st,
        duration: duration(idx),
        errorMessage: st === 'failed' ? 'AssertionError: expected element to be visible' : null,
        stackTrace: null,
        screenshot: null,
        browser: idx % 3 === 0 ? 'firefox' : 'chromium',
        environment: 'staging',
        scriptLocation: null,
        retries: st === 'failed' ? (idx % 3) : 0,
        metadataJson: '{}',
        teamId,
        executedById: memberIds[idx % memberIds.length],
        specId: s.id,
        executedAt: daysAgo(day, (idx * 3) % 23),
        createdAt: daysAgo(day, (idx * 3) % 23),
      })
      idx++
    }
  }
  return rows
}

// ── Main seed function ────────────────────────────────────────
async function seedSampleData() {
  const alreadySeeded = await prisma.team.findFirst({
    where: { name: { in: ['Frontend QA', 'Backend QA'] } }
  })
  if (alreadySeeded) {
    return { skipped: true, reason: 'Sample data already exists' }
  }

  // ── Teams ────────────────────────────────────────────────
  const [frontendTeam, backendTeam] = await Promise.all([
    prisma.team.create({
      data: {
        name: 'Frontend QA',
        description: 'UI and end-to-end functional testing',
        color: '#7367F0',
        metricsJson: JSON.stringify({ passRate: 91, totalTests: 0, flakyTests: 0, avgDuration: 0 })
      }
    }),
    prisma.team.create({
      data: {
        name: 'Backend QA',
        description: 'API, integration and performance testing',
        color: '#28C76F',
        metricsJson: JSON.stringify({ passRate: 94, totalTests: 0, flakyTests: 0, avgDuration: 0 })
      }
    })
  ])

  // ── Members ──────────────────────────────────────────────
  const [sarah, james, priya, tom, emma] = await Promise.all([
    prisma.teamMember.create({ data: { name: 'Sarah Chen',    email: 'sarah@example.com',  role: 'qa_lead',     avatarColor: '#7367F0', teamId: frontendTeam.id, statsJson: JSON.stringify({ testsCreated: 42, testsExecuted: 210 }) } }),
    prisma.teamMember.create({ data: { name: 'James Miller',  email: 'james@example.com',  role: 'qa_engineer', avatarColor: '#00CFE8', teamId: frontendTeam.id, statsJson: JSON.stringify({ testsCreated: 28, testsExecuted: 156 }) } }),
    prisma.teamMember.create({ data: { name: 'Priya Patel',   email: 'priya@example.com',  role: 'qa_engineer', avatarColor: '#FF9F43', teamId: frontendTeam.id, statsJson: JSON.stringify({ testsCreated: 31, testsExecuted: 180 }) } }),
    prisma.teamMember.create({ data: { name: 'Tom Richards',  email: 'tom@example.com',    role: 'qa_lead',     avatarColor: '#28C76F', teamId: backendTeam.id,  statsJson: JSON.stringify({ testsCreated: 38, testsExecuted: 195 }) } }),
    prisma.teamMember.create({ data: { name: 'Emma Davis',    email: 'emma@example.com',   role: 'qa_engineer', avatarColor: '#EA5455', teamId: backendTeam.id,  statsJson: JSON.stringify({ testsCreated: 24, testsExecuted: 142 }) } }),
  ])

  // Set team leads
  await Promise.all([
    prisma.team.update({ where: { id: frontendTeam.id }, data: { leadId: sarah.id } }),
    prisma.team.update({ where: { id: backendTeam.id },  data: { leadId: tom.id } }),
  ])

  // ── Agent Test Specs ─────────────────────────────────────
  const [specAuth, specNav, specCheckout, specForms, specHealthApi, specUserApi] = await Promise.all([
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-auth-flow-001',
      name: 'User Authentication Flow',
      testType: 'functional',
      status: 'ready',
      url: 'https://example.com',
      description: 'Login, logout, and session management',
      markdownSpec: '## Auth Flow\n- Test login with valid credentials\n- Test logout clears session\n- Test invalid credentials shows error',
      generatedCode: '// generated',
      teamId: frontendTeam.id,
      createdById: sarah.id,
    }}),
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-nav-001',
      name: 'Navigation & Routing',
      testType: 'functional',
      status: 'ready',
      url: 'https://example.com',
      description: 'Main navigation links and deep routing',
      markdownSpec: '## Navigation\n- All nav links resolve\n- Back/forward works\n- 404 page renders',
      generatedCode: '// generated',
      teamId: frontendTeam.id,
      createdById: james.id,
    }}),
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-checkout-001',
      name: 'Dashboard Functional Tests',
      testType: 'functional',
      status: 'ready',
      url: 'https://example.com',
      description: 'Core dashboard interactions',
      markdownSpec: '## Dashboard\n- Charts render on load\n- Filters update results\n- Export works',
      generatedCode: '// generated',
      teamId: frontendTeam.id,
      createdById: priya.id,
    }}),
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-forms-001',
      name: 'Settings Form Validation',
      testType: 'functional',
      status: 'ready',
      url: 'https://example.com',
      description: 'Form inputs and validation messages',
      markdownSpec: '## Forms\n- Required fields validated\n- Success feedback shown\n- Error messages clear',
      generatedCode: '// generated',
      teamId: backendTeam.id,
      createdById: tom.id,
    }}),
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-api-health-001',
      name: 'API Health Check',
      testType: 'api',
      status: 'ready',
      url: 'https://example.com/api/health',
      method: 'GET',
      expectedStatus: 200,
      description: 'Verify health endpoint responds correctly',
      markdownSpec: '## Health\n- GET /api/health returns 200\n- Response includes status: ok',
      generatedCode: '// generated',
      teamId: backendTeam.id,
      createdById: tom.id,
    }}),
    prisma.agentTestSpec.create({ data: {
      specId: 'spec-api-auth-001',
      name: 'Auth API Endpoint',
      testType: 'api',
      status: 'ready',
      url: 'https://example.com/api/auth/login',
      method: 'GET',
      expectedStatus: 200,
      description: 'Verify auth status endpoint',
      markdownSpec: '## Auth API\n- GET /api/auth/status returns setup state\n- Response is JSON',
      generatedCode: '// generated',
      teamId: backendTeam.id,
      createdById: emma.id,
    }}),
  ])

  const functionalSpecs = [specAuth, specNav, specCheckout, specForms]
  const apiSpecs = [specHealthApi, specUserApi]
  const allSpecs = [...functionalSpecs, ...apiSpecs]

  const frontendMemberIds = [sarah.id, james.id, priya.id]
  const backendMemberIds  = [tom.id, emma.id]

  // ── Test Results ─────────────────────────────────────────
  // Historical: days 120→31 — lighter data for monthly quality trend chart
  const historical = [
    ...makeResults({ specs: functionalSpecs, memberIds: frontendMemberIds, teamId: frontendTeam.id, startDay: 120, endDay: 91, perDay: 4 }),
    ...makeResults({ specs: apiSpecs,        memberIds: backendMemberIds,  teamId: backendTeam.id,  startDay: 120, endDay: 91, perDay: 2 }),
    ...makeResults({ specs: functionalSpecs, memberIds: frontendMemberIds, teamId: frontendTeam.id, startDay: 90,  endDay: 61, perDay: 5 }),
    ...makeResults({ specs: apiSpecs,        memberIds: backendMemberIds,  teamId: backendTeam.id,  startDay: 90,  endDay: 61, perDay: 2 }),
    ...makeResults({ specs: functionalSpecs, memberIds: frontendMemberIds, teamId: frontendTeam.id, startDay: 60,  endDay: 31, perDay: 6 }),
    ...makeResults({ specs: apiSpecs,        memberIds: backendMemberIds,  teamId: backendTeam.id,  startDay: 60,  endDay: 31, perDay: 3 }),
  ]

  // Recent: days 30→8 — for weekly trend chart
  const recent = [
    ...makeResults({ specs: functionalSpecs, memberIds: frontendMemberIds, teamId: frontendTeam.id, startDay: 30, endDay: 8, perDay: 8 }),
    ...makeResults({ specs: apiSpecs,        memberIds: backendMemberIds,  teamId: backendTeam.id,  startDay: 30, endDay: 8, perDay: 3 }),
  ]

  // Last 7 days — for functional/API daily trend charts
  const lastWeek = [
    ...makeResults({ specs: functionalSpecs, memberIds: frontendMemberIds, teamId: frontendTeam.id, startDay: 7, endDay: 1, perDay: 12 }),
    ...makeResults({ specs: apiSpecs,        memberIds: backendMemberIds,  teamId: backendTeam.id,  startDay: 7, endDay: 1, perDay: 5 }),
  ]

  // Last 24h — for today's metric cards (use daysAgo(0) = today, varied hours)
  const today = []
  const todayHours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
  let todayIdx = 0
  for (const h of todayHours) {
    for (let r = 0; r < 2; r++) {
      const sp = allSpecs[todayIdx % allSpecs.length]
      const st = status(todayIdx + 500)
      today.push({
        testCaseId: `${sp.specId}-c${(todayIdx % 5) + 1}`,
        testName: `${sp.name} — case ${(todayIdx % 5) + 1}`,
        testType: sp.testType,
        suite: sp.name,
        status: st,
        duration: duration(todayIdx + 500),
        errorMessage: st === 'failed' ? 'AssertionError: expected element to be visible' : null,
        stackTrace: null, screenshot: null,
        browser: todayIdx % 2 === 0 ? 'chromium' : 'firefox',
        environment: 'staging',
        scriptLocation: null,
        retries: st === 'failed' ? 1 : 0,
        metadataJson: '{}',
        teamId: sp.teamId,
        executedById: todayIdx % 2 === 0 ? sarah.id : tom.id,
        specId: sp.id,
        executedAt: new Date(Date.now() - h * 3600000 + r * 900000),
        createdAt:  new Date(Date.now() - h * 3600000 + r * 900000),
      })
      todayIdx++
    }
  }

  // Insert all results in batches
  const allResults = [...historical, ...recent, ...lastWeek, ...today]
  const BATCH = 200
  for (let i = 0; i < allResults.length; i += BATCH) {
    await prisma.testResult.createMany({ data: allResults.slice(i, i + BATCH) })
  }

  // ── Strategic Initiatives ─────────────────────────────────
  await Promise.all([
    prisma.strategicInitiative.create({ data: {
      name: 'Q2 Test Coverage Expansion',
      description: 'Increase functional test coverage across all critical user journeys',
      progress: 65,
      status: 'in-progress',
      priority: 'high',
      targetQuarter: 'Q2 2026',
      startDate: daysAgo(45),
      targetDate: daysAgo(-30),
      teamId: frontendTeam.id,
      assigneeId: sarah.id,
      milestonesJson: JSON.stringify([
        { title: 'Auth flow coverage', completed: true },
        { title: 'Dashboard coverage', completed: true },
        { title: 'Settings coverage', completed: false },
      ]),
    }}),
    prisma.strategicInitiative.create({ data: {
      name: 'API Monitor Rollout',
      description: 'Deploy synthetic monitors for all critical API endpoints',
      progress: 30,
      status: 'on-track',
      priority: 'medium',
      targetQuarter: 'Q3 2026',
      startDate: daysAgo(20),
      targetDate: daysAgo(-60),
      teamId: backendTeam.id,
      assigneeId: tom.id,
      milestonesJson: JSON.stringify([
        { title: 'Health endpoint monitor', completed: true },
        { title: 'Auth endpoint monitor', completed: false },
        { title: 'Data endpoint monitor', completed: false },
      ]),
    }}),
  ])

  const inserted = allResults.length
  console.log(`[Seed] Sample data loaded: ${inserted} test results, 2 teams, 5 members, 6 specs, 2 initiatives`)
  return { success: true, inserted }
}

module.exports = { seedSampleData }
