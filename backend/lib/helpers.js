// ============================================
// lib/helpers.js - Helper functions for Prisma
// ============================================

/**
 * Parse JSON string or return default value
 */
function parseJson(jsonString, defaultValue = {}) {
  if (!jsonString) return defaultValue
  try {
    return JSON.parse(jsonString)
  } catch {
    return defaultValue
  }
}

/**
 * Stringify JSON safely
 */
function stringifyJson(obj) {
  return JSON.stringify(obj || {})
}

/**
 * Transform AppSettings from DB to API format
 */
function transformAppSettings(settings) {
  if (!settings) return null

  const preferences = parseJson(settings.preferencesJson, {
    theme: 'system',
    notifications: { enabled: true, onTestFailure: true, onSyntheticAlert: true },
    defaultTimeout: 60000,
    autoHealTests: true
  })

  const syntheticDefaults = parseJson(settings.syntheticDefaultsJson, {
    schedule: '*/30 * * * *',
    alertThreshold: 3000,
    retryCount: 2
  })

  return {
    id: settings.id,
    managerName: settings.managerName,
    email: settings.email,
    preferences,
    syntheticDefaults,
    apiKeys: {
      anthropic: settings.anthropicKey,
      openai: settings.openaiKey,
      azureOpenai: {
        key: settings.azureOpenaiKey,
        endpoint: settings.azureOpenaiEndpoint,
        deploymentName: settings.azureOpenaiDeployment
      }
    },
    activeAiProvider: settings.activeAiProvider,
    continuumIntegration: {
      enabled: settings.continuumEnabled,
      url: settings.continuumUrl,
      apiKey: settings.continuumApiKey
    },
    setupCompleted: settings.setupCompleted,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt
  }
}

/**
 * Transform License from DB to API format
 */
function transformLicense(license) {
  if (!license) return null

  const limits = parseJson(license.limitsJson, {
    maxTeams: 2,
    maxMembersPerTeam: 5,
    maxSyntheticMonitors: 3,
    aiTestGeneration: true,
    continuumPush: false
  })

  const usage = parseJson(license.usageJson, {
    teams: 0,
    members: 0,
    synthetics: 0
  })

  return {
    id: license.id,
    licenseKey: license.licenseKey,
    tier: license.tier,
    limits,
    registeredTo: {
      name: license.registeredName,
      email: license.registeredEmail
    },
    isActive: license.isActive,
    activatedAt: license.activatedAt,
    expiresAt: license.expiresAt,
    usage,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt
  }
}

/**
 * Transform Team from DB to API format
 */
function transformTeam(team) {
  if (!team) return null

  const metrics = parseJson(team.metricsJson, {
    passRate: 0,
    totalTests: 0,
    flakyTests: 0,
    avgDuration: 0
  })

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    color: team.color,
    metrics,
    isActive: team.isActive,
    lead: team.lead ? transformTeamMember(team.lead) : null,
    members: team.members?.map(transformTeamMember) || [],
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  }
}

/**
 * Transform TeamMember from DB to API format
 */
function transformTeamMember(member) {
  if (!member) return null

  const stats = parseJson(member.statsJson, {
    testsCreated: 0,
    testsExecuted: 0,
    lastActiveAt: null
  })

  // Calculate initials
  const parts = member.name.split(' ')
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : member.name.substring(0, 2).toUpperCase()

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    avatarColor: member.avatarColor,
    isActive: member.isActive,
    stats,
    initials,
    displayName: member.name,
    teamId: member.teamId,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  }
}

/**
 * Transform TestResult from DB to API format
 */
function transformTestResult(result) {
  if (!result) return null

  const metadata = parseJson(result.metadataJson, {})

  return {
    id: result.id,
    testCaseId: result.testCaseId,
    testName: result.testName,
    testType: result.testType,
    suite: result.suite,
    status: result.status,
    duration: result.duration,
    errorMessage: result.errorMessage,
    stackTrace: result.stackTrace,
    screenshot: result.screenshot,
    browser: result.browser,
    environment: result.environment,
    scriptLocation: result.scriptLocation,
    retries: result.retries,
    metadata,
    teamId: result.teamId,
    team: result.team ? transformTeam(result.team) : null,
    executedById: result.executedById,
    executedBy: result.executedBy ? transformTeamMember(result.executedBy) : null,
    specId: result.specId,
    executedAt: result.executedAt,
    createdAt: result.createdAt
  }
}

/**
 * Transform AgentTestSpec from DB to API format
 */
function transformAgentTestSpec(spec) {
  if (!spec) return null

  const tags = parseJson(spec.tagsJson, [])
  const lastHealDetails = parseJson(spec.lastHealDetailsJson, {})
  const generationMeta = parseJson(spec.generationMetaJson, {})
  const lastResult = parseJson(spec.lastResultJson, {})

  return {
    id: spec.id,
    specId: spec.specId,
    name: spec.name,
    testType: spec.testType,
    engine: spec.engine || 'playwright',
    isSynthetic: spec.isSynthetic,
    promotedToSyntheticAt: spec.promotedToSyntheticAt,
    description: spec.description,
    url: spec.url,
    method: spec.method,
    headers: spec.headers,
    requestBody: spec.requestBody,
    expectedStatus: spec.expectedStatus,
    alertThreshold: spec.alertThreshold,
    markdownSpec: spec.markdownSpec,
    generatedCode: spec.generatedCode,
    codeStorage: spec.codeStorage || 'inline',
    codeFilePath: spec.codeFilePath || null,
    fixturesFilePath: spec.fixturesFilePath || null,
    status: spec.status,
    enabled: spec.enabled,
    schedule: spec.schedule,
    timeout: spec.timeout,
    healCount: spec.healCount,
    lastHealDetails,
    lastResult,
    tags,
    generationMeta,
    intentJson: spec.intentJson || null,
    teamId: spec.teamId,
    team: spec.team ? transformTeam(spec.team) : null,
    createdById: spec.createdById,
    createdBy: spec.createdBy ? transformTeamMember(spec.createdBy) : null,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt
  }
}

/**
 * Transform SyntheticTransaction from DB to API format
 */
function transformSyntheticTransaction(transaction) {
  if (!transaction) return null

  const tags = parseJson(transaction.tagsJson, [])

  return {
    id: transaction.id,
    transactionId: transaction.transactionId,
    name: transaction.name,
    description: transaction.description,
    url: transaction.url,
    scriptPath: transaction.scriptPath,
    enabled: transaction.enabled,
    schedule: transaction.schedule,
    timeout: transaction.timeout,
    retryOnFailure: transaction.retryOnFailure,
    retryCount: transaction.retryCount,
    tags,
    teamId: transaction.teamId,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt
  }
}

/**
 * Transform SyntheticResult from DB to API format
 */
function transformSyntheticResult(result) {
  if (!result) return null

  const pageMetrics = parseJson(result.pageMetricsJson, [])
  const viewport = parseJson(result.viewportJson, {})

  return {
    id: result.id,
    transactionId: result.transactionId,
    transactionName: result.transactionName,
    url: result.url,
    description: result.description,
    status: result.status,
    duration: result.duration,
    pageMetrics,
    errorMessage: result.errorMessage,
    stackTrace: result.stackTrace,
    screenshot: result.screenshot,
    browser: result.browser,
    viewport,
    userAgent: result.userAgent,
    scheduledRun: result.scheduledRun,
    cronSchedule: result.cronSchedule,
    executedAt: result.executedAt,
    createdAt: result.createdAt
  }
}

/**
 * Transform StrategicInitiative from DB to API format
 */
function transformStrategicInitiative(initiative) {
  if (!initiative) return null

  const milestones = parseJson(initiative.milestonesJson, [])
  const metrics = parseJson(initiative.metricsJson, {
    testsAutomated: 0,
    coverageTarget: 0,
    coverageCurrent: 0,
    testsCreated: 0,
    testsRemaining: 0
  })
  const tags = parseJson(initiative.tagsJson, [])

  return {
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    progress: initiative.progress,
    status: initiative.status,
    priority: initiative.priority,
    targetQuarter: initiative.targetQuarter,
    startDate: initiative.startDate,
    targetDate: initiative.targetDate,
    completedDate: initiative.completedDate,
    milestones,
    metrics,
    tags,
    isActive: initiative.isActive,
    teamId: initiative.teamId,
    team: initiative.team ? transformTeam(initiative.team) : null,
    assigneeId: initiative.assigneeId,
    assignee: initiative.assignee ? transformTeamMember(initiative.assignee) : null,
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt
  }
}

/**
 * Transform TestPack from DB to API format
 */
function transformFeature(feature) {
  if (!feature) return null
  return {
    id: feature.id,
    name: feature.name,
    description: feature.description || null,
    initiativeId: feature.initiativeId,
    initiativeName: feature.initiative?.name || null,
    teamId: feature.teamId || null,
    team: feature.team ? transformTeam(feature.team) : null,
    testPackCount: feature.testPacks?.length ?? undefined,
    createdAt: feature.createdAt,
    updatedAt: feature.updatedAt
  }
}

function transformTestPack(pack) {
  if (!pack) return null

  const lastRunResults = parseJson(pack.lastRunResultsJson, {
    total: 0,
    passed: 0,
    failed: 0,
    duration: 0
  })

  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    schedule: pack.schedule,
    isActive: pack.isActive,
    lastRunAt: pack.lastRunAt,
    lastRunResults,
    packSetupCode: pack.packSetupCode || '',
    packTeardownCode: pack.packTeardownCode || '',
    teamId: pack.teamId,
    team: pack.team ? transformTeam(pack.team) : null,
    initiativeId: pack.initiativeId || null,
    initiativeName: pack.initiative?.name || null,
    featureId: pack.featureId || null,
    featureName: pack.feature?.name || null,
    feature: pack.feature ? transformFeature(pack.feature) : null,
    // Packs enforce a single engine across all member specs at add-time (see addTestsToPack),
    // so the first test's engine represents the whole pack. null for an empty pack.
    engine: pack.tests?.[0]?.spec?.engine || null,
    tests: pack.tests?.map(t => t.spec?.specId || t.specId) || [],
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt
  }
}

/**
 * Transform APIKey from DB to API format
 */
function transformAPIKey(key) {
  if (!key) return null

  const permissions = parseJson(key.permissionsJson, [])

  return {
    id: key.id,
    key: key.key,
    name: key.name,
    description: key.description,
    permissions,
    isActive: key.isActive,
    lastUsed: key.lastUsed,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt
  }
}

/**
 * Transform AgentTerminalSession from DB to API format
 */
function transformAgentTerminalSession(session) {
  if (!session) return null

  const currentPlan = parseJson(session.currentPlanJson, {})
  const generatedSpecs = parseJson(session.generatedSpecsJson, [])
  const lastRun = parseJson(session.lastRunJson, {})
  const messages = parseJson(session.messagesJson, [])

  return {
    id: session.id,
    sessionId: session.sessionId,
    status: session.status,
    currentPlan,
    generatedSpecs,
    lastRun,
    messages,
    teamId: session.teamId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  }
}

/**
 * Get license tier display name
 */
function getTierDisplayName(tier) {
  const names = {
    'free': 'Free',
    'pro': 'Pro',
    'unlimited': 'Unlimited'
  }
  return names[tier] || tier
}

/**
 * Check if a limit is exceeded
 */
function checkLimit(limits, limitType, currentValue) {
  const limit = limits[limitType]
  if (limit === undefined || limit === null || limit === -1) {
    return { allowed: true } // Unlimited
  }
  return {
    allowed: currentValue < limit,
    current: currentValue,
    limit: limit,
    remaining: Math.max(0, limit - currentValue)
  }
}

module.exports = {
  parseJson,
  stringifyJson,
  transformAppSettings,
  transformLicense,
  transformTeam,
  transformTeamMember,
  transformTestResult,
  transformAgentTestSpec,
  transformSyntheticTransaction,
  transformSyntheticResult,
  transformStrategicInitiative,
  transformFeature,
  transformTestPack,
  transformAPIKey,
  transformAgentTerminalSession,
  getTierDisplayName,
  checkLimit
}
