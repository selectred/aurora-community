'use strict'
const router = require('express').Router()
const { authMiddleware } = require('../middleware/auth')
const { checkProFeature } = require('../middleware/license')
const prisma = require('../lib/prisma')
const promptService = require('../services/promptService')
const aiService = require('../services/aiService')

const LOOKBACK_DAYS = 30
const ANALYZE_THRESHOLD = 5

function lookbackDate() {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
}

// POST /api/hallucinations/log
// Frontend-initiated hallucination capture (e.g. user_reject when recording to replace AI spec).
router.post('/log', authMiddleware, async (req, res) => {
  const { specId, failureType, aiOutputSnippet = '', userMessageSnippet = '', targetUrl } = req.body
  try {
    let promptKey = 'generate_runnable_spec'
    let promptVersionHash = ''
    if (specId) {
      const spec = await prisma.agentTestSpec.findUnique({ where: { specId }, select: { url: true } })
      if (spec?.url) promptKey = `generate_runnable_spec`
    }
    const { randomUUID } = require('crypto')
    await prisma.hallucinationLog.create({
      data: {
        id: randomUUID(),
        promptKey,
        promptVersionHash,
        failureType: failureType || 'user_reject',
        aiOutputSnippet: (aiOutputSnippet || '').slice(0, 500),
        userMessageSnippet: (userMessageSnippet || '').slice(0, 200),
        targetUrl: targetUrl || null,
        resolved: false
      }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/hallucinations/counts
// Returns unresolved event counts per promptKey for the last 30 days.
router.get('/counts', authMiddleware, async (req, res) => {
  try {
    const rows = await prisma.hallucinationLog.groupBy({
      by: ['promptKey'],
      where: { resolved: false, createdAt: { gte: lookbackDate() } },
      _count: { id: true }
    })
    const counts = {}
    for (const r of rows) counts[r.promptKey] = r._count.id
    res.json({ success: true, counts })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/hallucinations/analyze/:key  (Pro+)
// Fetches recent unresolved events for a prompt key and calls AI to suggest an improvement.
router.post('/analyze/:key', authMiddleware, checkProFeature, async (req, res) => {
  const { key } = req.params
  try {
    const events = await prisma.hallucinationLog.findMany({
      where: { promptKey: key, resolved: false, createdAt: { gte: lookbackDate() } },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    if (events.length < ANALYZE_THRESHOLD) {
      return res.status(400).json({
        success: false,
        message: `Need at least ${ANALYZE_THRESHOLD} unresolved events to analyze (have ${events.length})`
      })
    }

    // Check for enough distinct failure types to rule out a single bad target URL
    const distinctTypes = new Set(events.map(e => e.failureType))
    if (distinctTypes.size < 2) {
      return res.status(400).json({
        success: false,
        message: `Only one failure type seen (${[...distinctTypes][0]}). This looks like a bad target URL rather than a prompt issue — run against a different URL first.`
      })
    }

    const currentPrompt = promptService.get(key)
    const typeFrequency = {}
    for (const e of events) typeFrequency[e.failureType] = (typeFrequency[e.failureType] || 0) + 1

    const failureSummary = events.map(e =>
      `- [${e.failureType}] healAttempts=${e.healAttempts} feedback=${e.userFeedback || 'none'}\n  output: ${e.aiOutputSnippet || '(none)'}`
    ).join('\n')

    const metaSystemPrompt = `You are a prompt engineering expert specialising in AI test generation systems.
Your task is to suggest a minimal, targeted improvement to a system prompt that will reduce the hallucination failures shown below.

RULES:
- Do NOT rewrite the entire prompt — make targeted additions or clarifications only
- Focus on the most common failure type shown in the frequency data
- Keep additions concise and placed logically within the existing structure
- Return ONLY valid JSON — no markdown, no explanation outside the JSON

Return this exact JSON shape:
{
  "improvedPrompt": "<the full improved prompt text>",
  "changesSummary": "<one short paragraph explaining what you changed and why>"
}`

    const metaUserMessage = `Current prompt (key: ${key}):
---
${currentPrompt}
---

Failure type frequency (last ${LOOKBACK_DAYS} days, ${events.length} events):
${JSON.stringify(typeFrequency, null, 2)}

Sample failure events:
${failureSummary}`

    const raw = await aiService.complete(metaSystemPrompt, metaUserMessage, 2500, 'PromptAnalysis')
    const parsed = JSON.parse(raw.replace(/^```json?\n?/i, '').replace(/\n?```\s*$/i, '').trim())

    res.json({
      success: true,
      suggestion: parsed.improvedPrompt,
      changesSummary: parsed.changesSummary,
      eventCount: events.length,
      failureTypes: typeFrequency
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// POST /api/hallucinations/resolve/:key  (Pro+)
// Marks all unresolved events for a key as resolved (called after user applies a suggestion).
router.post('/resolve/:key', authMiddleware, checkProFeature, async (req, res) => {
  const { key } = req.params
  try {
    const { count } = await prisma.hallucinationLog.updateMany({
      where: { promptKey: key, resolved: false },
      data: { resolved: true }
    })
    res.json({ success: true, resolved: count })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
