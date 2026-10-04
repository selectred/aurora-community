'use strict'
const { chromium } = require('playwright')
const { EventEmitter } = require('events')
const crypto = require('crypto')

// Active recording sessions: sessionId → { browser, page, steps, traffic, emitter, startedAt, timer }
const sessions = new Map()

// Network traffic from finished recordings, kept briefly so a k6 load test can be
// generated from it (see k6/k6Converter.js). In memory only, on this machine.
const finishedTraffic = new Map() // sessionId → { traffic, startUrl, expiresAt }
const TRAFFIC_TTL_MS = 2 * 60 * 60 * 1000
const MAX_TRAFFIC = 2000
const MAX_BODY_BYTES = 256 * 1024
// Only requests a load test would replay: page loads and API calls.
const CAPTURED_TYPES = new Set(['document', 'xhr', 'fetch'])
// Request headers worth replaying. Cookies are left to k6's cookie jar.
const KEEP_HEADER = /^(content-type|accept|authorization|x-[a-z0-9-]+)$/i

// Sensitive field heuristics — values become {{PLACEHOLDER}} in generated code
const SENSITIVE_NAMES = /password|secret|token|key|pin|cvv|ssn|credential/i
const SENSITIVE_TYPES = new Set(['password'])

// The overlay script injected into every page in the recording browser.
// It adds a hover highlight, captures click/fill/select/navigate events,
// and renders a fixed control bar so the user can stop without switching back to Aurora.
const OVERLAY_SCRIPT = (sessionId, backendUrl) => `
(function() {
  const SESSION_ID = ${JSON.stringify(sessionId)};
  const BACKEND = ${JSON.stringify(backendUrl)};
  let stepCount = 0;

  // Control bar
  const bar = document.createElement('div');
  bar.id = '__aurora_rec_bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:6px 14px;background:#7367F0;color:#fff;font:13px/1 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);';
  bar.innerHTML = '<span style="font-weight:600;letter-spacing:.3px">● Aurora Recording</span><span id="__aurora_step_count" style="opacity:.8">0 steps</span><button id="__aurora_stop" style="margin-left:auto;padding:4px 12px;border-radius:4px;border:1.5px solid rgba(255,255,255,.6);background:transparent;color:#fff;cursor:pointer;font:inherit;">Stop</button>';
  document.documentElement.appendChild(bar);

  document.getElementById('__aurora_stop').addEventListener('click', () => {
    fetch(BACKEND + '/api/agent-tests/recording/stop-from-browser/' + SESSION_ID, { method: 'POST' }).catch(() => {});
  });

  function updateCount() {
    const el = document.getElementById('__aurora_step_count');
    if (el) el.textContent = stepCount + ' step' + (stepCount === 1 ? '' : 's');
  }

  // Hover highlight
  let lastHighlighted = null;
  const HIGHLIGHT_STYLE = 'outline: 2.5px solid #7367F0 !important; outline-offset: 2px !important;';
  document.addEventListener('mouseover', e => {
    if (e.target.closest('#__aurora_rec_bar')) return;
    if (lastHighlighted && lastHighlighted !== e.target) lastHighlighted.style.outline = '';
    e.target.style.cssText += HIGHLIGHT_STYLE;
    lastHighlighted = e.target;
  }, true);
  document.addEventListener('mouseout', e => {
    if (e.target !== document.getElementById('__aurora_rec_bar')) e.target.style.outline = '';
  }, true);

  function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ||
      (tag === 'button' ? 'button' :
       tag === 'a' ? 'link' :
       tag === 'input' && el.type === 'checkbox' ? 'checkbox' :
       tag === 'input' || tag === 'textarea' ? 'textbox' :
       tag === 'select' ? 'combobox' : '');
    const name = (el.getAttribute('aria-label') ||
      (el.id && document.querySelector('label[for="' + el.id + '"]')?.textContent?.trim()) ||
      el.getAttribute('placeholder') ||
      el.textContent?.trim().slice(0, 60) || '').replace(/\\s+/g, ' ');
    const placeholder = el.getAttribute('placeholder') || '';
    const inputType = el.getAttribute('type') || '';
    const inputName = el.getAttribute('name') || '';
    return { tag, role, name, placeholder, inputType, inputName };
  }

  function sendStep(step) {
    stepCount++;
    updateCount();
    fetch(BACKEND + '/api/agent-tests/recording/event/' + SESSION_ID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(step)
    }).catch(() => {});
  }

  // Click capture
  document.addEventListener('click', e => {
    if (e.target.closest('#__aurora_rec_bar')) return;
    const info = getElementInfo(e.target);
    if (info.tag === 'select') return; // handled by change
    sendStep({ action: 'click', ...info, url: window.location.href });
  }, true);

  // Fill / input capture (debounced — send on blur)
  const fillTimers = new WeakMap();
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.tagName.toLowerCase() !== 'input' && el.tagName.toLowerCase() !== 'textarea') return;
    if (fillTimers.has(el)) clearTimeout(fillTimers.get(el));
    fillTimers.set(el, setTimeout(() => {
      const info = getElementInfo(el);
      sendStep({ action: 'fill', ...info, value: el.value, url: window.location.href });
    }, 600));
  }, true);

  // Select / combobox capture
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.tagName.toLowerCase() !== 'select') return;
    const info = getElementInfo(el);
    sendStep({ action: 'select', ...info, value: el.value, url: window.location.href });
  }, true);
})();
`

function generateCode(steps) {
  const lines = [
    "const { test, expect } = require('@playwright/test');",
    '',
    "test.describe('Recorded Test', () => {",
    "  test('recorded flow', async ({ page }) => {",
  ]

  let lastUrl = null
  for (const step of steps) {
    if (step.action === 'navigate' || (step.url && step.url !== lastUrl && step.action === 'click' && !step.url.includes('#'))) {
      // Navigation is emitted separately — skip URL-change on click steps since
      // we track navigation via page events at the backend level
    }
    if (step.action === 'navigate') {
      lastUrl = step.url
      lines.push(`    await page.goto(${JSON.stringify(step.url)}, { waitUntil: 'domcontentloaded' });`)
      continue
    }

    const isSensitive = SENSITIVE_NAMES.test(step.name || '') ||
      SENSITIVE_NAMES.test(step.inputName || '') ||
      SENSITIVE_TYPES.has(step.inputType || '')

    if (step.action === 'fill') {
      const placeholder = isSensitive
        ? '{{' + (step.inputName || step.name || 'VALUE').toUpperCase().replace(/[^A-Z0-9]/g, '_') + '}}'
        : step.value || ''
      if (step.placeholder) {
        lines.push(`    await page.getByPlaceholder(${JSON.stringify(step.placeholder)}).fill(${JSON.stringify(placeholder)});`)
      } else if (step.name) {
        lines.push(`    await page.getByLabel(${JSON.stringify(step.name)}).fill(${JSON.stringify(placeholder)});`)
      } else {
        lines.push(`    await page.getByRole('textbox').first().fill(${JSON.stringify(placeholder)});`)
      }
    } else if (step.action === 'click') {
      if (step.role && step.name) {
        lines.push(`    await page.getByRole(${JSON.stringify(step.role)}, { name: ${JSON.stringify(step.name)} }).first().click();`)
      } else if (step.name) {
        lines.push(`    await page.getByText(${JSON.stringify(step.name)}).first().click();`)
      }
    } else if (step.action === 'select') {
      if (step.name) {
        lines.push(`    await page.getByRole('combobox', { name: ${JSON.stringify(step.name)} }).selectOption(${JSON.stringify(step.value || '')});`)
      }
    }
  }

  lines.push('  });', '});')
  return lines.join('\n')
}

async function startSession(url) {
  const sessionId = crypto.randomBytes(8).toString('hex')
  const emitter = new EventEmitter()
  emitter.setMaxListeners(20)

  // The recorder is interactive, so the browser is visible. AURORA_RECORDER_HEADLESS=1
  // runs it headless for automated tests only.
  const browser = await chromium.launch({ headless: process.env.AURORA_RECORDER_HEADLESS === '1' })
  const context = await browser.newContext()
  const page = await context.newPage()
  // Register the session before the first navigation so its traffic (the page
  // load itself) is captured too.
  sessions.set(sessionId, { browser, page, steps: [], traffic: [], startUrl: url || '', emitter, startedAt: Date.now(), timer: null })
  let currentPage = url || ''
  let seq = 0

  // Capture HTTP traffic alongside the UI steps, for k6 load-test generation.
  const captureRequest = async (req, failure) => {
    const session = sessions.get(sessionId)
    if (!session || session.traffic.length >= MAX_TRAFFIC) return
    if (!CAPTURED_TYPES.has(req.resourceType())) return
    const entry = {
      seq: seq++,
      ts: Date.now(),
      page: currentPage,
      stepIndex: session.steps.length,
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      requestHeaders: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => KEEP_HEADER.test(k))),
      postData: null,
      status: null,
      responseContentType: '',
      responseJson: null,
      failure: failure || null
    }
    const body = req.postData()
    if (body && Buffer.byteLength(body) <= MAX_BODY_BYTES) entry.postData = body
    if (!failure) {
      try {
        const res = await req.response()
        if (res) {
          entry.status = res.status()
          entry.responseContentType = res.headers()['content-type'] || ''
          if (/json/i.test(entry.responseContentType)) {
            const buf = await res.body().catch(() => null)
            if (buf && buf.length <= MAX_BODY_BYTES) {
              try { entry.responseJson = JSON.parse(buf.toString('utf8')) } catch { /* not JSON after all */ }
            }
          }
        }
      } catch { /* page closed mid-request */ }
    }
    session.traffic.push(entry)
  }
  context.on('requestfinished', req => { captureRequest(req) })
  context.on('requestfailed', req => { captureRequest(req, req.failure()?.errorText || 'failed') })

  // Inject overlay on every navigation
  await page.addInitScript(new Function(
    OVERLAY_SCRIPT(sessionId, 'http://localhost:3000')
  ))

  // Track navigations as steps
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return
    const session = sessions.get(sessionId)
    if (!session) return
    const navUrl = frame.url()
    if (navUrl === 'about:blank') return
    currentPage = navUrl
    const step = { action: 'navigate', url: navUrl }
    session.steps.push(step)
    emitter.emit('step', step)
  })

  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {})
  }

  // Auto-cleanup when browser is closed by the user
  browser.on('disconnected', () => {
    const session = sessions.get(sessionId)
    if (session) {
      keepTraffic(sessionId, session)
      emitter.emit('stopped', { steps: session.steps, code: generateCode(session.steps), trafficCount: session.traffic.length })
      sessions.delete(sessionId)
    }
  })

  // Auto-kill after 45 minutes
  const session = sessions.get(sessionId)
  if (session) session.timer = setTimeout(() => stopSession(sessionId), 45 * 60 * 1000)
  return { sessionId }
}

function addEvent(sessionId, step) {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.steps.push(step)
  session.emitter.emit('step', step)
  return true
}

async function stopSession(sessionId) {
  const session = sessions.get(sessionId)
  if (!session) return null
  clearTimeout(session.timer)
  const { steps } = session
  keepTraffic(sessionId, session)
  try { await session.browser.close() } catch {}
  sessions.delete(sessionId)
  return { steps, code: generateCode(steps), trafficCount: session.traffic.length }
}

function getEmitter(sessionId) {
  return sessions.get(sessionId)?.emitter || null
}

function removeStep(sessionId, index) {
  const session = sessions.get(sessionId)
  if (!session) return false
  session.steps.splice(index, 1)
  return true
}

function keepTraffic(sessionId, session) {
  const now = Date.now()
  for (const [id, t] of finishedTraffic) if (t.expiresAt < now) finishedTraffic.delete(id)
  finishedTraffic.set(sessionId, { traffic: session.traffic, startUrl: session.startUrl, expiresAt: now + TRAFFIC_TTL_MS })
}

/** Traffic for a live or recently finished recording, or null. */
function getTraffic(sessionId) {
  const live = sessions.get(sessionId)
  if (live) return { traffic: live.traffic, startUrl: live.startUrl }
  const done = finishedTraffic.get(sessionId)
  if (!done || done.expiresAt < Date.now()) return null
  return { traffic: done.traffic, startUrl: done.startUrl }
}

function getSteps(sessionId) {
  return sessions.get(sessionId)?.steps || null
}

module.exports = { startSession, stopSession, addEvent, getEmitter, removeStep, getSteps, getTraffic, generateCode }
