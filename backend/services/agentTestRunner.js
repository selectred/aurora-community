const { chromium } = require('playwright');
const os = require('os');
const prisma = require('../lib/prisma');
const { parseJson, stringifyJson } = require('../lib/helpers');
const { saveGeneratedCode } = require('../lib/packStorage');
const config = require('../tests/synthetic/config');
const fs = require('fs').promises;
const path = require('path');
const playwrightShimRunner = require('./playwrightShimRunner');
const evidenceStorage = require('../lib/evidenceStorage');

/**
 * Build the { enabled, evidenceRoot, bundleName } context passed into
 * playwrightShimRunner.runGeneratedSpec() for video/screenshot/trace capture, given an
 * already-fetched AppSettings row (avoids re-querying settings per spec in pack loops).
 */
function buildEvidenceContextFromSettings(settings, testName) {
  const enabled = settings?.evidenceCaptureEnabled !== false; // default true if unset/no settings row
  const evidenceRoot = evidenceStorage.getEvidenceRoot(settings);
  const bundleName = evidenceStorage.buildBundleName(testName);
  return { enabled, evidenceRoot, bundleName };
}

/**
 * Convenience wrapper for single-spec runs — fetches AppSettings then delegates to
 * buildEvidenceContextFromSettings(). Reads AppSettings fresh each call so the
 * evidenceCaptureEnabled kill-switch and evidenceRootDir override take effect without
 * a restart.
 */
async function buildEvidenceContext(testName) {
  const settings = await prisma.appSettings.findFirst().catch(() => null);
  return buildEvidenceContextFromSettings(settings, testName);
}

/**
 * AgentTestRunner - Executes Playwright tests based on Markdown specifications
 *
 * This service interprets Markdown test specs and executes them using Playwright.
 * It supports:
 * - Natural language step definitions
 * - Auto-healing of broken selectors
 * - Performance metrics capture
 */
class AgentTestRunner {
  constructor() {
    this.browser = null;
    this.specsDir = path.join(__dirname, '../tests/agent-specs');
    this.generatedDir = path.join(__dirname, '../tests/agent-generated');
  }

  /**
   * Initialize directories for specs and generated code
   */
  async initialize() {
    await fs.mkdir(this.specsDir, { recursive: true });
    await fs.mkdir(this.generatedDir, { recursive: true });
  }

  /**
   * Convert localhost URLs to Docker-accessible URLs
   * When running inside Docker, localhost refers to the container, not the host.
   * This method converts localhost URLs to use host.docker.internal for Mac/Windows
   * or the appropriate host gateway for Linux.
   * @param {string} url - The URL to convert
   * @returns {string} Docker-accessible URL
   */
  normalizeUrl(url) {
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
  }

  resolveDockerUrl(url) {
    if (!url) return url;

    // Check if we're running in Docker
    const isDocker = process.env.DOCKER_CONTAINER === 'true' ||
                     require('fs').existsSync('/.dockerenv');

    if (isDocker) {
      // Replace localhost/127.0.0.1 with host.docker.internal (works on Mac/Windows)
      // For Linux, you may need to use the host's IP or add --add-host=host.docker.internal:host-gateway
      return url.replace(/localhost|127\.0\.0\.1/g, 'host.docker.internal');
    }

    return url;
  }

  /**
   * Parse a Markdown spec into executable steps
   * @param {string} markdownSpec - The Markdown test specification
   * @returns {Array} Array of parsed test steps
   */
  parseMarkdownSpec(markdownSpec) {
    const steps = [];
    const lines = markdownSpec.split('\n');

    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        if (trimmed.startsWith('## ')) {
          currentSection = trimmed.substring(3).trim();
        }
        continue;
      }

      // Parse step definitions (lines starting with - or *)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const stepText = trimmed.substring(2).trim();
        const step = this.parseStep(stepText);
        if (step) {
          step.section = currentSection;
          steps.push(step);
        }
      }
    }

    return steps;
  }

  /**
   * Parse a single step text into an action object
   * @param {string} stepText - Natural language step description
   * @returns {Object} Parsed step action
   */
  parseStep(stepText) {
    const lowerText = stepText.toLowerCase();

    // Go back / navigate back
    if (/^go back\b/i.test(lowerText) || /^navigate back\b/i.test(lowerText)) {
      return { action: 'goBack', raw: stepText };
    }

    // Navigate actions
    if (lowerText.startsWith('navigate to ') || lowerText.startsWith('go to ') || lowerText.startsWith('open ')) {
      const urlMatch = stepText.match(/(?:navigate to|go to|open)\s+[`"']?([^`"']+)[`"']?/i);
      return {
        action: 'navigate',
        url: urlMatch ? urlMatch[1].trim() : null,
        raw: stepText
      };
    }

    // Click actions
    if (lowerText.includes('click')) {
      const targetMatch = stepText.match(/click\s+(?:on\s+)?(?:the\s+)?[`"']?([^`"']+)[`"']?(?:\s+button|\s+link|\s+element)?/i);
      return {
        action: 'click',
        target: targetMatch ? targetMatch[1].trim() : null,
        raw: stepText
      };
    }

    // Fill/Type actions
    if (lowerText.includes('fill') || lowerText.includes('type') || lowerText.includes('enter')) {
      const fillMatch = stepText.match(/(?:fill|type|enter)\s+[`"']?([^`"']+)[`"']?\s+(?:in|into|in the|into the)\s+[`"']?([^`"']+)[`"']?/i);
      const reverseMatch = stepText.match(/(?:fill|type|enter)\s+(?:in|into)?\s*(?:the\s+)?[`"']?([^`"']+)[`"']?\s+(?:field|input|box)?\s*(?:with)?\s*[`"']?([^`"']+)[`"']?/i);

      if (fillMatch) {
        return {
          action: 'fill',
          value: fillMatch[1].trim(),
          target: fillMatch[2].trim(),
          raw: stepText
        };
      } else if (reverseMatch) {
        return {
          action: 'fill',
          target: reverseMatch[1].trim(),
          value: reverseMatch[2].trim(),
          raw: stepText
        };
      }
    }

    // Wait actions
    if (lowerText.includes('wait')) {
      const waitMatch = stepText.match(/wait\s+(?:for\s+)?(?:the\s+)?[`"']?([^`"']+)[`"']?/i);
      const waitTimeMatch = stepText.match(/wait\s+(\d+)\s*(?:ms|milliseconds|seconds?|s)/i);

      if (waitTimeMatch) {
        const time = parseInt(waitTimeMatch[1]);
        const unit = stepText.toLowerCase().includes('second') ? 1000 : 1;
        return {
          action: 'waitForTimeout',
          timeout: time * unit,
          raw: stepText
        };
      }

      return {
        action: 'waitForSelector',
        target: waitMatch ? waitMatch[1].trim() : null,
        raw: stepText
      };
    }

    // API-specific actions - must be checked BEFORE generic assertions
    // Status code assertions
    const statusCodeMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:the\s+)?(?:response\s+)?status\s+(?:code\s+)?(?:is\s+|to be\s+|=\s*)?(\d{3})/i);
    if (statusCodeMatch) {
      return {
        action: 'assertStatusCode',
        statusCode: parseInt(statusCodeMatch[1]),
        raw: stepText
      };
    }

    // HTTP request methods
    const httpMethodMatch = stepText.match(/(?:send|make|execute)\s+(?:a\s+)?(?:an?\s+)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+request/i);
    if (httpMethodMatch) {
      return {
        action: 'httpRequest',
        method: httpMethodMatch[1].toUpperCase(),
        raw: stepText
      };
    }

    // Response type assertions (e.g., "Verify response is JSON array", "Expect response is object", "Verify response is JSON")
    const responseTypeMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:the\s+)?response\s+(?:is\s+)?(?:a\s+)?(?:an?\s+)?(JSON|array|object|string|number|boolean)(?:\s+(array|object|string|number|boolean))?/i);
    if (responseTypeMatch) {
      const typeText = stepText.toLowerCase();
      let expectedType = 'json'; // Default to just checking it's valid JSON
      if (typeText.includes('array')) expectedType = 'array';
      else if (typeText.includes('object') && !typeText.includes('json object')) expectedType = 'object';
      else if (typeText.includes('json object')) expectedType = 'object';
      else if (typeText.includes('string')) expectedType = 'string';
      else if (typeText.includes('number')) expectedType = 'number';
      else if (typeText.includes('boolean')) expectedType = 'boolean';
      return {
        action: 'assertResponseType',
        expectedType,
        raw: stepText
      };
    }

    // Response body assertions
    const responseContainsMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:the\s+)?response\s+(?:body\s+)?(?:contains?|includes?|has)\s+[`"']?([^`"']+)[`"']?/i);
    if (responseContainsMatch) {
      return {
        action: 'assertResponseContains',
        text: responseContainsMatch[1].trim(),
        raw: stepText
      };
    }

    // Response property assertions (e.g., "Expect response.data.id to exist")
    const responsePropertyMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:the\s+)?response\.([a-zA-Z0-9_.]+)\s+(?:to\s+)?(?:exist|be defined|not be null)/i);
    if (responsePropertyMatch) {
      return {
        action: 'assertResponseProperty',
        property: responsePropertyMatch[1],
        raw: stepText
      };
    }

    // Response header assertions
    const headerMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:the\s+)?(?:response\s+)?header\s+[`"']?([^`"']+)[`"']?\s+(?:is|to be|=)\s*[`"']?([^`"']+)[`"']?/i);
    if (headerMatch) {
      return {
        action: 'assertHeader',
        headerName: headerMatch[1].trim(),
        headerValue: headerMatch[2].trim(),
        raw: stepText
      };
    }

    // URL assertions: "Expect page URL to contain '/path'", "Verify URL contains 'X'"
    const urlAssertMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?url\s+(?:to\s+contain|contains?|to\s+include|includes?|to\s+match|matches?|to\s+be)\s+[`"']([^`"']+)[`"']/i)
      || stepText.match(/(?:expect|verify|assert|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?url\s+[`"']([^`"']+)[`"']/i);
    if (urlAssertMatch) {
      return { action: 'assertUrl', text: urlAssertMatch[1].trim(), raw: stepText };
    }

    // Title value assertions: "Expect page title to be 'X'", "Verify title is 'X'",
    // "Expect the page title 'X' to be visible"
    const titleValueMatch = stepText.match(/(?:expect|verify|assert|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+(?:to\s+be|to\s+contain|is|equals?|contains?)\s+[`"']([^`"']+)[`"']/i)
      || stepText.match(/(?:expect|verify|assert|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?title\s+[`"']([^`"']+)[`"']/i);
    if (titleValueMatch) {
      return { action: 'assertTitle', text: titleValueMatch[1].trim(), raw: stepText };
    }

    // Visibility assertions: "Verify X is visible", "Expect X to be visible/present", etc.
    if (lowerText.includes('is visible') || lowerText.includes('should be visible') ||
        lowerText.includes('is present') || lowerText.includes('is displayed') ||
        lowerText.includes('to be visible') || lowerText.includes('to be present')) {
      const visibleMatch = stepText.match(/(?:verify|assert|check|expect)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?(.+?)\s+(?:to\s+be\s+(?:visible|present)|is\s+(?:visible|present|displayed))/i)
        || stepText.match(/(?:the\s+)?(?:page\s+)?(.+?)\s+should\s+be\s+(?:visible|present)/i);
      if (visibleMatch) {
        let target = visibleMatch[1].trim();

        // Extract quoted text from compound descriptions — the quoted value is the real target
        // e.g. "navigation link 'Writing'" → "Writing"
        // e.g. "main navigation containing 'Writing'" → "Writing"
        // e.g. "heading 'Thinking clearly'" → "Thinking clearly"
        const quotedExtract = target.match(/[`"']([^`"']+)[`"']/);
        if (quotedExtract) {
          target = quotedExtract[1].trim();
        }

        return {
          action: 'assertVisible',
          target,
          raw: stepText
        };
      }
    }

    // Assert/Verify actions (generic - for UI text assertions)
    if (lowerText.includes('verify') || lowerText.includes('assert') || lowerText.includes('should') || lowerText.includes('expect')) {
      // Negative assertions: "Verify no X are visible", "Verify no error messages are visible"
      const negativeMatch = stepText.match(/(?:verify|assert|check)\s+(?:that\s+)?no\s+(.+?)\s+(?:are|is)\s+(?:visible|present|shown|displayed)/i);
      if (negativeMatch) {
        return { action: 'assertAbsent', target: negativeMatch[1].trim(), raw: stepText };
      }

      // Page health assertions: "Verify page loads without errors", "Verify page loaded successfully"
      if (/loads?\s+(?:without\s+errors?|successfully|correctly|ok)/i.test(lowerText) ||
          /no\s+errors?\s+(?:on|in|loading)/i.test(lowerText)) {
        return { action: 'assertPageOk', raw: stepText };
      }

      // "Expect page title 'X' to contain/equal" or "Expect heading 'X'" — extract quoted label
      const quotedLabelMatch = stepText.match(/(?:verify|assert|expect|check)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?(?:title|heading|text|link|label)\s+[`"']([^`"']+)[`"']/i);
      if (quotedLabelMatch) {
        return { action: 'assertText', text: quotedLabelMatch[1].trim(), raw: stepText };
      }

      const textMatch = stepText.match(/(?:verify|assert|expect|should see|should contain)\s+(?:that\s+)?(?:the\s+)?(?:page\s+)?(?:contains?\s+)?[`"']?([^`"']+)[`"']?/i);
      return {
        action: 'assertText',
        text: textMatch ? textMatch[1].trim() : null,
        raw: stepText
      };
    }

    // Screenshot action
    if (lowerText.includes('screenshot') || lowerText.includes('capture')) {
      return {
        action: 'screenshot',
        raw: stepText
      };
    }

    // Select/dropdown actions
    if (lowerText.includes('select')) {
      const selectMatch = stepText.match(/select\s+[`"']?([^`"']+)[`"']?\s+(?:from|in)\s+[`"']?([^`"']+)[`"']?/i);
      return {
        action: 'select',
        value: selectMatch ? selectMatch[1].trim() : null,
        target: selectMatch ? selectMatch[2].trim() : null,
        raw: stepText
      };
    }

    // Default: unknown action
    return {
      action: 'unknown',
      raw: stepText
    };
  }

  /**
   * Extract keywords from a natural language target description
   * e.g., "the email field" → ["email"], "username input" → ["username"]
   * @param {string} target - Natural language target description
   * @returns {Array} Array of keywords to try
   */
  extractKeywords(target) {
    if (!target) return [];

    // Common filler words to remove
    const fillerWords = ['the', 'a', 'an', 'field', 'input', 'button', 'link', 'box', 'textbox', 'textarea', 'element', 'for', 'to', 'in', 'on'];

    // Split by spaces and filter out filler words
    const words = target.toLowerCase().split(/\s+/).filter(word => !fillerWords.includes(word));

    // Return unique meaningful words
    const keywords = [...new Set(words)];

    // Also add the original target in case it's already a proper selector term
    if (!keywords.includes(target.toLowerCase())) {
      keywords.unshift(target);
    }

    return keywords;
  }

  /**
   * Find a selector for a target description
   * @param {Object} page - Playwright page object
   * @param {string} target - Target description (text, label, placeholder, etc.)
   * @returns {string} Best matching selector
   */
  async findSelector(page, target) {
    if (!target) return null;

    // Extract keywords from natural language descriptions
    const keywords = this.extractKeywords(target);

    // Build strategies for each keyword
    const allStrategies = [];

    for (const keyword of keywords) {
      allStrategies.push(
        // By placeholder (most common for input fields)
        `[placeholder*="${keyword}" i]`,
        `[placeholder="${keyword}"]`,

        // By label
        `label=${keyword}`,

        // By aria-label
        `[aria-label*="${keyword}" i]`,
        `[aria-label="${keyword}"]`,

        // By name attribute
        `[name*="${keyword}" i]`,
        `[name="${keyword}"]`,

        // By id
        `[id*="${keyword}" i]`,
        `#${keyword}`,

        // By type attribute (for email, password, etc.)
        `input[type="${keyword}"]`,

        // By role and name
        `role=textbox[name*="${keyword}" i]`,
        `role=button[name*="${keyword}" i]`,
        `role=link[name*="${keyword}" i]`,

        // By text content
        `text="${keyword}"`,
        `text=${keyword}`,

        // By title
        `[title*="${keyword}" i]`,

        // By data-testid
        `[data-testid*="${keyword}" i]`,
        `[data-test*="${keyword}" i]`,
      );
    }

    // Also try the original full target
    allStrategies.push(
      `[placeholder="${target}"]`,
      `[placeholder*="${target}" i]`,
      `[aria-label="${target}"]`,
      `[aria-label*="${target}" i]`,
      `[name="${target}"]`,
      `text="${target}"`,
    );

    for (const selector of allStrategies) {
      try {
        const element = await page.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          return selector;
        }
      } catch (e) {
        // Selector didn't work, try next
      }
    }

    return null;
  }

  /**
   * Find an input field using Playwright's smart locators
   * This uses getByPlaceholder, getByLabel, getByRole which are more robust
   * @param {Object} page - Playwright page object
   * @param {string} target - Target description (e.g., "the email field", "password")
   * @returns {Object|null} Playwright locator or null
   */
  async findInputLocator(page, target) {
    if (!target) return null;

    // Extract keywords from natural language
    const keywords = this.extractKeywords(target);

    // Try each keyword with Playwright's smart locators
    for (const keyword of keywords) {
      // Try getByPlaceholder (case-insensitive)
      try {
        const byPlaceholder = page.getByPlaceholder(new RegExp(keyword, 'i'));
        if (await byPlaceholder.count() > 0) {
          return byPlaceholder.first();
        }
      } catch (e) {}

      // Try getByLabel (case-insensitive)
      try {
        const byLabel = page.getByLabel(new RegExp(keyword, 'i'));
        if (await byLabel.count() > 0) {
          return byLabel.first();
        }
      } catch (e) {}

      // Try getByRole textbox with name
      try {
        const byRole = page.getByRole('textbox', { name: new RegExp(keyword, 'i') });
        if (await byRole.count() > 0) {
          return byRole.first();
        }
      } catch (e) {}

      // Try input[type="keyword"] (for email, password, etc.)
      try {
        const byType = page.locator(`input[type="${keyword}"]`);
        if (await byType.count() > 0) {
          return byType.first();
        }
      } catch (e) {}

      // Try by name attribute
      try {
        const byName = page.locator(`[name*="${keyword}" i]`);
        if (await byName.count() > 0) {
          return byName.first();
        }
      } catch (e) {}

      // Try by id attribute
      try {
        const byId = page.locator(`[id*="${keyword}" i]`);
        if (await byId.count() > 0) {
          return byId.first();
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Find a clickable element using Playwright's smart locators
   * @param {Object} page - Playwright page object
   * @param {string} target - Target description
   * @returns {Object|null} Playwright locator or null
   */
  async findClickableLocator(page, target) {
    if (!target) return null;

    // Handle positional descriptions: "first navigation link", "second nav link", etc.
    const positionalMatch = target.match(/^(first|second|third|1st|2nd|3rd|(\d+)(?:th|st|nd|rd)?)\s+(?:navigation\s+)?link$/i);
    if (positionalMatch) {
      const ordinals = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2 };
      const word = positionalMatch[1].toLowerCase();
      const index = ordinals[word] !== undefined ? ordinals[word] : (parseInt(positionalMatch[2]) - 1);
      try {
        // Strategy 1: find a nav/header div that contains multiple links (the menu group,
        // not the logo). Try direct-child <a> first, then all descendant <a> (handles <li> wrappers).
        const navMenuCandidates = [
          'nav div:has(> a + a)',
          'header div:has(> a + a)',
          'nav ul:has(li a)',
          'header ul:has(li a)',
          'nav',
          'header nav'
        ];
        for (const sel of navMenuCandidates) {
          const container = page.locator(sel).first();
          if (await container.count() === 0) continue;
          // Prefer direct <a> children; fall back to all <a> descendants with text
          const direct = container.locator('> a').filter({ hasText: /.+/ });
          const directCount = await direct.count();
          if (directCount > index) return direct.nth(index);
          const all = container.locator('a').filter({ hasText: /.+/ });
          const allCount = await all.count();
          if (allCount > index) return all.nth(index);
        }
        // Strategy 2: all nav/header links, skip solo logo link at index 0
        const navLinks = page.locator('nav a, header a').filter({ hasText: /.+/ });
        const count = await navLinks.count();
        const offset = count > index + 1 ? 1 : 0;
        if (count > index + offset) return navLinks.nth(index + offset);
        // Strategy 3: page-level role=link (last resort)
        const allLinks = page.getByRole('link');
        if (await allLinks.count() > index) return allLinks.nth(index);
      } catch (e) {}
    }

    // Try exact text match first with getByRole for buttons/links
    try {
      const byRoleButton = page.getByRole('button', { name: target });
      if (await byRoleButton.count() > 0) {
        return byRoleButton.first();
      }
    } catch (e) {}

    try {
      const byRoleLink = page.getByRole('link', { name: target });
      if (await byRoleLink.count() > 0) {
        return byRoleLink.first();
      }
    } catch (e) {}

    // Try getByText
    try {
      const byText = page.getByText(target, { exact: false });
      if (await byText.count() > 0) {
        return byText.first();
      }
    } catch (e) {}

    // Extract keywords and try case-insensitive matches
    const keywords = this.extractKeywords(target);
    for (const keyword of keywords) {
      try {
        const byRoleButton = page.getByRole('button', { name: new RegExp(keyword, 'i') });
        if (await byRoleButton.count() > 0) {
          return byRoleButton.first();
        }
      } catch (e) {}

      try {
        const byRoleLink = page.getByRole('link', { name: new RegExp(keyword, 'i') });
        if (await byRoleLink.count() > 0) {
          return byRoleLink.first();
        }
      } catch (e) {}

      try {
        const byText = page.getByText(new RegExp(keyword, 'i'));
        if (await byText.count() > 0) {
          return byText.first();
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Execute a single test step with auto-healing
   * @param {Object} page - Playwright page object
   * @param {Object} step - Parsed step action
   * @param {Object} context - Execution context
   * @returns {Object} Step result
   */
  async executeStep(page, step, context) {
    const startTime = Date.now();
    const result = {
      step: step.raw,
      action: step.action,
      success: false,
      duration: 0,
      error: null,
      healed: false
    };

    try {
      switch (step.action) {
        case 'navigate':
          // Resolve URL placeholders ({URL} -> actual base URL) then Docker hostname
          let navUrl = step.url;
          if (context.baseUrl) {
            navUrl = navUrl.replace(/\{URL\}/gi, context.baseUrl);
          }
          navUrl = this.normalizeUrl(this.resolveDockerUrl(navUrl));
          if (!navUrl) {
            throw new Error('Navigate step has no URL. Set a target URL on the spec before running.');
          }
          const navResponse = await page.goto(navUrl, { waitUntil: 'networkidle', timeout: context.timeout });
          // Store response for API tests
          context.lastResponse = navResponse;
          context.apiUrl = navUrl;
          result.success = true;
          result.statusCode = navResponse ? navResponse.status() : null;
          break;

        case 'click':
          // Use Playwright's smart locators for clicking
          let clickLocator = await this.findClickableLocator(page, step.target);
          if (!clickLocator) {
            // Fallback to old selector method
            const clickSelector = await this.findSelector(page, step.target);
            if (!clickSelector) {
              throw new Error(`Could not find element: ${step.target}`);
            }
            clickLocator = page.locator(clickSelector);
          }
          await clickLocator.click({ timeout: context.timeout });
          result.success = true;
          result.selector = step.target;
          break;

        case 'fill':
          // Use Playwright's smart locators for input fields
          let fillLocator = await this.findInputLocator(page, step.target);
          if (!fillLocator) {
            // Fallback to old selector method
            const fillSelector = await this.findSelector(page, step.target);
            if (!fillSelector) {
              throw new Error(`Could not find input field: ${step.target}`);
            }
            fillLocator = page.locator(fillSelector);
          }
          await fillLocator.fill(step.value, { timeout: context.timeout });
          result.success = true;
          result.selector = step.target;
          break;

        case 'waitForSelector':
          let waitSelector = await this.findSelector(page, step.target);
          if (waitSelector) {
            await page.locator(waitSelector).waitFor({ timeout: context.timeout });
            result.success = true;
            result.selector = waitSelector;
          } else {
            // Try waiting for text
            await page.locator(`text=${step.target}`).waitFor({ timeout: context.timeout });
            result.success = true;
          }
          break;

        case 'waitForTimeout':
          await page.waitForTimeout(step.timeout);
          result.success = true;
          break;

        case 'goBack':
          await page.goBack({ waitUntil: 'networkidle', timeout: context.timeout });
          result.success = true;
          break;

        case 'assertTitle': {
          const actualTitle = await page.title();
          if (!actualTitle.toLowerCase().includes(step.text.toLowerCase())) {
            throw new Error(`Page title "${actualTitle}" does not contain "${step.text}"`);
          }
          result.success = true;
          break;
        }

        case 'assertUrl': {
          const actualUrl = page.url();
          if (!actualUrl.toLowerCase().includes(step.text.toLowerCase())) {
            throw new Error(`Page URL "${actualUrl}" does not contain "${step.text}"`);
          }
          result.success = true;
          break;
        }

        case 'assertPageOk':
          const pageTitle = await page.title();
          const pageUrl = page.url();
          const errorIndicators = [/\b(404|500|503|error|not found|forbidden|unavailable)\b/i];
          const hasError = errorIndicators.some(r => r.test(pageTitle) || r.test(pageUrl));
          if (hasError) throw new Error(`Page appears to have an error: "${pageTitle}" (${pageUrl})`);
          result.success = true;
          break;

        case 'assertAbsent':
          const absentSelector = await this.findSelector(page, step.target);
          const absentCount = absentSelector
            ? await page.locator(absentSelector).count()
            : await page.locator(`text=${step.target}`).count();
          if (absentCount > 0) throw new Error(`Expected no "${step.target}" but found ${absentCount} element(s)`);
          result.success = true;
          break;

        case 'assertVisible':
          if (/^(page\s+)?title$/i.test(step.target)) {
            const title = await page.title();
            if (!title || title.trim() === '') {
              throw new Error('Page has no title tag');
            }
            result.success = true;
          } else {
            // Map semantic descriptions to structural selectors
            const semanticMap = {
              'navigation': ['nav', '[role="navigation"]', 'header nav'],
              'main navigation': ['nav', '[role="navigation"]', 'header nav'],
              'nav': ['nav', '[role="navigation"]'],
              'header': ['header', '[role="banner"]'],
              'footer': ['footer', '[role="contentinfo"]'],
              'footer content': ['footer', '[role="contentinfo"]'],
              'footer section': ['footer', '[role="contentinfo"]'],
              'page footer': ['footer', '[role="contentinfo"]'],
              'main content': ['main', '[role="main"]', '#main'],
              'main': ['main', '[role="main"]'],
              'page content': ['main', '[role="main"]', '#main', '#content'],
              'sidebar': ['aside', '[role="complementary"]'],
              'search': ['[role="search"]', 'input[type="search"]', '[placeholder*="search" i]'],
            };

            const targetLower = step.target.toLowerCase();
            // Exact map lookup, then fallback: strip trailing noise words and retry
            const noiseStripped = targetLower.replace(/\s+(content|area|section|region|bar|panel|container|wrapper)$/i, '').trim();
            const semanticSelectors = semanticMap[targetLower] || semanticMap[noiseStripped];

            let isVisible = false;
            if (semanticSelectors) {
              for (const sel of semanticSelectors) {
                isVisible = await page.locator(sel).first().isVisible().catch(() => false);
                if (isVisible) break;
              }
            }

            if (!isVisible) {
              const visSelector = await this.findSelector(page, step.target);
              const visLocator = visSelector
                ? page.locator(visSelector).first()
                : page.locator(`text=${step.target}`).first();
              isVisible = await visLocator.isVisible().catch(() => false);
            }

            // Last-resort broadened sweep for navigation-flavoured targets
            if (!isVisible) {
              const navKeywords = ['nav', 'navigation', 'menu'];
              if (navKeywords.some(k => step.target.toLowerCase().includes(k))) {
                const broadNavSelectors = [
                  'nav', '[role="navigation"]', 'header nav', 'header ul',
                  '#nav', '#navigation', '#menu', '.nav', '.navigation', '.menu',
                  '[class*="nav"]', '[class*="menu"]', '[id*="nav"]', '[id*="menu"]'
                ];
                for (const sel of broadNavSelectors) {
                  isVisible = await page.locator(sel).first().isVisible().catch(() => false);
                  if (isVisible) break;
                }
              }
            }

            if (!isVisible) {
              throw new Error(`Element not visible: ${step.target}`);
            }
            result.success = true;
          }
          break;

        case 'assertText':
          const hasText = await page.locator(`text=${step.text}`).count() > 0;
          if (!hasText) {
            // Try case-insensitive search
            const pageContent = await page.content();
            if (!pageContent.toLowerCase().includes(step.text.toLowerCase())) {
              throw new Error(`Text not found: ${step.text}`);
            }
          }
          result.success = true;
          break;

        // API-specific execution handlers
        case 'assertStatusCode':
          // Check if we have a stored response from a previous navigation or API call
          if (context.lastResponse) {
            const actualStatus = context.lastResponse.status();
            if (actualStatus !== step.statusCode) {
              throw new Error(`Expected status code ${step.statusCode}, but got ${actualStatus}`);
            }
            result.success = true;
            result.actualStatusCode = actualStatus;
          } else {
            // If no stored response, make a HEAD request to the current URL
            const currentUrl = page.url();
            const response = await page.request.get(currentUrl);
            const actualStatus = response.status();
            if (actualStatus !== step.statusCode) {
              throw new Error(`Expected status code ${step.statusCode}, but got ${actualStatus}`);
            }
            result.success = true;
            result.actualStatusCode = actualStatus;
          }
          break;

        case 'httpRequest':
          // Store the method for use in subsequent steps
          context.httpMethod = step.method;
          // If we have a URL, make the request
          if (context.apiUrl) {
            const requestUrl = this.resolveDockerUrl(context.apiUrl);
            const response = await page.request[step.method.toLowerCase()](requestUrl);
            context.lastResponse = response;

            // Try to parse response body - try JSON first, fall back to text
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              try {
                context.lastResponseBody = await response.json();
              } catch (e) {
                context.lastResponseBody = await response.text();
              }
            } else {
              // For non-JSON responses, get the text and try to parse as JSON anyway
              const textBody = await response.text();
              try {
                context.lastResponseBody = JSON.parse(textBody);
              } catch (e) {
                // Not JSON - store as string (will fail type assertions expecting array/object)
                context.lastResponseBody = textBody;
              }
            }

            result.success = true;
            result.statusCode = response.status();
            result.contentType = contentType;
          } else {
            result.success = true;
            result.skipped = true;
            result.note = 'HTTP method set, will be used with next navigate';
          }
          break;

        case 'assertResponseContains':
          if (context.lastResponseBody) {
            const bodyStr = JSON.stringify(context.lastResponseBody);
            if (!bodyStr.toLowerCase().includes(step.text.toLowerCase())) {
              throw new Error(`Response body does not contain: ${step.text}`);
            }
            result.success = true;
          } else {
            throw new Error('No response body available to check');
          }
          break;

        case 'assertResponseProperty':
          if (context.lastResponseBody) {
            const props = step.property.split('.');
            let value = context.lastResponseBody;
            for (const prop of props) {
              if (value === undefined || value === null) {
                throw new Error(`Response property ${step.property} does not exist`);
              }
              value = value[prop];
            }
            if (value === undefined || value === null) {
              throw new Error(`Response property ${step.property} is null or undefined`);
            }
            result.success = true;
            result.propertyValue = value;
          } else {
            throw new Error('No response body available to check');
          }
          break;

        case 'assertHeader':
          if (context.lastResponse) {
            const headerValue = context.lastResponse.headers()[step.headerName.toLowerCase()];
            if (headerValue !== step.headerValue) {
              throw new Error(`Expected header ${step.headerName} to be "${step.headerValue}", but got "${headerValue}"`);
            }
            result.success = true;
          } else {
            throw new Error('No response available to check headers');
          }
          break;

        case 'assertResponseType':
          if (context.lastResponseBody !== undefined) {
            const body = context.lastResponseBody;
            let actualType;
            if (Array.isArray(body)) {
              actualType = 'array';
            } else if (body === null) {
              actualType = 'null';
            } else {
              actualType = typeof body;
            }

            // Handle 'json' type - accepts any valid JSON (object or array)
            if (step.expectedType === 'json') {
              if (actualType === 'object' || actualType === 'array') {
                result.success = true;
                result.actualType = actualType;
              } else {
                throw new Error(`Expected response to be valid JSON, but got ${actualType}`);
              }
            } else if (actualType !== step.expectedType) {
              // Provide helpful preview of what was received
              let preview = '';
              if (typeof body === 'string') {
                preview = ` (received: "${body.substring(0, 100)}${body.length > 100 ? '...' : ''}")`;
              }
              throw new Error(`Expected response to be ${step.expectedType}, but got ${actualType}${preview}`);
            } else {
              result.success = true;
              result.actualType = actualType;
            }
          } else {
            throw new Error('No response body available to check type');
          }
          break;

        case 'screenshot':
          const screenshotPath = path.join(config.screenshots.path, `${context.specId}-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          result.success = true;
          result.screenshotPath = screenshotPath;
          break;

        case 'select':
          let selectSelector = await this.findSelector(page, step.target);
          if (!selectSelector) {
            throw new Error(`Could not find select element: ${step.target}`);
          }
          await page.locator(selectSelector).selectOption(step.value, { timeout: context.timeout });
          result.success = true;
          result.selector = selectSelector;
          break;

        case 'unknown':
          result.success = true; // Skip unknown steps
          result.skipped = true;
          break;

        default:
          result.error = `Unknown action: ${step.action}`;
      }
    } catch (error) {
      result.error = error.message;

      // Attempt auto-healing for selector-based failures
      if (error.message.includes('Could not find') || error.message.includes('Timeout')) {
        const healed = await this.attemptHeal(page, step, context);
        if (healed.success) {
          result.success = true;
          result.healed = true;
          result.healedSelector = healed.selector;
          result.error = null;
        }
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Attempt to heal a failed step by finding alternative selectors
   * @param {Object} page - Playwright page object
   * @param {Object} step - Failed step
   * @param {Object} context - Execution context
   * @returns {Object} Healing result
   */
  async attemptHeal(page, step, context) {
    const target = step.target || step.text;
    if (!target) return { success: false };

    // Use 1.59 ariaSnapshot to find elements via the accessibility tree (most reliable)
    try {
      const ariaTree = await page.ariaSnapshot();
      const targetLower = target.toLowerCase();
      for (const line of ariaTree.split('\n')) {
        if (!line.toLowerCase().includes(targetLower)) continue;
        const roleMatch = line.match(/-\s+(\w+)\s+"([^"]+)"/);
        if (!roleMatch) continue;
        const [, role, name] = roleMatch;
        try {
          const locator = page.getByRole(role, { name });
          if (await locator.count() > 0) {
            if (step.action === 'click') {
              await locator.first().click({ timeout: context.timeout });
              return { success: true, selector: `role=${role}[name="${name}"]` };
            } else if (step.action === 'fill') {
              await locator.first().fill(step.value, { timeout: context.timeout });
              return { success: true, selector: `role=${role}[name="${name}"]` };
            }
          }
        } catch (e) { /* try next line */ }
      }
    } catch (e) { /* ariaSnapshot not available, fall through */ }

    // Fallback: partial text and attribute matching
    const alternatives = [
      `text=/${target.split(' ')[0]}/i`,
      `//*[contains(@*, "${target.substring(0, 10)}")]`,
    ];

    for (const selector of alternatives) {
      try {
        const element = await page.locator(selector).first();
        if (await element.count() > 0) {
          if (step.action === 'click') {
            await element.click({ timeout: context.timeout });
            return { success: true, selector };
          } else if (step.action === 'fill') {
            await element.fill(step.value, { timeout: context.timeout });
            return { success: true, selector };
          }
        }
      } catch (e) { /* continue */ }
    }

    return { success: false };
  }

  /**
   * Capture performance metrics from the page
   * @param {Object} page - Playwright page object
   * @returns {Object} Performance metrics
   */
  async captureMetrics(page) {
    try {
      const metrics = await page.evaluate(() => {
        const timing = performance.timing;
        const paintEntries = performance.getEntriesByType('paint');

        let fcp = null;
        for (const entry of paintEntries) {
          if (entry.name === 'first-contentful-paint') {
            fcp = entry.startTime;
            break;
          }
        }

        return {
          fcp,
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          fullPageLoad: timing.loadEventEnd - timing.navigationStart,
          tti: timing.domInteractive - timing.navigationStart
        };
      });
      return metrics;
    } catch (e) {
      return {};
    }
  }

  /**
   * Run a spec using its generatedCode (the JS runner).
   * Used for terminal-generated specs that have runnable JS rather than a markdown step list.
   */
  async runSpecByCode(specId, envVars = null) {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } });
    if (!spec) throw new Error(`Spec not found: ${specId}`);

    const startTime = Date.now();
    const result = {
      specId: spec.specId, specName: spec.name, url: spec.url,
      status: 'passed', duration: 0, steps: [], metrics: {}, error: null, healedSteps: 0
    };

    let browser;

    try {
      browser = await chromium.launch({
        headless: config.browser.headless,
        executablePath: config.browser.executablePath || undefined,
        args: config.browser.args
      });

      function applyVars(text) {
        if (!envVars || !text) return text
        return text.replace(/\{\{([^}]+)\}\}/g, (_, k) => envVars[k] !== undefined ? envVars[k] : `{{${k}}}`)
      }

      const rawCode = applyVars(spec.generatedCode || '');
      const evidence = await buildEvidenceContext(spec.name);
      const testResults = await playwrightShimRunner.runGeneratedSpec(rawCode, browser, { evidence });

      result.steps = (testResults || []).map(r => ({ action: r.title, success: r.ok, error: r.error || null, errorLine: r.errorLine || null }));
      const failed = result.steps.filter(s => !s.success);
      if (failed.length > 0) {
        result.status = 'failed';
        result.error = failed[0].error || 'Test failed';
        // Carry the ARIA snapshot captured at the moment of failure
        const failedRaw = (testResults || []).find(r => !r.ok)
        if (failedRaw?.failureAriaSnapshot) result.failureAriaSnapshot = failedRaw.failureAriaSnapshot
        // Carry the evidence bundle folder name, if one was captured (first failure only)
        const bundledRaw = (testResults || []).find(r => !r.ok && r.evidenceDir)
        if (bundledRaw?.evidenceDir) result.evidenceDir = bundledRaw.evidenceDir

        // Record hallucination events for each failing step
        const hallucinationService = require('./hallucinationService')
        for (const f of failed) {
          const err = f.error || ''
          const failureType = /waitForURL|url.*mismatch/i.test(err) ? 'url_check_failed'
                            : /strict mode/i.test(err) ? 'strict_mode' : 'selector_not_found'
          hallucinationService.capture({
            promptKey: 'generate_runnable_spec',
            failureType,
            aiOutput: spec?.generatedCode,
            ariaSnapshot: result.failureAriaSnapshot,
            targetUrl: spec?.url,
            healAttempts: spec?.healCount || 0
          })
        }
      }
    } catch (e) {
      result.status = 'failed';
      result.error = e.message.split('\n')[0];
    } finally {
      if (browser) try { await browser.close(); } catch {}
      result.duration = Date.now() - startTime;
    }

    await this.saveResult(result, spec);
    return result;
  }

  /**
   * Run an agent test spec
   * @param {string} specId - The spec ID to run
   * @returns {Object} Test result
   */
  async runSpec(specId) {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } });
    if (!spec) {
      throw new Error(`Spec not found: ${specId}`);
    }

    const startTime = Date.now();
    const result = {
      specId: spec.specId,
      specName: spec.name,
      url: spec.url,
      status: 'passed',
      duration: 0,
      steps: [],
      metrics: {},
      error: null,
      healedSteps: 0
    };

    let browser = null;
    let context = null;
    let page = null;

    try {
      // Launch browser
      browser = await chromium.launch({
        headless: config.browser.headless,
        executablePath: config.browser.executablePath,
        args: config.browser.args
      });

      context = await browser.newContext({
        viewport: config.browser.viewport
      });

      // Start trace recording — saved to disk on failure (Playwright 1.59)
      await context.tracing.start({ screenshots: true, snapshots: true });

      page = await context.newPage();

      // Parse the spec
      const steps = this.parseMarkdownSpec(spec.markdownSpec);

      // Execute each step
      const normalizedSpecUrl = this.normalizeUrl(spec.url);
      const executionContext = {
        specId: spec.specId,
        timeout: spec.timeout || config.timeouts.action,
        // Base URL for placeholder replacement (original URL before Docker resolution)
        baseUrl: normalizedSpecUrl,
        // API test context - resolve Docker URL for container networking
        apiUrl: this.resolveDockerUrl(normalizedSpecUrl),
        lastResponse: null,
        lastResponseBody: null,
        httpMethod: spec.method || 'GET'
      };

      for (const step of steps) {
        // Clear stale console messages and page errors before each step (Playwright 1.59)
        try { await page.clearConsoleMessages(); } catch (e) {}
        try { await page.clearPageErrors(); } catch (e) {}

        const stepResult = await this.executeStep(page, step, executionContext);
        result.steps.push(stepResult);

        if (stepResult.healed) {
          result.healedSteps++;
        }

        if (!stepResult.success && !stepResult.skipped) {
          result.status = 'failed';
          result.error = stepResult.error;

          // Take failure screenshot
          try {
            const screenshotPath = path.join(config.screenshots.path, `${specId}-failure-${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            result.failureScreenshot = screenshotPath;
          } catch (e) {}

          // Save Playwright trace on failure (Playwright 1.59)
          try {
            const tracePath = path.join(config.screenshots.path, `${specId}-trace-${Date.now()}.zip`);
            await context.tracing.stop({ path: tracePath });
            result.tracePath = tracePath;
          } catch (e) {}

          break;
        }
      }

      // Capture final metrics
      result.metrics = await this.captureMetrics(page);

    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
    } finally {
      // Stop tracing if still running (test passed — discard the trace)
      if (context && !result.tracePath) {
        try { await context.tracing.stop(); } catch (e) {}
      }
      if (browser) {
        await browser.close();
      }
      result.duration = Date.now() - startTime;
    }

    // Save result
    await this.saveResult(result, spec);

    // Update heal count if any steps were healed
    if (result.healedSteps > 0) {
      await prisma.agentTestSpec.update({
        where: { specId: spec.specId },
        data: {
          healCount: { increment: result.healedSteps },
          lastHealDetailsJson: stringifyJson({
            healedAt: new Date().toISOString(),
            originalError: result.steps.find(s => s.healed)?.error,
            fixApplied: 'Auto-healed selector'
          })
        }
      });
    }

    return result;
  }

  /**
   * Save test result to database
   * @param {Object} result - Test result
   * @param {Object} spec - Test spec
   */
  async saveResult(result, spec) {
    // Only save to SyntheticResult if the test is promoted to synthetic
    if (spec.isSynthetic) {
      await prisma.syntheticResult.create({
        data: {
          transactionId: `agent-${spec.specId}`,
          transactionName: spec.name,
          url: spec.url,
          description: spec.description,
          status: result.status,
          duration: result.duration,
          pageMetricsJson: stringifyJson([{
            pageName: spec.name,
            url: spec.url,
            httpStatusCode: result.status === 'passed' ? 200 : 500,
            loadTime: result.duration || 0,
            fcp: result.metrics?.fcp || null,
            tti: result.metrics?.tti || null,
            domContentLoaded: result.metrics?.domContentLoaded || null,
            fullPageLoad: result.metrics?.fullPageLoad || null
          }]),
          errorMessage: result.error,
          screenshot: result.failureScreenshot,
          browser: 'chromium',
          viewportJson: stringifyJson(config.browser.viewport)
        }
      });
    }

    // Save to TestResult for the Functional/API Tests view
    await prisma.testResult.create({
      data: {
        testCaseId: spec.specId,
        specId: spec.id,  // FK to AgentTestSpec.id (UUID) — was previously omitted, breaking
                           // any "latest result for this spec" lookup for single-spec runs
                           // (evidence bundles, Feature/Initiative RAG rollups) that pack runs
                           // already set correctly (see agentTestsController.js runPack)
        testName: spec.name,
        testType: spec.testType === 'api' ? 'api' : 'functional',
        suite: spec.suite || 'Generated Tests',
        status: result.status,
        duration: result.duration,
        errorMessage: result.error,
        screenshot: result.failureScreenshot || (result.evidenceDir ? `${result.evidenceDir}/screenshot.png` : null),
        evidenceDir: result.evidenceDir || null,
        browser: 'chromium',
        environment: 'staging',
        scriptLocation: `generated/${spec.specId}`,
        retries: result.healedSteps || 0,
        engine: spec.engine || 'playwright',
        metadataJson: stringifyJson({
          tool: 'playwright',
          version: '1.59.0',
          coverage: result.metrics?.coverage || null,
          assertions: {
            total: result.steps?.length || 0,
            passed: result.steps?.filter(s => s.success).length || 0,
            failed: result.steps?.filter(s => !s.success && !s.skipped).length || 0
          }
        })
      }
    });

    // Build report.html synchronously so the run-completion response has a working
    // link immediately — the PDF export stays lazy/on-demand (see Phase 5 routes).
    if (result.evidenceDir) {
      try {
        const evidenceReportService = require('./evidenceReportService')
        const settings = await prisma.appSettings.findFirst().catch(() => null)
        const bundleDir = evidenceStorage.resolveBundleDir(evidenceStorage.getEvidenceRoot(settings), result.evidenceDir)
        await evidenceReportService.writeReportHtml(bundleDir, {
          testName: spec.name,
          ranAt: new Date(),
          steps: result.steps || [],
          error: result.error,
          hasScreenshot: evidenceReportService.bundleHasFile(bundleDir, 'screenshot.png'),
          hasVideo: evidenceReportService.bundleHasFile(bundleDir, 'replay.webm'),
          hasTrace: evidenceReportService.bundleHasFile(bundleDir, 'trace.zip')
        })
      } catch (e) {
        console.error('[Evidence] Failed to write report.html:', e.message)
      }
    }

    // Keep spec status in sync and persist failure context so Heal has real diagnostic data
    const lastResultJson = stringifyJson({
      status: result.status,
      error:  result.error || null,
      failures: (result.steps || [])
        .filter(s => !s.success)
        .map(s => ({ step: s.action, error: s.error })),
      failureAriaSnapshot: result.failureAriaSnapshot || null,
      duration: result.duration,
      ranAt: new Date().toISOString()
    })
    await prisma.agentTestSpec.update({
      where: { specId: spec.specId },
      data: { status: result.status, lastResultJson }
    });
  }

  /**
   * Run all enabled agent specs
   * @returns {Array} Results for all specs
   */
  async runAllSpecs() {
    const specs = await prisma.agentTestSpec.findMany({
      where: { enabled: true, status: 'ready' }
    });
    const results = [];

    for (const spec of specs) {
      try {
        const result = await this.runSpec(spec.specId);
        results.push(result);
      } catch (error) {
        results.push({
          specId: spec.specId,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Generate Playwright code from a Markdown spec
   * @param {string} specId - The spec ID
   * @returns {string} Generated Playwright code
   */
  async generateCode(specId) {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } });
    if (!spec) {
      throw new Error(`Spec not found: ${specId}`);
    }

    let code;
    const testType = spec.testType || 'functional';

    switch (testType) {
      case 'api':
        code = this.generateAPITestCode(spec);
        break;
      case 'functional':
      default:
        // Functional tests (including those promoted to synthetic) use the same generator
        code = this.generateFunctionalTestCode(spec);
        break;
    }

    // Resolve storage mode (inline vs file) and persist
    const settings = await prisma.appSettings.findFirst()
    const { codeStorage, codeFilePath, generatedCode } = await saveGeneratedCode(specId, code, settings)

    await prisma.agentTestSpec.update({
      where: { specId },
      data: {
        generatedCode,
        codeStorage,
        codeFilePath,
        status: 'ready',
        generationMetaJson: stringifyJson({
          generatedAt: new Date().toISOString(),
          generatorVersion: '1.0.0',
          playwrightVersion: '1.59.0',
          testType: testType
        })
      }
    });

    return code;
  }

  /**
   * Generate Agent Test code (browser automation with healing)
   */
  generateAgentTestCode(spec) {
    const steps = this.parseMarkdownSpec(spec.markdownSpec);
    const safeName = (spec.name || 'Untitled').replace(/[\r\n]+/g, ' ');

    let code = `// Auto-generated Agent Test for: ${safeName}
// Generated at: ${new Date().toISOString()}
// Source spec: ${spec.specId}
// Type: Agent Test (Browser automation with auto-healing)

const { test, expect } = require('@playwright/test');

test(${JSON.stringify(safeName)}, async ({ page }) => {
  // Set default timeout for auto-healing
  page.setDefaultTimeout(30000);

`;

    for (const step of steps) {
      code += `  // ${step.raw}\n`;
      code += this.generateStepCode(step, spec.url);
      code += '\n';
    }

    code += `});\n`;
    return code;
  }

  /**
   * Generate Functional Test code (E2E user flows)
   */
  generateFunctionalTestCode(spec) {
    const steps = this.parseMarkdownSpec(spec.markdownSpec);
    const safeName = (spec.name || 'Untitled').replace(/[\r\n]+/g, ' ');

    let code = `// Auto-generated Functional Test for: ${safeName}
// Generated at: ${new Date().toISOString()}
// Source spec: ${spec.specId}
// Type: Functional Test (End-to-end user flow)

const { test, expect } = require('@playwright/test');

test.describe(${JSON.stringify(safeName)}, () => {
  test.beforeEach(async ({ page }) => {
    // Set up test context
    page.setDefaultTimeout(60000);
  });

  test('complete user flow', async ({ page }) => {
`;

    for (const step of steps) {
      code += `    // ${step.raw}\n`;
      code += '  ' + this.generateStepCode(step, spec.url);
      code += '\n';
    }

    code += `  });
});
`;
    return code;
  }

  /**
   * Generate API Test code (HTTP endpoint testing)
   */
  generateAPITestCode(spec) {
    const method = spec.method || 'GET';
    const headers = spec.headers ? JSON.parse(spec.headers || '{}') : {};
    const expectedStatus = spec.expectedStatus || 200;
    const safeName = (spec.name || 'Untitled').replace(/[\r\n]+/g, ' ');

    let code = `// Auto-generated API Test for: ${safeName}
// Generated at: ${new Date().toISOString()}
// Source spec: ${spec.specId}
// Type: API Test (HTTP endpoint testing)

const { test, expect, request } = require('@playwright/test');

test.describe(${JSON.stringify(safeName)}, () => {
  let apiContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: '${spec.url}',
      extraHTTPHeaders: ${JSON.stringify(headers, null, 6).replace(/\n/g, '\n      ')}
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('${method} request', async () => {
    const response = await apiContext.${method.toLowerCase()}('');

    // Verify status code
    expect(response.status()).toBe(${expectedStatus});

    // Get response body
    let body;
    try {
      body = await response.json();
    } catch (e) {
      body = await response.text();
    }

    // Log response for debugging
    console.log('Response status:', response.status());
    console.log('Response body:', typeof body === 'string' ? body : JSON.stringify(body, null, 2));
`;

    // Parse spec for additional assertions
    const steps = this.parseMarkdownSpec(spec.markdownSpec);
    for (const step of steps) {
      code += `
    // ${step.raw}`;
      switch (step.action) {
        case 'assertStatusCode':
          code += `
    expect(response.status()).toBe(${step.statusCode});
`;
          break;
        case 'assertResponseContains':
          code += `
    expect(JSON.stringify(body)).toContain('${step.text}');
`;
          break;
        case 'assertResponseProperty':
          code += `
    expect(body.${step.property}).toBeDefined();
`;
          break;
        case 'assertHeader':
          code += `
    expect(response.headers()['${step.headerName.toLowerCase()}']).toBe('${step.headerValue}');
`;
          break;
        case 'assertResponseType':
          if (step.expectedType === 'array') {
            code += `
    expect(Array.isArray(body)).toBe(true);
`;
          } else if (step.expectedType === 'json') {
            code += `
    // Verify response is valid JSON (object or array)
    expect(typeof body === 'object' || Array.isArray(body)).toBe(true);
`;
          } else {
            code += `
    expect(typeof body).toBe('${step.expectedType}');
`;
          }
          break;
        case 'assertText':
          // For API tests, treat text assertions as response body checks
          code += `
    expect(JSON.stringify(body)).toContain('${step.text}');
`;
          break;
        // Skip navigation and other UI-specific actions for API tests
        case 'navigate':
        case 'click':
        case 'fill':
        case 'screenshot':
          code += `
    // Skipped (UI action not applicable for API test)
`;
          break;
      }
    }

    code += `  });
});
`;
    return code;
  }

  /**
   * Generate Synthetic Test code (monitoring/uptime)
   */
  generateSyntheticTestCode(spec) {
    const alertThreshold = spec.alertThreshold || 3000;
    const steps = this.parseMarkdownSpec(spec.markdownSpec);

    let code = `// Auto-generated Synthetic Test for: ${spec.name}
// Generated at: ${new Date().toISOString()}
// Source spec: ${spec.specId}
// Type: Synthetic Test (Monitoring/Uptime)
// Schedule: ${spec.schedule || '*/30 * * * *'}
// Alert Threshold: ${alertThreshold}ms

const { test, expect } = require('@playwright/test');

test.describe('${spec.name} - Synthetic Monitor', () => {
  test.setTimeout(${alertThreshold + 5000});

  test('monitor check', async ({ page }) => {
    const startTime = Date.now();

    // Navigate to monitored URL
    const response = await page.goto('${spec.url}', {
      waitUntil: 'networkidle',
      timeout: ${alertThreshold}
    });

    const loadTime = Date.now() - startTime;

    // Check response status
    expect(response.status()).toBeLessThan(400);

    // Check load time against threshold
    expect(loadTime).toBeLessThan(${alertThreshold});
    console.log(\`Page loaded in \${loadTime}ms (threshold: ${alertThreshold}ms)\`);

`;

    for (const step of steps) {
      if (step.action === 'assertText' && step.text) {
        code += `    // ${step.raw}
    await expect(page.getByText('${step.text}')).toBeVisible({ timeout: 5000 });

`;
      } else if (step.action === 'screenshot') {
        code += `    // ${step.raw}
    await page.screenshot({ path: 'synthetic-${spec.specId}-' + Date.now() + '.png', fullPage: true });

`;
      }
    }

    code += `    // Capture web performance metrics
    const perfMetrics = await page.evaluate(() => {
      const t = performance.timing;
      const paint = performance.getEntriesByType('paint');
      const fcp = paint.find(e => e.name === 'first-contentful-paint');
      return {
        ttfb: t.responseStart - t.navigationStart,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        tti: t.domInteractive - t.navigationStart,
        domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
        fullPageLoad: t.loadEventEnd - t.navigationStart
      };
    });
    console.log('Performance metrics:', JSON.stringify(perfMetrics));
  });
});
`;
    return code;
  }

  /**
   * Replace URL placeholders in a step
   * @param {Object} step - The step object
   * @param {string} baseUrl - The base URL from the spec
   * @returns {Object} Step with URL placeholders resolved
   */
  resolveStepUrl(step, baseUrl) {
    if (!step.url) return step;
    // Replace {URL} placeholder with the actual base URL
    const resolvedUrl = step.url.replace(/\{URL\}/gi, baseUrl || '');
    return { ...step, url: resolvedUrl };
  }

  /**
   * Generate code for a single step
   * @param {Object} step - The step object
   * @param {string} baseUrl - Optional base URL for placeholder replacement
   */
  generateStepCode(step, baseUrl = '') {
    // Resolve URL placeholders if present
    const resolvedStep = this.resolveStepUrl(step, baseUrl);

    switch (resolvedStep.action) {
      case 'navigate':
        return `  await page.goto('${resolvedStep.url}');\n`;
      case 'click':
        return `  await page.getByRole('button', { name: '${step.target}' }).or(page.getByText('${step.target}')).click();\n`;
      case 'fill':
        return `  await page.getByPlaceholder('${step.target}').or(page.getByLabel('${step.target}')).fill('${step.value}');\n`;
      case 'waitForSelector':
        return `  await page.getByText('${step.target}').waitFor();\n`;
      case 'waitForTimeout':
        return `  await page.waitForTimeout(${step.timeout});\n`;
      case 'assertText':
        return `  await expect(page.getByText('${step.text}')).toBeVisible();\n`;
      case 'screenshot':
        return `  await page.screenshot({ path: 'screenshot.png', fullPage: true });\n`;
      case 'select':
        return `  await page.getByLabel('${step.target}').selectOption('${step.value}');\n`;
      // API-specific step code generation
      case 'assertStatusCode':
        return `  expect(response.status()).toBe(${step.statusCode});\n`;
      case 'httpRequest':
        return `  const response = await apiContext.${step.method.toLowerCase()}('');\n`;
      case 'assertResponseContains':
        return `  expect(JSON.stringify(body)).toContain('${step.text}');\n`;
      case 'assertResponseProperty':
        return `  expect(body.${step.property}).toBeDefined();\n`;
      case 'assertHeader':
        return `  expect(response.headers()['${step.headerName.toLowerCase()}']).toBe('${step.headerValue}');\n`;
      case 'assertResponseType':
        if (step.expectedType === 'array') {
          return `  expect(Array.isArray(body)).toBe(true);\n`;
        } else if (step.expectedType === 'json') {
          return `  expect(typeof body === 'object' || Array.isArray(body)).toBe(true);\n`;
        }
        return `  expect(typeof body).toBe('${step.expectedType}');\n`;
      default:
        return `  // Unknown action: ${step.raw}\n`;
    }
  }

  /**
   * Attempt to heal a failing spec by re-analyzing and updating selectors
   * @param {string} specId - The spec ID to heal
   * @returns {Object} Heal result
   */
  async healSpec(specId) {
    const spec = await prisma.agentTestSpec.findUnique({ where: { specId } });
    if (!spec) {
      throw new Error(`Spec not found: ${specId}`);
    }

    // Re-generate the code with updated strategies
    const steps = this.parseMarkdownSpec(spec.markdownSpec);

    let code = `// Auto-healed Playwright test for: ${spec.name}
// Healed at: ${new Date().toISOString()}
// Source spec: ${specId}
// Heal count: ${(spec.healCount || 0) + 1}

const { test, expect } = require('@playwright/test');

test('${spec.name}', async ({ page }) => {
  // Set longer timeout for flaky elements
  page.setDefaultTimeout(30000);

`;

    for (const step of steps) {
      code += `  // ${step.raw}\n`;
      // Resolve URL placeholders
      const resolvedStep = this.resolveStepUrl(step, spec.url);

      switch (resolvedStep.action) {
        case 'navigate':
          code += `  await page.goto('${resolvedStep.url}', { waitUntil: 'networkidle' });\n`;
          break;
        case 'click':
          // More robust click with multiple strategies
          code += `  await page.getByRole('button', { name: /${resolvedStep.target}/i })\n`;
          code += `    .or(page.getByRole('link', { name: /${resolvedStep.target}/i }))\n`;
          code += `    .or(page.getByText(/${resolvedStep.target}/i))\n`;
          code += `    .first()\n`;
          code += `    .click();\n`;
          break;
        case 'fill':
          // More robust fill with multiple strategies
          code += `  await page.getByPlaceholder(/${resolvedStep.target}/i)\n`;
          code += `    .or(page.getByLabel(/${resolvedStep.target}/i))\n`;
          code += `    .or(page.locator('[name="${resolvedStep.target}"]'))\n`;
          code += `    .first()\n`;
          code += `    .fill('${resolvedStep.value}');\n`;
          break;
        case 'waitForSelector':
          code += `  await page.getByText(/${resolvedStep.target}/i).or(page.locator('[aria-label*="${resolvedStep.target}" i]')).first().waitFor({ state: 'visible' });\n`;
          break;
        case 'waitForTimeout':
          code += `  await page.waitForTimeout(${resolvedStep.timeout});\n`;
          break;
        case 'assertText':
          code += `  await expect(page.getByText(/${resolvedStep.text}/i).first()).toBeVisible({ timeout: 10000 });\n`;
          break;
        case 'screenshot':
          code += `  await page.screenshot({ path: 'screenshot.png', fullPage: true });\n`;
          break;
        default:
          code += `  // Unknown action: ${resolvedStep.raw}\n`;
      }
      code += '\n';
    }

    code += `});\n`;

    // Resolve storage mode and persist healed code
    const settings = await prisma.appSettings.findFirst()
    const { codeStorage, codeFilePath, generatedCode: healedCode } = await saveGeneratedCode(specId, code, settings)

    await prisma.agentTestSpec.update({
      where: { specId },
      data: {
        generatedCode: healedCode,
        codeStorage,
        codeFilePath,
        status: 'ready',
        healCount: { increment: 1 },
        lastHealDetailsJson: stringifyJson({
          healedAt: new Date().toISOString(),
          reason: 'Manual heal request',
          changes: 'Applied more robust selectors with regex and fallback strategies'
        })
      }
    });

    return {
      healed: true,
      generatedCode: code,
      message: 'Spec healed with more robust selectors'
    };
  }

  /**
   * Extract the body of the last test() block from generated Playwright code.
   * Used to inline individual spec bodies into a composite pack file.
   * @param {string} generatedCode
   * @returns {string} The inner body of the test() block
   */
  extractTestBody(generatedCode) {
    if (!generatedCode) return '  // no generated code\n';
    const testStart = generatedCode.lastIndexOf("test('") !== -1
      ? generatedCode.lastIndexOf("test('")
      : generatedCode.lastIndexOf('test("');
    if (testStart === -1) return '  // could not extract body\n';
    let depth = 0, bodyStart = -1, i = testStart;
    while (i < generatedCode.length) {
      if (generatedCode[i] === '{') { if (depth === 0) bodyStart = i + 1; depth++; }
      if (generatedCode[i] === '}') { depth--; if (depth === 0) return generatedCode.slice(bodyStart, i); }
      i++;
    }
    return '  // extraction failed\n';
  }

  /**
   * Build a composite Playwright spec file for an entire test pack.
   * Specs must have generatedCode pre-resolved (inline or read from disk) before calling this.
   * @param {Object} pack - TestPack record (with packSetupCode / packTeardownCode)
   * @param {Array}  specs - AgentTestSpec records with resolved generatedCode
   * @returns {string} The full .spec.js file content
   */
  generatePackFile(pack, specs) {
    const tests = specs.map(spec => `
test(${JSON.stringify(spec.name)}, async ({ page, request }) => {
${this.extractTestBody(spec.generatedCode)}
})`).join('\n');

    // If any adopted spec has a fixtures file, require it so its setup hooks fire
    const fixturesPath = specs.find(s => s.fixturesFilePath)?.fixturesFilePath
    const fixturesLine = fixturesPath ? `require(${JSON.stringify(fixturesPath)});\n` : ''

    return `// Generated by Aurora — pack: ${pack.name}
const { test, expect } = require('@playwright/test');
${fixturesLine}const ctx = {};

test.beforeAll(async ({ request }) => {
${pack.packSetupCode || '  // no setup'}
});

test.afterAll(async ({ request }) => {
${pack.packTeardownCode || '  // no teardown'}
});
${tests}
`;
  }

  /**
   * Run all specs in a test pack using the inline browser runner.
   * Handles both new-format (module.exports = async function) and old-format (test.describe) specs.
   * Returns per-spec pass/fail results.
   * @param {Object} pack  - TestPack record
   * @param {Array}  specs - AgentTestSpec records with generatedCode
   * @returns {Promise<Array>} Array of { specId, specName, status, error, stackTrace }
   */
  async runPackAsFile(pack, specs, dataContext = { mode: 'none' }) {
    const fsSync = require('fs');
    const evidenceSettings = await prisma.appSettings.findFirst().catch(() => null);
    let browser;

    try {
      browser = await chromium.launch({
        headless: config.browser.headless,
        executablePath: config.browser.executablePath || undefined,
        args: config.browser.args
      });
    } catch (e) {
      return specs.map(s => ({
        specId: s.specId,
        specName: s.name,
        status: 'failed',
        error: `Browser launch failed: ${e.message}`,
        stackTrace: null
      }));
    }

    const results = [];
    const mode = dataContext?.mode || 'none'
    const rows = dataContext?.rows || []
    const headers = dataContext?.headers || []
    const datasetName = dataContext?.name || pack?.name || 'Dataset'

    // Build testData fixture array (compatible with Continuum format)
    const testDataFixture = rows.length > 0 ? [{
      name: datasetName,
      headers: headers,
      rows: rows,
      mode: mode
    }] : []

    function firstTwoKeyValues(row) {
      return Object.entries(row).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')
    }

    // Build preamble that injects testData, getDataset, getRows global helpers
    function buildTestDataPreamble(testData, currentRow = null) {
      const testDataJson = JSON.stringify(testData).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      let preamble = `
// Aurora Test Data Fixtures
const __testData__ = JSON.parse('${testDataJson}');
const testData = __testData__;
const getDataset = (name) => __testData__.find(d => d.name === name);
const getRows = (name) => {
  const ds = __testData__.find(d => d.name === name);
  return ds?.rows || [];
};
`
      if (currentRow !== null) {
        preamble += `const __row__ = ${JSON.stringify(currentRow)};\n`
      }
      return preamble
    }

    try {
      for (const spec of specs) {
        const rawCode = spec.generatedCode || '';

        if (mode === 'per_row' && rows.length > 0) {
          // Run spec once per row — N results per spec
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const preamble = buildTestDataPreamble(testDataFixture, row)
            const patchedCode = preamble + rawCode
            const rowLabel = firstTwoKeyValues(row)
            const specResult = {
              specId: spec.specId,
              specName: `${spec.name} — row ${i + 1}: ${rowLabel}`,
              status: 'passed',
              error: null,
              stackTrace: null,
              metadataJson: JSON.stringify({ rowIndex: i, rowData: row })
            }
            try {
              const evidence = buildEvidenceContextFromSettings(evidenceSettings, specResult.specName)
              const testResults = await playwrightShimRunner.runGeneratedSpec(patchedCode, browser, { evidence });
              const allResults = testResults || []
              const failed = allResults.filter(r => !r.ok);
              specResult.steps = allResults.map(r => ({ action: r.title, success: r.ok, error: r.error || null }))
              if (failed.length > 0) {
                specResult.status = 'failed';
                specResult.error = failed.map(r => `${r.title}: ${r.error || 'failed'}`).join('; ');
                const bundledRaw = failed.find(r => r.evidenceDir)
                if (bundledRaw?.evidenceDir) specResult.evidenceDir = bundledRaw.evidenceDir
              }
            } catch (e) {
              specResult.status = 'failed';
              specResult.error = e.message.split('\n')[0];
            }
            results.push(specResult);
          }
        } else {
          // Normal run (mode=none) or loop mode (preamble injected, one result per spec)
          const specResult = { specId: spec.specId, specName: spec.name, status: 'passed', error: null, stackTrace: null, steps: [] };
          try {
            let codeToRun = rawCode
            if (mode === 'loop' && rows.length > 0) {
              // Loop mode: inject all rows, spec iterates
              const preamble = buildTestDataPreamble(testDataFixture)
              const csvAbsPath = dataContext.csvAbsPath || ''
              codeToRun = preamble + `const __csvPath__ = ${JSON.stringify(csvAbsPath)};\nconst __csvData__ = ${JSON.stringify(rows.slice(0, 50))};\n` + rawCode
            } else if (testDataFixture.length > 0) {
              // Even in 'none' mode, inject testData so specs can access it if they want
              const preamble = buildTestDataPreamble(testDataFixture)
              codeToRun = preamble + rawCode
            }
            const evidence = buildEvidenceContextFromSettings(evidenceSettings, specResult.specName)
            const testResults = await playwrightShimRunner.runGeneratedSpec(codeToRun, browser, { evidence });
            const allResults = testResults || []
            const failed = allResults.filter(r => !r.ok);
            specResult.steps = allResults.map(r => ({ action: r.title, success: r.ok, error: r.error || null }))
            if (failed.length > 0) {
              specResult.status = 'failed';
              specResult.error = failed.map(r => `${r.title}: ${r.error || 'failed'}`).join('; ');
              const bundledRaw = failed.find(r => r.evidenceDir)
              if (bundledRaw?.evidenceDir) specResult.evidenceDir = bundledRaw.evidenceDir
            }
          } catch (e) {
            specResult.status = 'failed';
            specResult.error = e.message.split('\n')[0];
          }
          results.push(specResult);
        }
      }
    } finally {
      try { await browser.close(); } catch {}
    }

    return results;
  }

}

// Export singleton instance
module.exports = new AgentTestRunner();
