'use strict'
/**
 * One-off script: inject full performance metrics block (TTFB, FCP, TTI,
 * domContentLoaded, fullPageLoad) into all existing browser test specs that
 * don't already have it.
 *
 * Run from Aurora/backend/:
 *   node scripts/backfill-perf-metrics.js
 *
 * Dry-run (preview only, no writes):
 *   node scripts/backfill-perf-metrics.js --dry-run
 */

const prisma = require('../lib/prisma')

const DRY_RUN = process.argv.includes('--dry-run')

const PERF_BLOCK = `    // Capture web performance metrics
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
    console.log('Performance metrics:', JSON.stringify(perfMetrics));`

/**
 * Inject PERF_BLOCK before each `  });` line that closes a test() block.
 * Standard Aurora-generated specs use 2-space indent for test closings and
 * 0-space for the describe() closing — so this targets tests only.
 * Returns null if already has perf metrics (no change needed).
 */
function inject(code) {
  if (code.includes('perfMetrics') || code.includes('Performance metrics:')) {
    return null
  }
  // Only inject into specs that actually have a page fixture
  if (!code.includes('async ({ page')) {
    return null
  }
  const patched = code.replace(/^(  \}\);)$/gm, `${PERF_BLOCK}\n$1`)
  return patched === code ? null : patched
}

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made.\n')

  const specs = await prisma.agentTestSpec.findMany({
    where: {
      testType: { not: 'api' },
      generatedCode: { not: null }
    },
    select: { specId: true, name: true, generatedCode: true, codeStorage: true }
  })

  console.log(`Found ${specs.length} browser spec(s) with generated code.\n`)

  let updated = 0
  let skipped = 0

  for (const spec of specs) {
    if (spec.codeStorage === 'file') {
      console.log(`  SKIP  [file storage] ${spec.name} (${spec.specId})`)
      skipped++
      continue
    }

    const patched = inject(spec.generatedCode)

    if (!patched) {
      console.log(`  SKIP  [already has metrics or no page] ${spec.name}`)
      skipped++
      continue
    }

    console.log(`  PATCH ${spec.name} (${spec.specId})`)

    if (!DRY_RUN) {
      await prisma.agentTestSpec.update({
        where: { specId: spec.specId },
        data: { generatedCode: patched }
      })
    }

    updated++
  }

  console.log(`\nDone. ${updated} patched, ${skipped} skipped.`)

  if (DRY_RUN && updated > 0) {
    console.log('\nRe-run without --dry-run to apply changes.')
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
