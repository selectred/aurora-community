const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const promptService = require('./promptService');

// ─── Concurrency limiter ──────────────────────────────────────────────────────
// Caps simultaneous AI calls regardless of which feature triggered them.
// Requests beyond the limit queue up instead of failing.
const _MAX_CONCURRENT_AI = 3
let _aiActive = 0
const _aiQueue = []

function _acquireAiSlot() {
  return new Promise(resolve => {
    if (_aiActive < _MAX_CONCURRENT_AI) { _aiActive++; resolve() }
    else _aiQueue.push(resolve)
  })
}

function _releaseAiSlot() {
  if (_aiQueue.length > 0) { _aiQueue.shift()() }
  else _aiActive--
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function _isRateLimitError(e) {
  const status = e.status || e.response?.status
  if (status === 429 || status === 529) return true
  const msg = (e.message || '').toLowerCase()
  return msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('too many requests')
}
// ─────────────────────────────────────────────────────────────────────────────

class AIService {
  constructor() {
    this._client = null;
    this._activeProvider = null;
    this._currentModel = null;
    this._anthropicModel = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20251001';
    this._openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';
    // Telemetry
    this._nextFeature = 'unknown';
    this._nextContext = {};
    this.lastLogId = null;
  }

  // Cost lookup (USD per 1M tokens)
  _estimateCost(provider, model, promptTokens, completionTokens) {
    if (provider === 'local') return 0;
    const PRICING = {
      'claude-sonnet-4-5-20251001': { in: 3.0, out: 15.0 },
      'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
      'claude-opus-4-7': { in: 15.0, out: 75.0 },
      'claude-opus-4-8': { in: 15.0, out: 75.0 },
      'claude-haiku-4-5-20251001': { in: 0.8, out: 4.0 },
      'gpt-4o': { in: 2.5, out: 10.0 },
      'gpt-4o-mini': { in: 0.15, out: 0.6 },
    };
    const p = PRICING[model] || (provider === 'anthropic' ? { in: 3.0, out: 15.0 } : { in: 2.5, out: 10.0 });
    return ((promptTokens * p.in) + (completionTokens * p.out)) / 1_000_000;
  }

  // Detect hallucinated selectors by checking generated code against ARIA context
  _detectHallucinations(completion, ariaContext) {
    if (!ariaContext || typeof ariaContext !== 'string') return null;
    const patterns = [
      /getByRole\([^,)]+,\s*\{[^}]*name:\s*['"`]([^'"`]+)['"`]/g,
      /getByLabel\(['"`]([^'"`]+)['"`]\)/g,
      /getByText\(['"`]([^'"`]+)['"`]\)/g,
      /getByPlaceholder\(['"`]([^'"`]+)['"`]\)/g,
    ];
    const names = new Set();
    for (const re of patterns) {
      let m;
      while ((m = re.exec(completion)) !== null) names.add(m[1].toLowerCase());
    }
    if (names.size === 0) return true;
    const lower = ariaContext.toLowerCase();
    let found = 0;
    for (const n of names) { if (lower.includes(n)) found++; }
    return (found / names.size) >= 0.75;
  }

  async _logInteraction({ feature, context, prompt, completion, promptTokens, completionTokens, latencyMs, provider, model, locatorsVerified }) {
    try {
      const totalTokens = promptTokens + completionTokens;
      const log = await prisma.lLMInteractionLog.create({
        data: {
          feature: feature || 'unknown',
          sessionId: context?.sessionId || '',
          specId: context?.specId || null,
          prompt: (prompt || '').slice(0, 8000),
          completion: (completion || '').slice(0, 8000),
          promptTokens, completionTokens, totalTokens,
          estimatedCostUsd: this._estimateCost(provider, model, promptTokens, completionTokens),
          latencyMs, modelUsed: model || '', provider: provider || '',
          locatorsVerified: locatorsVerified ?? null
        }
      });
      this.lastLogId = log.id;
      return log.id;
    } catch (e) {
      console.warn('[LLM log]', e.message);
      return null;
    }
  }

  async logOutcome(logId, outcome, correctedCompletion, testPassedFirstRun) {
    if (!logId) return;
    try {
      await prisma.lLMInteractionLog.update({
        where: { id: logId },
        data: { outcome, correctedCompletion: correctedCompletion || null, testPassedFirstRun: testPassedFirstRun ?? null }
      });
    } catch (e) { /* non-fatal */ }
  }

  async initialize() {
    await this._getClient();
  }

  isAvailable() {
    return this._client !== null;
  }

  async checkAvailable() {
    const { client } = await this._getClient();
    return client !== null;
  }

  // Resolve client from DB, re-creating only when provider changes
  async _getClient() {
    const settings = await prisma.appSettings.findFirst({
      select: {
        activeAiProvider: true,
        anthropicKey: true,
        openaiKey: true,
        azureOpenaiKey: true, azureOpenaiEndpoint: true, azureOpenaiDeployment: true,
        localLlmEndpoint: true, localLlmModel: true, localLlmApiKey: true
      }
    });

    const provider = settings?.activeAiProvider || 'none';

    if (provider === this._activeProvider && this._client) {
      return { client: this._client, provider, model: this._currentModel };
    }

    if (provider === 'anthropic' && settings?.anthropicKey) {
      this._client = new Anthropic({ apiKey: settings.anthropicKey });
      this._activeProvider = 'anthropic';
      this._currentModel = this._anthropicModel;
    } else if (provider === 'openai' && settings?.openaiKey) {
      this._client = new OpenAI({ apiKey: settings.openaiKey });
      this._activeProvider = 'openai';
      this._currentModel = this._openaiModel;
    } else if (provider === 'azure-openai' && settings?.azureOpenaiKey && settings?.azureOpenaiEndpoint) {
      const deployment = settings.azureOpenaiDeployment || 'gpt-4';
      this._client = new OpenAI({
        apiKey: settings.azureOpenaiKey,
        baseURL: `${settings.azureOpenaiEndpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`,
        defaultQuery: { 'api-version': '2024-02-01' },
        defaultHeaders: { 'api-key': settings.azureOpenaiKey }
      });
      this._activeProvider = 'azure-openai';
      this._currentModel = deployment;
    } else if (provider === 'local' && settings?.localLlmEndpoint) {
      this._client = new OpenAI({
        apiKey: settings.localLlmApiKey || 'local',
        baseURL: `${settings.localLlmEndpoint.replace(/\/$/, '')}/v1`
      });
      this._activeProvider = 'local';
      this._currentModel = settings.localLlmModel || 'llama3.2';
    } else {
      this._client = null;
      this._activeProvider = 'none';
      this._currentModel = null;
    }

    return { client: this._client, provider: this._activeProvider, model: this._currentModel };
  }

  // Streaming helper — abstracts Anthropic vs OpenAI-compat event formats
  async _doStream(systemPrompt, userMessage, maxTokens, onChunk, feature, context) {
    const { client, provider, model } = await this._getClient();
    if (!client) throw new Error('AI provider not configured');
    const start = Date.now();
    let fullContent = '', promptTokens = 0, completionTokens = 0;

    if (provider === 'anthropic') {
      const stream = client.messages.stream({
        model, max_tokens: maxTokens, system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullContent += event.delta.text;
          if (onChunk) onChunk(event.delta.text);
        }
      }
      const msg = await stream.finalMessage().catch(() => null);
      promptTokens = msg?.usage?.input_tokens || 0;
      completionTokens = msg?.usage?.output_tokens || 0;
    } else {
      const stream = await client.chat.completions.create({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        stream: true, stream_options: { include_usage: true }
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) { fullContent += text; if (onChunk) onChunk(text); }
        if (chunk.usage) { promptTokens = chunk.usage.prompt_tokens || 0; completionTokens = chunk.usage.completion_tokens || 0; }
      }
    }

    // Estimate tokens from text if SDK didn't return them
    if (!promptTokens) promptTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
    if (!completionTokens) completionTokens = Math.ceil(fullContent.length / 4);

    await this._logInteraction({ feature, context, prompt: `${systemPrompt}\n\n${userMessage}`, completion: fullContent, promptTokens, completionTokens, latencyMs: Date.now() - start, provider, model });
    return fullContent;
  }

  // Public single-call completion for internal tooling (e.g. prompt analysis)
  async complete(systemPrompt, userMessage, maxTokens = 2000, feature = 'PromptAnalysis') {
    this._nextFeature = feature
    return this._complete(systemPrompt, userMessage, maxTokens)
  }

  // Concurrency-limited, retry-on-429 wrapper for streaming calls
  async _stream(systemPrompt, userMessage, maxTokens, onChunk) {
    const feature = this._nextFeature; const context = { ...this._nextContext };
    this._nextFeature = 'unknown'; this._nextContext = {};
    await _acquireAiSlot();
    try {
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[AI] Rate limited (stream), retrying in ${delay / 1000}s (attempt ${attempt + 1}/3)`);
          await _sleep(delay);
        }
        try {
          return await this._doStream(systemPrompt, userMessage, maxTokens, onChunk, feature, context);
        } catch (e) {
          lastErr = e;
          if (!_isRateLimitError(e)) throw e;
        }
      }
      throw lastErr;
    } finally {
      _releaseAiSlot();
    }
  }

  // Concurrency-limited, retry-on-429 wrapper for non-streaming calls
  async _complete(systemPrompt, userMessage, maxTokens) {
    const feature = this._nextFeature; const context = { ...this._nextContext };
    this._nextFeature = 'unknown'; this._nextContext = {};
    await _acquireAiSlot();
    try {
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[AI] Rate limited, retrying in ${delay / 1000}s (attempt ${attempt + 1}/3)`);
          await _sleep(delay);
        }
        try {
          return await this._doComplete(systemPrompt, userMessage, maxTokens, feature, context);
        } catch (e) {
          lastErr = e;
          if (!_isRateLimitError(e)) throw e;
        }
      }
      throw lastErr;
    } finally {
      _releaseAiSlot();
    }
  }

  // Non-streaming helper
  async _doComplete(systemPrompt, userMessage, maxTokens, feature, context) {
    const { client, provider, model } = await this._getClient();
    if (!client) throw new Error('AI provider not configured');
    const start = Date.now();
    let text = '', promptTokens = 0, completionTokens = 0;

    if (provider === 'anthropic') {
      const response = await client.messages.create({
        model, max_tokens: maxTokens, system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });
      text = response.content[0]?.text || '';
      promptTokens = response.usage?.input_tokens || 0;
      completionTokens = response.usage?.output_tokens || 0;
    } else {
      const response = await client.chat.completions.create({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }]
      });
      text = response.choices[0]?.message?.content || '';
      promptTokens = response.usage?.prompt_tokens || 0;
      completionTokens = response.usage?.completion_tokens || 0;
    }

    await this._logInteraction({ feature, context, prompt: `${systemPrompt}\n\n${userMessage}`, completion: text, promptTokens, completionTokens, latencyMs: Date.now() - start, provider, model });
    return text;
  }

  async generatePlan(prompt, onChunk) {
    this._nextFeature = 'PlanGen';
    const hasProbeData = prompt.includes('--- Page structure (from live probe) ---')

    const systemPrompt = hasProbeData
      ? promptService.get('plan_with_probe')
      : promptService.get('plan_no_probe')

    return this._stream(systemPrompt, `Create a test plan for: ${prompt}`, 2048, onChunk)
  }

  async generateCode(planMarkdown, targetUrl, onChunk) {
    this._nextFeature = 'TestGen';
    const systemPrompt = promptService.get('generate_code')
    const userMessage = `Target URL: ${targetUrl}\n\n${planMarkdown}`
    const fullContent = await this._stream(systemPrompt, userMessage, 4096, onChunk);
    const codeMatch = fullContent.match(/```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : fullContent;
  }

  async generateBugTitle(specName, errorMessage) {
    this._nextFeature = 'BugTitle';
    return this._complete(
      promptService.get('bug_title'),
      `Test "${specName}" failed with: ${(errorMessage || 'unknown error').slice(0, 200)}\n\nWrite a one-line bug title (max 80 chars). No quotes.`,
      60
    ).then(t => t.trim().slice(0, 80));
  }

  async generatePackCode(pack, specs, onChunk) {
    this._nextFeature = 'TestGen';
    const specList = specs.map(s => `- "${s.name}": ${s.description || s.url}`).join('\n');
    const prompt = `Generate a single Playwright test file for test pack "${pack.name}".

Specs:
${specList}

Setup hint: ${pack.packSetupCode || 'none'}
Teardown hint: ${pack.packTeardownCode || 'none'}

Rules: declare const ctx = {} for shared state. beforeAll/afterAll use { request }. Each spec is a separate test() block that may store values in ctx.`;

    return this.generateCode(prompt, specs[0]?.url || '', onChunk || (() => {}));
  }

  // Generate a TypeScript Page Object Model from probe data or live context
  async generatePageObject(probeData, url, specBaseName, liveContext = null) {
    this._nextFeature = 'PageObject';
    const className = this._toPascalCase(specBaseName) + 'Page'
    const pageContext = liveContext
      ? liveContext
      : probeData
        ? require('./pageProbeService').formatForPrompt(probeData)
        : `URL: ${url}`

    return this._complete(
      promptService.get('page_object'),
      `Class name: ${className}\n\n${pageContext}`,
      2048
    )
  }

  // Generate a TypeScript Playwright fixture file from probe data or live context
  async generateFixture(probeData, url, specBaseName, liveContext = null) {
    this._nextFeature = 'Fixture';
    const className = this._toPascalCase(specBaseName) + 'Page'
    const fixtureName = specBaseName.replace(/-/g, '_')
    const pageContext = liveContext
      ? liveContext
      : probeData
        ? require('./pageProbeService').formatForPrompt(probeData)
        : `URL: ${url}`

    return this._complete(
      promptService.get('fixture'),
      `POM class: ${className}\nFixture name: ${fixtureName}\nImport path: ../pages/${className}\n\n${pageContext}`,
      1024
    )
  }

  // Generate a TypeScript spec file using fixtures
  async generateTypeScriptSpec(planMarkdown, url, specBaseName, probeData, liveContext = null) {
    this._nextFeature = 'TestGen';
    const className = this._toPascalCase(specBaseName) + 'Page'
    const fixtureName = specBaseName.replace(/-/g, '_')
    const fixtureImport = `../${specBaseName}.fixture`
    const pageContext = liveContext
      ? '\n\nLive page snapshot:\n' + liveContext
      : probeData
        ? '\n\nReal page elements:\n' + require('./pageProbeService').formatForPrompt(probeData)
        : ''

    const userMessage = `Fixture import: ${fixtureImport}
POM class: ${className}
Fixture name: ${fixtureName}
Target URL: ${url}${pageContext}

Test plan to implement:
${planMarkdown}`

    return this._complete(promptService.get('typescript_spec'), userMessage, 3000)
  }

  _toPascalCase(str) {
    return str.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  }

  // Generate a self-contained JavaScript Playwright spec (no imports, no POM/fixture)
  // executed in-process via playwrightShimRunner.runGeneratedSpec, not the real Playwright CLI
  async generateRunnableSpec(planMarkdown, url, probeData, failures = [], liveContext = null, currentSpec = null, packVarNames = []) {
    this._nextFeature = failures.length > 0 ? 'LocatorHeal' : 'TestGen';
    const pageContext = liveContext
      ? '\n\nLive page snapshot (use these exact names — observed from real browser):\n' + liveContext
      : probeData
        ? '\n\nPage structure:\n' + require('./pageProbeService').formatForPrompt(probeData)
        : ''

    const varContext = packVarNames.length > 0
      ? '\n\nPACK VARIABLES — use these as {{NAME}} placeholders instead of hardcoding values:\n' +
        packVarNames.map(v => `  {{${v.name}}}${v.description ? ' — ' + v.description : ''}`).join('\n') +
        '\nIMPORTANT: Never hardcode credentials, hostnames, or API keys. Always use the {{NAME}} placeholder form.'
      : ''

    const basePrompt = promptService.get('generate_runnable_spec')
    const systemPrompt = failures.length > 0
      ? basePrompt + '\n\n' + promptService.get('heal_runnable_spec')
      : basePrompt

    const failureContext = failures.length > 0
      ? `\n\nPREVIOUS RUN FAILURES — fix each one:\n` +
        failures.map(f => {
          const err = f.error || ''
          let category = ''
          if (/SecurityError.*localStorage|localStorage.*Access is denied/i.test(err)) category = ' [LOCALSTORAGE SECURITY ERROR — page.evaluate called before navigation; move it after page.goto]'
          else if (/strict mode/i.test(err)) category = ' [STRICT MODE VIOLATION — multiple elements matched]'
          else if (/waitForEvent|waiting for event.*page/i.test(err)) category = ' [NEW TAB WAIT TIMEOUT — used context.waitForEvent but link navigates same tab; replace with click + waitForURL]'
          else if (/waitForURL/i.test(err)) category = ' [URL REDIRECT TIMEOUT — the URL never changed; the redirect did not happen]'
          else if (/timeout|waiting for/i.test(err)) category = ' [TIMEOUT — element not ready]'
          else if (/not found|no element/i.test(err)) category = ' [SELECTOR NOT FOUND]'
          else if (/url mismatch/i.test(err)) category = ' [URL CHECK FAILED]'
          else if (/title mismatch/i.test(err)) category = ' [TITLE CHECK FAILED]'
          return `- "${f.step}"${category}: ${err}`
        }).join('\n')
      : ''

    const userMessage = failures.length > 0 && currentSpec
      ? `Target URL: ${url}${pageContext}${varContext}${failureContext}

CURRENT SPEC — use this as your base. Copy every passing test EXACTLY as written. Only rewrite the failing tests listed above:
${currentSpec}`
      : `Target URL: ${url}${pageContext}${varContext}${failureContext}

Test plan to implement:
${planMarkdown}`

    const fullContent = await this._complete(systemPrompt, userMessage, 3000)
    let cleaned = fullContent.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()

    // Hallucination detection — check locator names against the ARIA snapshot
    this.lastHallucinationWarning = false
    if (liveContext) {
      const locatorsVerified = this._detectHallucinations(cleaned, liveContext)
      if (this.lastLogId && locatorsVerified !== null) {
        prisma.lLMInteractionLog.update({ where: { id: this.lastLogId }, data: { locatorsVerified } }).catch(() => {})
      }
      if (locatorsVerified === false) {
        // AI used names not found in the ARIA snapshot — retry with stricter grounding
        console.warn('[AI] Hallucination detected in generated code — retrying with strict ARIA grounding')
        require('./hallucinationService').capture({ promptKey: 'generate_runnable_spec', failureType: 'aria_mismatch', aiOutput: cleaned, userMessage, ariaSnapshot: liveContext, targetUrl: url })
        try {
          const retryContent = await this._complete(
            systemPrompt + '\n\nCRITICAL — YOUR PREVIOUS ATTEMPT FAILED HALLUCINATION CHECK: You used locator names that do not exist in the live ARIA snapshot. Look at the ARIA snapshot carefully and use ONLY the exact accessible names you can see there. Do not invent button labels, link names, or field labels.',
            userMessage,
            3000
          )
          const retryCleaned = retryContent.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()
          const retryVerified = this._detectHallucinations(retryCleaned, liveContext)
          if (retryVerified !== false) {
            cleaned = retryCleaned
          } else {
            // Still hallucinating after retry — use retry anyway but flag for auto-validate
            cleaned = retryCleaned
            this.lastHallucinationWarning = true
          }
        } catch (retryErr) {
          console.warn('[AI] Hallucination retry failed:', retryErr.message)
          this.lastHallucinationWarning = true
        }
      }
    }
    return cleaned
  }

  async generateRunnableSpecWithData(planMarkdown, url, probeData, csvContext, failures = [], currentSpec = null) {
    this._nextFeature = 'TestGen';
    const { mode, headers, sampleRows } = csvContext
    const headersStr = headers.join(', ')
    const sample = sampleRows?.[0] ? JSON.stringify(sampleRows[0]) : '{}'
    const samplesStr = JSON.stringify(sampleRows?.slice(0, 3) || [])

    const dataPromptKey = mode === 'loop' ? 'data_loop_spec' : 'data_per_row_spec'
    let dataAddendum = promptService.get(dataPromptKey)
      .replace('{HEADERS}', headersStr)
      .replace('{SAMPLE_ROW}', sample)
      .replace('{SAMPLE_ROWS}', samplesStr)

    const basePrompt = promptService.get('generate_runnable_spec')
    const systemPrompt = basePrompt + '\n\n' + dataAddendum

    const pageContext = probeData
      ? '\n\nPage structure:\n' + require('./pageProbeService').formatForPrompt(probeData)
      : ''

    const userMessage = `Target URL: ${url}${pageContext}

Test plan to implement:
${planMarkdown}`

    const fullContent = await this._complete(systemPrompt, userMessage, 3000)
    return fullContent.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  }

  async generateSeedCode(url, headers, sampleRows) {
    this._nextFeature = 'SeedCode';
    const systemPrompt = promptService.get('generate_seed_code')
      .replace('{URL}', url || '')
      .replace('{HEADERS}', headers.join(', '))
      .replace('{SAMPLE_ROWS}', JSON.stringify(sampleRows?.slice(0, 3) || []))

    const content = await this._complete(systemPrompt, 'Generate the seed code now.', 2000)
    return content.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  }

  async generateHeal(testCode, errorMessage, failedStep, ariaSnapshot = '') {
    this._nextFeature = 'LocatorHeal';
    const systemPrompt = promptService.get('heal')

    const ariaContext = ariaSnapshot
      ? `\n\nPage ARIA snapshot (accessibility tree):\n${ariaSnapshot.slice(0, 2000)}`
      : '';

    const content = await this._complete(
      systemPrompt,
      `Test code:\n${testCode}\n\nFailed step: ${failedStep}\n\nError: ${errorMessage}${ariaContext}`,
      1024
    );

    try {
      return JSON.parse(content);
    } catch {
      return { diagnosis: content, fixedSelector: null, confidence: 0.5 };
    }
  }

  // General-purpose completion for services that need AI generation without a specific prompt template
  async complete(systemPrompt, userMessage, maxTokens = 4000, feature = 'Generic') {
    this._nextFeature = feature
    return this._complete(systemPrompt, userMessage, maxTokens)
  }

  // Fix a single broken step block, optionally with a fresh page probe
  async healStep(stepCode, errorMessage, url, liveContext, fullCode) {
    this._nextFeature = 'LocatorHeal';
    const pageContext = liveContext
      ? '\n\nLive page snapshot (use these exact accessible names):\n' + liveContext
      : ''

    const systemPrompt = `You are a Playwright test repair expert. Fix only the specific broken step provided.
Rules:
- Return ONLY the replacement lines for that step — no markdown fences, no explanations, no surrounding boilerplate
- Preserve the comment line above the step exactly as written
- If page.goto() received a label or description instead of a URL, replace it with the correct URL
- Fix broken selectors using the live page snapshot when available
- Keep the same overall intent of the step`

    const userMessage = `Target URL: ${url}${pageContext}

FULL SPEC (context only — do not reproduce, only use for understanding):
${fullCode}

BROKEN STEP (return the fixed version of these exact lines):
${stepCode}

ERROR: ${errorMessage}

Return only the fixed replacement lines.`

    const content = await this._complete(systemPrompt, userMessage, 800)
    return content.replace(/^```(?:javascript|js)?\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  }
}

module.exports = new AIService();
