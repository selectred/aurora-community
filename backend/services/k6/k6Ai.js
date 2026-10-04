'use strict'
// ============================================
// services/k6/k6Ai.js
// Optional "Improve with AI" pass over a converter-generated k6 script. The
// deterministic converter output is always usable on its own; the AI only adds
// better checks, naming and structure. Works with any configured provider,
// including a local model.
// ============================================
const ai = require('../aiService')
const k6Tool = require('./k6Tool')

const SYSTEM = `You are a senior k6 performance engineer. You are given a k6 script that Aurora generated from a recorded browser session, plus notes about it. Improve it and return the complete script.

Rules:
- Keep every HTTP request, in the same order, with the same method and URL.
- Keep every correlated variable and the res.json(...) line that sets it. Do not replay literal tokens or ids.
- Keep secrets in __ENV variables. Never write a password, token or API key as a literal.
- Keep the BASE_URL-style constants and THINK_TIME, and keep the exported options object, including thresholds.
- Improve checks: keep the status check and, where the response is clearly JSON, add one meaningful body check (for example that an expected field exists). Never make a check stricter than the recorded response supports.
- Keep group() structure; you may rename groups to describe the user action.
- Use only k6 built-in modules (k6, k6/http). No external imports.
- Output ONLY the JavaScript source. No markdown fences, no explanation.`

function stripFences (text) {
  return String(text || '').replace(/^\s*```(?:javascript|js)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim() + '\n'
}

/**
 * @returns {{ script, validated: boolean, warning?: string }}
 */
async function improve (script, summary = {}) {
  if (!(await ai.checkAvailable())) {
    const e = new Error('No AI provider is configured. Set one up in Settings → System, or use the generated script as it is.')
    e.status = 503
    throw e
  }
  const notes = [
    `Correlated values: ${(summary.correlations || []).map(c => `${c.variable} from ${c.from} (${c.path})`).join('; ') || 'none'}`,
    `Secrets as env vars: ${(summary.secrets || []).join(', ') || 'none'}`
  ].join('\n')
  const out = stripFences(await ai.complete(SYSTEM, `${notes}\n\nScript:\n${script}`, 8000, 'K6Convert'))
  if (!/export default function/.test(out) || !/k6\/http/.test(out)) {
    const e = new Error('The AI response was not a k6 script; the original script is unchanged.')
    e.status = 502
    throw e
  }
  const check = await k6Tool.inspect(out)
  if (check.notInstalled) return { script: out, validated: false, warning: 'k6 is not installed yet, so the improved script has not been validated. Run a smoke test before pushing.' }
  if (!check.ok) {
    const e = new Error('k6 could not load the AI-improved script; the original script is unchanged.')
    e.status = 422
    e.detail = check.error
    throw e
  }
  return { script: out, validated: true }
}

module.exports = { improve, SYSTEM, stripFences }
