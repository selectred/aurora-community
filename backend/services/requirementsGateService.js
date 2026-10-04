const TRIGGER_RE = /\b(when|if|while|given|where|on)\b/i
const RESPONSE_RE = /\b(shall|will|must)\b/i

const VAGUE_TERMS = [
  'appropriate', 'fast', 'intuitive', 'user-friendly', 'properly',
  'efficient', 'robust', 'seamless', 'easy', 'adequate', 'reasonable',
  'good', 'nice', 'should'
]

const VAGUE_SUGGESTIONS = {
  appropriate: 'Replace "appropriate" with a specific measurable criterion.',
  fast: 'Replace "fast" with a performance target, e.g. "responds within 2 seconds".',
  intuitive: 'Replace "intuitive" with a specific usability measure, e.g. "completable without help documentation".',
  'user-friendly': 'Replace "user-friendly" with a specific measurable criterion, e.g. "completable in under 3 clicks".',
  properly: 'Replace "properly" with the specific expected behaviour.',
  efficient: 'Replace "efficient" with a measurable metric, e.g. "processes in under 500 ms".',
  robust: 'Replace "robust" with specific error-handling or resilience criteria.',
  seamless: 'Replace "seamless" with a specific integration or transition requirement.',
  easy: 'Replace "easy" with a specific usability measure.',
  adequate: 'Replace "adequate" with a specific minimum threshold.',
  reasonable: 'Replace "reasonable" with a specific measurable value.',
  good: 'Replace "good" with a specific quality metric.',
  nice: 'Replace "nice" with a specific visual or usability criterion.',
  should: '"Should" implies optionality — use "shall" or "must" if mandatory, or remove the requirement if truly optional.'
}

function words4Plus (text) {
  return text.toLowerCase().match(/[a-z]{4,}/g) || []
}

function jaccard (a, b) {
  const sa = new Set(a)
  const sb = new Set(b)
  const inter = [...sa].filter(w => sb.has(w)).length
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : inter / union
}

function analyzeRequirement (text, type, dodTexts) {
  if (type === 'DoD') {
    return { score: null, isDoD: true, flags: [], flagDetails: [], suggestions: [] }
  }

  let deductions = 0
  const flags = []
  const flagDetails = []
  const suggestions = []
  const lower = text.toLowerCase()

  // 1. EARS shape
  const hasTrigger = TRIGGER_RE.test(lower)
  const hasResponse = RESPONSE_RE.test(lower)
  if (!hasTrigger || !hasResponse) {
    deductions += 30
    flags.push('MISSING_EARS_SHAPE')
    const detail = !hasTrigger && !hasResponse
      ? 'Missing both a trigger word and a response word'
      : !hasTrigger
        ? 'Missing trigger word (When / If / While / Given / Where / On)'
        : 'Missing response word (shall / will / must)'
    flagDetails.push({ flag: 'MISSING_EARS_SHAPE', detail })
    suggestions.push('Start with a trigger word (When / If / While / Given) and include a response word (shall / will / must) to make this testable.')
  }

  // 2. Vague terms (max 2 penalties = -30 max)
  let vagueCount = 0
  for (const term of VAGUE_TERMS) {
    if (vagueCount >= 2) break
    const re = new RegExp(`\\b${term.replace('-', '\\-')}\\b`, 'gi')
    let match
    while ((match = re.exec(lower)) !== null) {
      const after = lower.slice(match.index + term.length, match.index + term.length + 30)
      if (!/\d/.test(after)) {
        const flagKey = `VAGUE:${term.toUpperCase()}`
        deductions += 15
        vagueCount++
        flags.push(flagKey)
        flagDetails.push({ flag: flagKey, detail: `Vague term "${term}" with no numeric qualifier following` })
        suggestions.push(VAGUE_SUGGESTIONS[term] || `Replace "${term}" with a specific, measurable criterion.`)
        break
      }
    }
  }

  // 3. DoD collision (Jaccard > 0.5 vs any DoD entry)
  if (dodTexts && dodTexts.length > 0) {
    const reqWords = words4Plus(text)
    for (const dod of dodTexts) {
      if (jaccard(reqWords, words4Plus(dod)) > 0.5) {
        deductions += 25
        flags.push('DUPLICATES_DOD')
        flagDetails.push({ flag: 'DUPLICATES_DOD', detail: 'Content substantially overlaps with a Definition of Done entry' })
        suggestions.push('This reads like a Definition of Done entry rather than a testable acceptance criterion — consider moving it to the DoD category.')
        break
      }
    }
  }

  return {
    score: Math.max(0, 100 - deductions),
    isDoD: false,
    flags,
    flagDetails,
    suggestions
  }
}

function analyzeBatch (items) {
  const dodTexts = items.filter(i => i.type === 'DoD').map(i => i.text)
  return items.map((item, index) => ({
    id: item.id !== undefined ? item.id : index,
    text: item.text,
    type: item.type || 'AC',
    reference: item.reference || '',
    ...analyzeRequirement(item.text, item.type, dodTexts)
  }))
}

module.exports = { analyzeRequirement, analyzeBatch }
