const { chromium } = require('playwright');
const config = require('../tests/synthetic/config');

/**
 * PageProbeService
 *
 * Visits a URL with a headless browser and extracts structured page data
 * (navigation, headings, forms, buttons, etc.) to feed into AI prompts.
 * This gives the AI real element text so it can generate site-specific
 * Playwright tests rather than generic natural-language placeholders.
 */
class PageProbeService {

  /**
   * Probe a URL and return structured page data.
   * @param {string} url
   * @returns {Promise<PageProbeResult>}
   */
  async probe(url) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: config.browser.executablePath,
      args: config.browser.args
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (compatible; AuroraProbe/1.0)'
      });

      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Pass as a string so pkg bundling doesn't break Playwright's function serialization
      const data = await page.evaluate(`(() => {
        function text(el) {
          return (el.textContent || el.innerText || '').trim().replace(/\\s+/g, ' ');
        }
        function visible(el) {
          const s = window.getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
        }

        const title = document.title;
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

        let navLinks = [];
        const navEls = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
        for (const nav of navEls) {
          const menuDivs = Array.from(nav.querySelectorAll('div')).filter(div => {
            const directLinks = Array.from(div.children).filter(c => c.tagName === 'A');
            return directLinks.length >= 2;
          });
          const sourceLinks = menuDivs.length > 0
            ? menuDivs.reduce((a, b) =>
                Array.from(a.children).filter(c => c.tagName === 'A').length >=
                Array.from(b.children).filter(c => c.tagName === 'A').length ? a : b)
            : nav;
          const links = Array.from(sourceLinks.querySelectorAll('a'))
            .filter(a => visible(a) && text(a).length > 0)
            .map(a => ({
              text: text(a),
              href: a.getAttribute('href') || '',
              isExternal: (a.getAttribute('href') || '').startsWith('http') &&
                          !a.getAttribute('href').includes(location.hostname)
            }));
          if (links.length > navLinks.length) navLinks = links;
        }

        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .filter(h => visible(h) && text(h).length > 0)
          .slice(0, 10)
          .map(h => ({ level: parseInt(h.tagName[1]), text: text(h) }));

        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a.btn, a[class*="button"], a[class*="btn"]'))
          .filter(b => visible(b) && text(b).length > 0)
          .slice(0, 15)
          .map(b => ({
            text: text(b),
            type: b.tagName === 'BUTTON' ? (b.type || 'button') : 'link',
            href: b.getAttribute('href') || null
          }));

        const forms = Array.from(document.querySelectorAll('form'))
          .filter(f => visible(f))
          .map(f => ({
            action: f.getAttribute('action') || '',
            method: (f.getAttribute('method') || 'GET').toUpperCase(),
            fields: Array.from(f.querySelectorAll('input, textarea, select'))
              .filter(i => i.type !== 'hidden' && visible(i))
              .map(i => {
                const labelEl = i.id
                  ? document.querySelector('label[for="' + i.id + '"]')
                  : i.closest('label') || i.previousElementSibling;
                return {
                  label: labelEl ? text(labelEl) : '',
                  type: i.type || i.tagName.toLowerCase(),
                  name: i.name || i.id || '',
                  placeholder: i.placeholder || '',
                  required: i.required
                };
              })
          }))
          .filter(f => f.fields.length > 0);

        const sections = Array.from(document.querySelectorAll('section, article, main > div, [role="main"] > div'))
          .filter(s => visible(s))
          .slice(0, 8)
          .map(s => {
            const heading = s.querySelector('h1, h2, h3, h4');
            return heading ? text(heading) : (s.getAttribute('aria-label') || s.id || '');
          })
          .filter(s => s.length > 0);

        const hasHeader = !!document.querySelector('header');
        const hasFooter = !!document.querySelector('footer');
        const hasMain   = !!document.querySelector('main, [role="main"]');
        const hasSearch = !!document.querySelector('[role="search"], input[type="search"]');

        return {
          title,
          metaDescription: metaDesc,
          url: location.href,
          navigation: navLinks,
          headings,
          buttons,
          forms,
          sections,
          landmarks: { hasHeader, hasFooter, hasMain, hasSearch }
        };
      })()`);

      return data;

    } finally {
      await browser.close();
    }
  }

  /**
   * Navigate the live page in a browser and return a context string built from
   * the actual accessibility tree and link hrefs — used at generation time so
   * the AI writes locators from observed DOM, not guessed structure.
   * @param {string} url
   * @returns {Promise<{ context: string, stats: object }>}
   */
  async ariaSnapshot(url) {
    const { chromium } = require('playwright')

    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: config.browser.executablePath || undefined,
        args: config.browser.args || ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      })

      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (compatible; AuroraProbe/1.0)'
      })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

      // Real ARIA tree — roles + accessible names, maps directly to getByRole locators
      const ariaYaml = await page.ariaSnapshot({ timeout: 15000 }).catch(() => null)

      // DOM evaluate for link hrefs — ARIA tree doesn't carry these
      const domData = await page.evaluate(`(() => {
        function visible(el) {
          const s = window.getComputedStyle(el)
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0
        }
        function txt(el) {
          return (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
        }
        const host = location.hostname

        const links = Array.from(document.querySelectorAll('a[href]'))
          .filter(a => visible(a) && txt(a).length > 0)
          .map(a => ({
            text: txt(a),
            href: a.href,
            path: a.pathname + (a.search || ''),
            isExternal: a.hostname !== host,
            opensNewTab: a.target === '_blank'
          }))
          .slice(0, 50)

        const forms = Array.from(document.querySelectorAll('form'))
          .filter(f => visible(f))
          .map(f => ({
            method: (f.method || 'GET').toUpperCase(),
            fields: Array.from(f.querySelectorAll('input,textarea,select'))
              .filter(i => i.type !== 'hidden' && visible(i))
              .map(i => {
                const lbl = i.id ? document.querySelector('label[for="'+i.id+'"]') : i.closest('label') || i.previousElementSibling
                return { label: lbl ? txt(lbl) : '', type: i.type || i.tagName.toLowerCase(), name: i.name || i.id || '', placeholder: i.placeholder || '', required: i.required }
              })
          }))
          .filter(f => f.fields.length > 0)

        return { title: document.title, url: location.href, links, forms }
      })()`)

      await browser.close()
      browser = null

      const context = this._formatAriaContext(ariaYaml, domData)
      const stats = {
        interactive: domData.links.length + domData.forms.reduce((n, f) => n + f.fields.length, 0),
        links: domData.links.length,
        forms: domData.forms.length
      }
      return { context, stats }

    } finally {
      if (browser) try { await browser.close() } catch {}
    }
  }

  _formatAriaContext(ariaYaml, domData) {
    const lines = [`Page: "${domData.title}" (${domData.url})`]

    // ARIA tree is the primary source — AI uses these exact role+name pairs for getByRole locators
    if (ariaYaml) {
      lines.push('\nAccessibility tree (use these EXACT role+name pairs with getByRole/getByLabel/getByPlaceholder):')
      // Trim to ~80 lines so the prompt stays focused
      const treeLines = ariaYaml.split('\n').slice(0, 80)
      lines.push(...treeLines)
    }

    // Link hrefs — ARIA tree has names but not hrefs, so we add navigation metadata separately
    const internal = domData.links.filter(l => !l.isExternal && !l.opensNewTab)
    const newTab = domData.links.filter(l => l.opensNewTab)
    const externalSameTab = domData.links.filter(l => l.isExternal && !l.opensNewTab)

    if (internal.length > 0) {
      lines.push('\nInternal links (same domain, same tab):')
      internal.slice(0, 20).forEach(l => lines.push(`  - "${l.text}" → ${l.path}`))
    }

    if (externalSameTab.length > 0) {
      lines.push('\nExternal links (different domain, same tab — navigates away from site):')
      externalSameTab.slice(0, 10).forEach(l => lines.push(`  - "${l.text}" → ${l.href}`))
    }

    if (newTab.length > 0) {
      lines.push('\nNew-tab links (target="_blank" — opens in new window):')
      newTab.slice(0, 10).forEach(l => lines.push(`  - "${l.text}" → ${l.href}`))
    }

    if (domData.forms.length > 0) {
      lines.push('\nForms:')
      domData.forms.forEach((f, i) => {
        lines.push(`  Form ${i + 1} (${f.method}):`)
        f.fields.forEach(field =>
          lines.push(`    - ${field.label || field.placeholder || field.name} [${field.type}]${field.required ? ' *required' : ''}`)
        )
      })
    } else {
      lines.push('\nForms: NONE FOUND — do not generate form or input field tests')
    }

    return lines.join('\n')
  }

  /**
   * Format probe data as a concise context string for AI prompts.
   * @param {object} probeData
   * @returns {string}
   */
  formatForPrompt(probeData) {
    const lines = [
      `URL: ${probeData.url}`,
      `Title: ${probeData.title}`,
    ];

    if (probeData.metaDescription) {
      lines.push(`Description: ${probeData.metaDescription}`);
    }

    if (probeData.navigation?.length) {
      lines.push('\nNavigation links:');
      probeData.navigation.forEach(l =>
        lines.push(`  - "${l.text}" → ${l.href}${l.isExternal ? ' (external)' : ''}`)
      );
    }

    if (probeData.headings?.length) {
      lines.push('\nPage headings:');
      probeData.headings.forEach(h =>
        lines.push(`  ${'#'.repeat(h.level)} ${h.text}`)
      );
    }

    if (probeData.buttons?.length) {
      lines.push('\nButtons / CTAs:');
      probeData.buttons.slice(0, 8).forEach(b => {
        const dest = b.href ? ` → ${b.href}` : ''
        const ext = b.href && b.href.startsWith('http') && !b.href.includes(new URL(probeData.url || 'http://x').hostname) ? ' (external)' : ''
        lines.push(`  - "${b.text}" (${b.type})${dest}${ext}`)
      })
    } else {
      lines.push('\nButtons / CTAs: NONE FOUND')
    }

    if (probeData.forms?.length) {
      lines.push('\nForms:');
      probeData.forms.forEach((f, i) => {
        lines.push(`  Form ${i + 1} (${f.method} ${f.action || 'self'}):`);
        f.fields.forEach(field =>
          lines.push(`    - ${field.label || field.name || field.placeholder} [${field.type}]${field.required ? ' *required' : ''}`)
        );
      });
    } else {
      lines.push('\nForms: NONE FOUND — do not generate form or input tests')
    }

    if (probeData.sections?.length) {
      lines.push('\nContent sections:');
      probeData.sections.forEach(s => lines.push(`  - ${s}`));
    }

    const { hasHeader, hasFooter, hasMain, hasSearch } = probeData.landmarks || {};
    const landmarks = [
      hasHeader && 'header',
      hasMain && 'main',
      hasFooter && 'footer',
      hasSearch && 'search'
    ].filter(Boolean);
    if (landmarks.length) {
      lines.push(`\nPage landmarks: ${landmarks.join(', ')}`);
    }

    return lines.join('\n');
  }
}

module.exports = new PageProbeService();
