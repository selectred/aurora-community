'use strict'
const crypto = require('crypto')
const prisma = require('../lib/prisma')
const promptService = require('./promptService')

function hashPrompt(key) {
  const text = promptService.get(key) || ''
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 8)
}

// Record a hallucination event. Always non-fatal — never throws.
async function capture({ promptKey, failureType, aiOutput, userMessage, ariaSnapshot, targetUrl, healAttempts, userFeedback }) {
  try {
    await prisma.hallucinationLog.create({
      data: {
        promptKey,
        promptVersionHash:   hashPrompt(promptKey),
        failureType,
        aiOutputSnippet:     (aiOutput    || '').slice(0, 500),
        userMessageSnippet:  (userMessage || '').slice(0, 300) || null,
        ariaSnapshotSnippet: (ariaSnapshot || '').slice(0, 500) || null,
        targetUrl:           targetUrl   || null,
        healAttempts:        healAttempts || 0,
        userFeedback:        userFeedback || null
      }
    })
  } catch (err) {
    console.warn('[hallucinationService] capture failed (non-fatal):', err.message)
  }
}

module.exports = { capture, hashPrompt }
