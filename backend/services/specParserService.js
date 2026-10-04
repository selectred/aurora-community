const ai = require('./aiService')

const SYSTEM_PROMPT = `You are a Playwright test analyser. Extract a structured intent graph from a Playwright spec file.

Return ONLY a JSON object — no markdown fences, no explanation:

{
  "title": "test title from the test() call",
  "steps": [
    {
      "id": 1,
      "type": "navigate | fill | click | assert | wait-url | wait-load | clear-auth | select | check | custom",
      "intent": "Concise human-readable description of what this step is testing or doing",
      "url": "full URL string for navigate/wait-url steps, else null",
      "selector": "the original selector expression as written in the code, else null",
      "selectorType": "role | label | placeholder | text | css | testid | nth | custom | null",
      "selectorText": "the string used inside the selector e.g. 'Email Address', else null",
      "value": "for fill/select: the value being entered, else null",
      "assertion": "for assert steps: the expect method name e.g. toHaveTitle, toBeVisible, toHaveURL, else null",
      "expected": "for assert steps: expected value as a string, else null",
      "isCredential": false,
      "credentialHint": "email | password | username | apikey | null"
    }
  ]
}

Mapping rules:
- page.goto() → type "navigate"
- page.waitForURL() → type "wait-url"
- page.waitForLoadState() / waitForNavigation() → type "wait-load"
- localStorage.clear() + sessionStorage.clear() + clearCookies() together → ONE step, type "clear-auth"
- locator.fill() / page.fill() → type "fill"
- locator.click() / page.click() / getByRole('button').click() → type "click"
- expect().toBeVisible() / toHaveTitle() / toHaveURL() / toHaveText() / toContainText() → type "assert"
- locator.selectOption() / page.selectOption() → type "select"
- locator.check() / page.check() → type "check"
- Anything else → type "custom", describe it in intent

Selector type detection:
- getByRole() → role; selectorText is the name: value
- getByLabel() → label; selectorText is the label text
- getByPlaceholder() → placeholder; selectorText is the placeholder
- getByText() → text; selectorText is the text
- locator('css') / page.locator() → css; selectorText is the CSS selector
- getByTestId() → testid

Credential detection:
- Values that look like passwords → isCredential: true, credentialHint: "password"
- Email values used in login flows → isCredential: true, credentialHint: "email"
- API keys, tokens → isCredential: true, credentialHint: "apikey"
- Usernames in login flows → isCredential: true, credentialHint: "username"
- Data values in tests (team names, descriptions etc.) → isCredential: false`

async function parseSpec(specCode) {
  const raw = await ai.complete(
    SYSTEM_PROMPT,
    `Parse this Playwright spec:\n\n${specCode}`,
    4000,
    'SpecParse'
  )

  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(json)

  // Validate and normalise
  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    throw new Error('Parser returned invalid structure — missing steps array')
  }

  parsed.steps = parsed.steps.map((step, i) => ({
    id: step.id ?? i + 1,
    type: step.type ?? 'custom',
    intent: step.intent ?? '',
    url: step.url ?? null,
    selector: step.selector ?? null,
    selectorType: step.selectorType ?? null,
    selectorText: step.selectorText ?? null,
    value: step.value ?? null,
    assertion: step.assertion ?? null,
    expected: step.expected ?? null,
    isCredential: step.isCredential ?? false,
    credentialHint: step.credentialHint ?? null
  }))

  return parsed
}

// Quick static pre-scan — extract URLs and test title without an AI call.
// Used to populate metadata before the full parse runs.
function quickScan(specCode) {
  const titleMatch = specCode.match(/test\s*\(\s*['"`]([^'"`]+)['"`]/)
  const urls = [...specCode.matchAll(/['"`](https?:\/\/[^'"`\s]+)['"`]/g)].map(m => m[1])
  const uniqueUrls = [...new Set(urls)]
  return {
    title: titleMatch?.[1] ?? null,
    urls: uniqueUrls
  }
}

module.exports = { parseSpec, quickScan }
