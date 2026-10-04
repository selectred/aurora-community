const prisma = require('../lib/prisma')


exports.getHealth = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const logs = await prisma.lLMInteractionLog.findMany({
      where: { createdAt: { gte: since } },
      select: {
        feature: true, outcome: true,
        promptTokens: true, completionTokens: true, totalTokens: true,
        estimatedCostUsd: true, latencyMs: true,
        locatorsVerified: true, testPassedFirstRun: true,
        provider: true, modelUsed: true
      }
    })

    const total = logs.length
    const accepted = logs.filter(l => l.outcome === 'accept').length
    const edited   = logs.filter(l => l.outcome === 'edit').length
    const rejected = logs.filter(l => l.outcome === 'reject').length
    const withVerification = logs.filter(l => l.locatorsVerified !== null)
    const hallucinated     = withVerification.filter(l => l.locatorsVerified === false).length
    const totalLatency     = logs.reduce((s, l) => s + l.latencyMs, 0)
    const totalTokens      = logs.reduce((s, l) => s + l.totalTokens, 0)
    const totalCost        = logs.reduce((s, l) => s + l.estimatedCostUsd, 0)

    const byFeature = {}
    for (const log of logs) {
      const f = byFeature[log.feature] || (byFeature[log.feature] = { total: 0, accepted: 0, edited: 0, rejected: 0, pending: 0, totalTokens: 0, totalCost: 0, totalLatency: 0 })
      f.total++
      f[log.outcome] = (f[log.outcome] || 0) + 1
      f.totalTokens  += log.totalTokens
      f.totalCost    += log.estimatedCostUsd
      f.totalLatency += log.latencyMs
    }

    for (const [feat, stats] of Object.entries(byFeature)) {
      stats.acceptanceRate   = stats.total > 0 ? +(stats.accepted / stats.total * 100).toFixed(1) : 0
      stats.avgLatencyMs     = stats.total > 0 ? Math.round(stats.totalLatency / stats.total) : 0
    }

    res.json({
      success: true,
      period: { days, since },
      summary: {
        total, accepted, edited, rejected,
        pending: logs.filter(l => l.outcome === 'pending').length,
        acceptanceRate:    total > 0 ? +(accepted / total * 100).toFixed(1) : 0,
        hallucinationRate: withVerification.length > 0 ? +(hallucinated / withVerification.length * 100).toFixed(1) : 0,
        avgLatencyMs:      total > 0 ? Math.round(totalLatency / total) : 0,
        totalTokens,
        estimatedCostUsd:  +totalCost.toFixed(4)
      },
      byFeature
    })
  } catch (err) {
    console.error('[llm/health]', err)
    res.status(500).json({ success: false, message: err.message })
  }
}

exports.updateOutcome = async (req, res) => {
  try {
    const { id } = req.params
    const { outcome, correctedCompletion, testPassedFirstRun } = req.body
    const valid = ['accept', 'edit', 'reject']
    if (!valid.includes(outcome)) return res.status(400).json({ success: false, message: 'outcome must be accept | edit | reject' })

    const update = { outcome }
    if (correctedCompletion !== undefined) update.correctedCompletion = correctedCompletion
    if (testPassedFirstRun  !== undefined) update.testPassedFirstRun  = Boolean(testPassedFirstRun)

    const log = await prisma.lLMInteractionLog.update({ where: { id }, data: update })

    // Capture user rejection as hallucination signal for prompt improvement
    if (outcome === 'reject' && log) {
      const FEATURE_TO_PROMPT = {
        TestGen:     'generate_runnable_spec',
        LocatorHeal: 'heal_runnable_spec',
        PlanGen:     'plan_with_probe',
        BugTitle:    'bug_title',
        PageObject:  'page_object',
        Fixture:     'fixture',
        SeedCode:    'generate_seed_code'
      }
      const promptKey = FEATURE_TO_PROMPT[log.feature]
      if (promptKey) {
        require('../services/hallucinationService').capture({
          promptKey,
          failureType: 'user_reject',
          aiOutput: log.completion,
          userMessage: log.prompt,
          userFeedback: 'reject'
        })
      }
    }

    res.json({ success: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Log not found' })
    res.status(500).json({ success: false, message: err.message })
  }
}

