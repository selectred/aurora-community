// ─────────────────────────────────────────────────────────────────────────────
// Aurora — Demo Seed
// Scenario: RetailCo Digital Platform
//   • Payments v3           — critical, 85% complete, mostly green
//   • Customer Portal Redesign — high, 62% complete, some amber
//   • API Gateway Migration  — medium, 38% complete, at-risk/red
//
// Run: cd Aurora/backend && node scripts/seed-demo.js
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../lib/prisma')
const { stringifyJson } = require('../lib/helpers')
require('dotenv').config()

const NOW     = new Date()
const daysAgo  = (n) => new Date(NOW - n * 86400000)
const hoursAgo = (n) => new Date(NOW - n * 3600000)
const future   = (n) => new Date(NOW.valueOf() + n * 86400000)

async function seed () {
  try {
    console.log('🌱  Aurora demo seed starting...\n')

    // ── Clear ─────────────────────────────────────────────────────────────────
    await prisma.syntheticResult.deleteMany({})
    await prisma.syntheticTransaction.deleteMany({})
    await prisma.testResult.deleteMany({})
    await prisma.testPackTest.deleteMany({})
    await prisma.testPack.deleteMany({})
    await prisma.agentTestSpec.deleteMany({})
    await prisma.feature.deleteMany({})
    await prisma.strategicInitiative.deleteMany({})
    await prisma.teamMember.deleteMany({})
    await prisma.team.deleteMany({})
    await prisma.aPIKey.deleteMany({})
    await prisma.agentTerminalSession.deleteMany({})
    await prisma.license.deleteMany({})
    await prisma.appSettings.deleteMany({})
    console.log('✨  Cleared existing data')

    // ── App Settings ──────────────────────────────────────────────────────────
    await prisma.appSettings.create({
      data: {
        managerName: 'Emma Clarke',
        email: 'emma.clarke@retailco.example',
        preferencesJson: stringifyJson({ theme: 'dark', notifications: { email: true, browser: true } }),
        setupCompleted: true,
        continuumEnabled: true,
        continuumUrl: 'http://localhost:3002',
        continuumApiKey: 'demo-aurora-api-key-retailco'
      }
    })

    // ── License ───────────────────────────────────────────────────────────────
    await prisma.license.create({
      data: {
        tier: 'pro',
        limitsJson: stringifyJson({ maxTeams: 10, maxMembersPerTeam: 20, maxSyntheticMonitors: 25, aiTestGeneration: true, continuumPush: true, maxTestPacks: 50 }),
        registeredName: 'RetailCo Ltd',
        registeredEmail: 'emma.clarke@retailco.example',
        isActive: true,
        activatedAt: daysAgo(90),
        expiresAt: future(275)
      }
    })
    console.log('✅  App settings + Pro licence')

    // ── Teams ─────────────────────────────────────────────────────────────────
    const checkoutTeam = await prisma.team.create({
      data: {
        name: 'Checkout Team',
        description: 'End-to-end quality for checkout, payments, and customer-facing flows',
        color: '#7367F0',
        metricsJson: stringifyJson({ passRate: 93, totalTests: 412, coveragePercent: 88 })
      }
    })

    const platformTeam = await prisma.team.create({
      data: {
        name: 'Platform Team',
        description: 'API, infrastructure, and platform services testing',
        color: '#00CFE8',
        metricsJson: stringifyJson({ passRate: 74, totalTests: 198, coveragePercent: 68 })
      }
    })

    // ── Team Members ──────────────────────────────────────────────────────────
    const emmaLead = await prisma.teamMember.create({
      data: { name: 'Emma Clarke',  email: 'emma.clarke@retailco.example',   role: 'qa_lead',     teamId: checkoutTeam.id, statsJson: stringifyJson({ testsCreated: 187, testsExecuted: 1240, bugsFound: 52 }) }
    })
    await prisma.teamMember.create({
      data: { name: 'Alex Morgan',  email: 'alex.morgan@retailco.example',   role: 'qa_engineer', teamId: checkoutTeam.id, statsJson: stringifyJson({ testsCreated: 94,  testsExecuted: 680,  bugsFound: 31 }) }
    })
    await prisma.teamMember.create({
      data: { name: 'Sophie Hill',  email: 'sophie.hill@retailco.example',   role: 'qa_engineer', teamId: checkoutTeam.id, statsJson: stringifyJson({ testsCreated: 76,  testsExecuted: 510,  bugsFound: 22 }) }
    })
    const jamesLead = await prisma.teamMember.create({
      data: { name: 'James Reid',   email: 'james.reid@retailco.example',    role: 'qa_lead',     teamId: platformTeam.id, statsJson: stringifyJson({ testsCreated: 132, testsExecuted: 890,  bugsFound: 44 }) }
    })
    await prisma.teamMember.create({
      data: { name: 'Priya Patel',  email: 'priya.patel@retailco.example',   role: 'qa_engineer', teamId: platformTeam.id, statsJson: stringifyJson({ testsCreated: 68,  testsExecuted: 445,  bugsFound: 19 }) }
    })

    await prisma.team.update({ where: { id: checkoutTeam.id }, data: { leadId: emmaLead.id } })
    await prisma.team.update({ where: { id: platformTeam.id }, data: { leadId: jamesLead.id } })
    console.log('✅  Teams + members')

    // ── Strategic Initiatives ─────────────────────────────────────────────────
    const paymentsV3 = await prisma.strategicInitiative.create({
      data: {
        name: 'Payments v3',
        description: 'Complete overhaul of the payment stack — guest checkout, saved cards, 3DS authentication, and PCI DSS compliance hardening.',
        teamId: checkoutTeam.id, assigneeId: emmaLead.id,
        progress: 85, status: 'in-progress', priority: 'critical',
        targetQuarter: 'Q3 2026', startDate: daysAgo(120), targetDate: future(105),
        milestonesJson: stringifyJson([
          { id: '1', name: 'Guest checkout live',      status: 'completed',   targetDate: daysAgo(60).toISOString(), completedDate: daysAgo(58).toISOString() },
          { id: '2', name: 'Saved payment methods',    status: 'completed',   targetDate: daysAgo(30).toISOString(), completedDate: daysAgo(27).toISOString() },
          { id: '3', name: '3DS integration',          status: 'in-progress', targetDate: future(14).toISOString() },
          { id: '4', name: 'PCI audit sign-off',       status: 'pending',     targetDate: future(45).toISOString() }
        ]),
        metricsJson: stringifyJson({ testsAutomated: 256, coverageTarget: 95, coverageCurrent: 85 }),
        tagsJson: stringifyJson(['payments', 'checkout', 'pci', 'security'])
      }
    })

    const portalRedesign = await prisma.strategicInitiative.create({
      data: {
        name: 'Customer Portal Redesign',
        description: 'Redesign of the customer self-service portal — account management, order history, and marketing preference centre.',
        teamId: checkoutTeam.id, assigneeId: emmaLead.id,
        progress: 62, status: 'on-track', priority: 'high',
        targetQuarter: 'Q3 2026', startDate: daysAgo(80), targetDate: future(98),
        milestonesJson: stringifyJson([
          { id: '1', name: 'Dashboard UX complete',   status: 'completed',   targetDate: daysAgo(45).toISOString(), completedDate: daysAgo(43).toISOString() },
          { id: '2', name: 'Order history module',    status: 'in-progress', targetDate: future(7).toISOString() },
          { id: '3', name: 'Preference centre',       status: 'pending',     targetDate: future(30).toISOString() }
        ]),
        metricsJson: stringifyJson({ testsAutomated: 148, coverageTarget: 90, coverageCurrent: 62 }),
        tagsJson: stringifyJson(['portal', 'ux', 'customer'])
      }
    })

    const apiGateway = await prisma.strategicInitiative.create({
      data: {
        name: 'API Gateway Migration',
        description: 'Migration of legacy REST endpoints to a new API gateway — auth service, product catalogue, and inventory APIs.',
        teamId: platformTeam.id, assigneeId: jamesLead.id,
        progress: 38, status: 'at-risk', priority: 'medium',
        targetQuarter: 'Q4 2026', startDate: daysAgo(55), targetDate: future(182),
        milestonesJson: stringifyJson([
          { id: '1', name: 'Gateway architecture agreed', status: 'completed',   targetDate: daysAgo(40).toISOString(), completedDate: daysAgo(38).toISOString() },
          { id: '2', name: 'Auth service migrated',       status: 'in-progress', targetDate: future(5).toISOString() },
          { id: '3', name: 'Product catalogue API',       status: 'pending',     targetDate: future(30).toISOString() },
          { id: '4', name: 'Inventory API',               status: 'pending',     targetDate: future(60).toISOString() }
        ]),
        metricsJson: stringifyJson({ testsAutomated: 64, coverageTarget: 100, coverageCurrent: 38 }),
        tagsJson: stringifyJson(['api', 'gateway', 'migration', 'auth'])
      }
    })
    console.log('✅  Strategic initiatives')

    // ── Features ──────────────────────────────────────────────────────────────
    const guestCheckout = await prisma.feature.create({ data: { name: 'Guest Checkout',            description: 'Checkout flow for unauthenticated users',           initiativeId: paymentsV3.id,    teamId: checkoutTeam.id } })
    const savedPayments = await prisma.feature.create({ data: { name: 'Saved Payment Methods',     description: 'Store and reuse card details securely via vault',     initiativeId: paymentsV3.id,    teamId: checkoutTeam.id } })
    const threeDsAuth   = await prisma.feature.create({ data: { name: '3DS Authentication',        description: '3D Secure v2 challenge flow for high-risk transactions', initiativeId: paymentsV3.id, teamId: checkoutTeam.id } })
    const acctDashboard = await prisma.feature.create({ data: { name: 'Account Dashboard',         description: 'Customer account overview and profile management',     initiativeId: portalRedesign.id, teamId: checkoutTeam.id } })
    const orderHistory  = await prisma.feature.create({ data: { name: 'Order History & Tracking',  description: 'View past orders, statuses, and tracking',             initiativeId: portalRedesign.id, teamId: checkoutTeam.id } })
    const authService   = await prisma.feature.create({ data: { name: 'Auth Service Migration',    description: 'JWT auth, refresh token rotation, rate limiting',       initiativeId: apiGateway.id,    teamId: platformTeam.id } })
    const catalogueApi  = await prisma.feature.create({ data: { name: 'Product Catalogue API',     description: 'Product listing, search, filtering, and detail endpoints', initiativeId: apiGateway.id, teamId: platformTeam.id } })
    console.log('✅  Features')

    // ── Agent Test Specs ──────────────────────────────────────────────────────
    const specDefs = [
      // ── Payments v3 / Guest Checkout ──────────────────────────────────────
      { specId: 'spec-guest-checkout-001', name: 'Guest checkout — add product to basket', type: 'functional', feature: guestCheckout, team: checkoutTeam, url: 'https://shop.retailco.example/products',
        code: `test('Guest checkout — add product to basket', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/products');\n  await expect(page.locator('[data-testid="product-grid"]')).toBeVisible();\n  await page.locator('[data-testid="product-card"]').first().click();\n  await page.locator('[data-testid="add-to-basket"]').click();\n  await expect(page.locator('[data-testid="basket-count"]')).toHaveText('1');\n});` },
      { specId: 'spec-guest-checkout-002', name: 'Guest checkout — shipping details form', type: 'functional', feature: guestCheckout, team: checkoutTeam, url: 'https://shop.retailco.example/checkout',
        code: `test('Guest checkout — shipping details form', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout');\n  await page.fill('[data-testid="email"]', 'guest@example.com');\n  await page.fill('[data-testid="first-name"]', 'Test');\n  await page.fill('[data-testid="last-name"]', 'User');\n  await page.fill('[data-testid="address"]', '123 High Street');\n  await page.fill('[data-testid="postcode"]', 'SW1A 1AA');\n  await page.click('[data-testid="continue-to-payment"]');\n  await expect(page.locator('[data-testid="payment-section"]')).toBeVisible();\n});` },
      { specId: 'spec-guest-checkout-003', name: 'Guest checkout — card payment and order placement', type: 'functional', feature: guestCheckout, team: checkoutTeam, url: 'https://shop.retailco.example/checkout/payment',
        code: `test('Guest checkout — card payment and order placement', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout/payment');\n  const frame = page.frameLocator('[data-testid="card-iframe"]');\n  await frame.locator('[name="cardnumber"]').fill('4111111111111111');\n  await frame.locator('[name="exp-date"]').fill('12/27');\n  await frame.locator('[name="cvc"]').fill('123');\n  await page.click('[data-testid="place-order"]');\n  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();\n});` },
      { specId: 'spec-guest-checkout-004', name: 'Guest checkout — order confirmation page content', type: 'functional', feature: guestCheckout, team: checkoutTeam, url: 'https://shop.retailco.example/order-confirmation',
        code: `test('Guest checkout — order confirmation page content', async ({ page }) => {\n  await expect(page.locator('[data-testid="order-number"]')).toBeVisible();\n  await expect(page.locator('[data-testid="order-summary"]')).toContainText('Order confirmed');\n  await expect(page.locator('[data-testid="estimated-delivery"]')).toBeVisible();\n});` },
      { specId: 'spec-guest-checkout-005', name: 'Guest checkout — confirmation email triggered', type: 'api', feature: guestCheckout, team: checkoutTeam, url: 'https://api.retailco.example/v2/email',
        code: `test('Guest checkout — confirmation email triggered', async ({ request }) => {\n  const res = await request.get('https://api.retailco.example/v2/email/last-sent?type=order_confirmation');\n  const data = await res.json();\n  expect(data.status).toBe('sent');\n  expect(data.recipient).toContain('@');\n});` },

      // ── Payments v3 / Saved Payment Methods ───────────────────────────────
      { specId: 'spec-saved-payments-001', name: 'Save card during checkout', type: 'functional', feature: savedPayments, team: checkoutTeam, url: 'https://shop.retailco.example/checkout/payment',
        code: `test('Save card during checkout', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout/payment');\n  await page.check('[data-testid="save-card-checkbox"]');\n  await page.click('[data-testid="place-order"]');\n  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();\n  await page.goto('https://shop.retailco.example/account/payment-methods');\n  await expect(page.locator('[data-testid="saved-card"]')).toHaveCount(1);\n});` },
      { specId: 'spec-saved-payments-002', name: 'Use saved card to complete purchase', type: 'functional', feature: savedPayments, team: checkoutTeam, url: 'https://shop.retailco.example/checkout',
        code: `test('Use saved card to complete purchase', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout');\n  await page.click('[data-testid="use-saved-card"]');\n  await expect(page.locator('[data-testid="saved-card-last4"]')).toBeVisible();\n  await page.click('[data-testid="place-order"]');\n  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();\n});` },
      { specId: 'spec-saved-payments-003', name: 'Remove saved payment method', type: 'functional', feature: savedPayments, team: checkoutTeam, url: 'https://shop.retailco.example/account/payment-methods',
        code: `test('Remove saved payment method', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/payment-methods');\n  await page.click('[data-testid="remove-card-btn"]');\n  await page.click('[data-testid="confirm-remove"]');\n  await expect(page.locator('[data-testid="saved-card"]')).toHaveCount(0);\n});` },
      { specId: 'spec-saved-payments-004', name: 'Saved card PAN masking — last 4 digits only', type: 'functional', feature: savedPayments, team: checkoutTeam, url: 'https://shop.retailco.example/account/payment-methods',
        code: `test('Saved card PAN masking — last 4 digits only', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/payment-methods');\n  const cardText = await page.locator('[data-testid="card-number-display"]').textContent();\n  expect(cardText).toMatch(/\\*{12}\\d{4}/);\n  expect(cardText).not.toMatch(/\\d{16}/);\n});` },

      // ── Payments v3 / 3DS Authentication ──────────────────────────────────
      { specId: 'spec-3ds-auth-001', name: '3DS challenge triggered for high-risk card', type: 'functional', feature: threeDsAuth, team: checkoutTeam, url: 'https://shop.retailco.example/checkout/payment',
        code: `test('3DS challenge triggered for high-risk card', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout/payment');\n  const frame = page.frameLocator('[data-testid="card-iframe"]');\n  await frame.locator('[name="cardnumber"]').fill('4000000000003220');\n  await frame.locator('[name="exp-date"]').fill('12/27');\n  await frame.locator('[name="cvc"]').fill('123');\n  await page.click('[data-testid="place-order"]');\n  await expect(page.locator('[data-testid="3ds-challenge"]')).toBeVisible();\n});` },
      { specId: 'spec-3ds-auth-002', name: '3DS passes and purchase completes', type: 'functional', feature: threeDsAuth, team: checkoutTeam, url: 'https://shop.retailco.example/checkout/payment',
        code: `test('3DS passes and purchase completes', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout/payment');\n  const frame = page.frameLocator('[data-testid="card-iframe"]');\n  await frame.locator('[name="cardnumber"]').fill('4000000000003220');\n  await page.click('[data-testid="place-order"]');\n  const challengeFrame = page.frameLocator('[data-testid="3ds-challenge"] iframe');\n  await challengeFrame.locator('#test-source-authorize-3ds').click();\n  await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible({ timeout: 15000 });\n});` },
      { specId: 'spec-3ds-auth-003', name: '3DS failure message shown gracefully', type: 'functional', feature: threeDsAuth, team: checkoutTeam, url: 'https://shop.retailco.example/checkout/payment',
        code: `test('3DS failure message shown gracefully', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/checkout/payment');\n  const frame = page.frameLocator('[data-testid="card-iframe"]');\n  await frame.locator('[name="cardnumber"]').fill('4000008400001629');\n  await page.click('[data-testid="place-order"]');\n  await expect(page.locator('[data-testid="payment-error"]')).toContainText('Authentication failed');\n  await expect(page.locator('[data-testid="try-another-card"]')).toBeVisible();\n});` },

      // ── Customer Portal / Account Dashboard ───────────────────────────────
      { specId: 'spec-acct-dashboard-001', name: 'Account dashboard loads after login', type: 'functional', feature: acctDashboard, team: checkoutTeam, url: 'https://shop.retailco.example/account',
        code: `test('Account dashboard loads after login', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/login');\n  await page.fill('[data-testid="email"]', 'demo@retailco.example');\n  await page.fill('[data-testid="password"]', 'DemoPass123!');\n  await page.click('[data-testid="login-btn"]');\n  await expect(page.locator('[data-testid="account-dashboard"]')).toBeVisible();\n  await expect(page.locator('[data-testid="welcome-name"]')).toContainText('Welcome');\n});` },
      { specId: 'spec-acct-dashboard-002', name: 'Account details display name and email', type: 'functional', feature: acctDashboard, team: checkoutTeam, url: 'https://shop.retailco.example/account',
        code: `test('Account details display name and email', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account');\n  await expect(page.locator('[data-testid="account-email"]')).toBeVisible();\n  await expect(page.locator('[data-testid="account-name"]')).toBeVisible();\n  await expect(page.locator('[data-testid="member-since"]')).toBeVisible();\n});` },
      { specId: 'spec-acct-dashboard-003', name: 'Profile edit saves and persists', type: 'functional', feature: acctDashboard, team: checkoutTeam, url: 'https://shop.retailco.example/account/profile',
        code: `test('Profile edit saves and persists', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/profile');\n  await page.fill('[data-testid="display-name"]', 'Updated Demo Name');\n  await page.click('[data-testid="save-profile"]');\n  await expect(page.locator('[data-testid="success-toast"]')).toContainText('Profile updated');\n  await page.reload();\n  await expect(page.locator('[data-testid="display-name"]')).toHaveValue('Updated Demo Name');\n});` },
      { specId: 'spec-acct-dashboard-004', name: 'Marketing email preference toggle persists', type: 'functional', feature: acctDashboard, team: checkoutTeam, url: 'https://shop.retailco.example/account/preferences',
        code: `test('Marketing email preference toggle persists', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/preferences');\n  const toggle = page.locator('[data-testid="marketing-email-toggle"]');\n  const before = await toggle.isChecked();\n  await toggle.click();\n  await page.click('[data-testid="save-preferences"]');\n  await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();\n  await page.reload();\n  expect(await toggle.isChecked()).toBe(!before);\n});` },

      // ── Customer Portal / Order History ───────────────────────────────────
      { specId: 'spec-order-history-001', name: 'Order list shows recent orders', type: 'functional', feature: orderHistory, team: checkoutTeam, url: 'https://shop.retailco.example/account/orders',
        code: `test('Order list shows recent orders', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/orders');\n  await expect(page.locator('[data-testid="order-list"]')).toBeVisible();\n  const rows = page.locator('[data-testid="order-row"]');\n  await expect(rows).not.toHaveCount(0);\n  await expect(rows.first().locator('[data-testid="order-date"]')).toBeVisible();\n});` },
      { specId: 'spec-order-history-002', name: 'Order detail shows line items and total', type: 'functional', feature: orderHistory, team: checkoutTeam, url: 'https://shop.retailco.example/account/orders',
        code: `test('Order detail shows line items and total', async ({ page }) => {\n  await page.goto('https://shop.retailco.example/account/orders');\n  await page.locator('[data-testid="order-row"]').first().click();\n  await expect(page.locator('[data-testid="order-detail"]')).toBeVisible();\n  await expect(page.locator('[data-testid="line-item"]')).not.toHaveCount(0);\n  await expect(page.locator('[data-testid="order-total"]')).toBeVisible();\n});` },
      { specId: 'spec-order-history-003', name: 'Order tracking link opens in new tab', type: 'functional', feature: orderHistory, team: checkoutTeam, url: 'https://shop.retailco.example/account/orders',
        code: `test('Order tracking link opens in new tab', async ({ page, context }) => {\n  await page.goto('https://shop.retailco.example/account/orders');\n  await page.locator('[data-testid="order-row"]').first().click();\n  const [newPage] = await Promise.all([\n    context.waitForEvent('page'),\n    page.click('[data-testid="track-order-btn"]')\n  ]);\n  await newPage.waitForLoadState();\n  expect(newPage.url()).toContain('tracking');\n});` },

      // ── API Gateway / Auth Service ─────────────────────────────────────────
      { specId: 'spec-auth-svc-001', name: 'Login returns valid JWT and refresh token', type: 'api', feature: authService, team: platformTeam, url: 'https://api.retailco.example/v2/auth',
        code: `test('Login returns valid JWT and refresh token', async ({ request }) => {\n  const res = await request.post('https://api.retailco.example/v2/auth/login', {\n    data: { email: 'demo@retailco.example', password: 'DemoPass123!' }\n  });\n  expect(res.status()).toBe(200);\n  const body = await res.json();\n  expect(body.accessToken).toBeTruthy();\n  expect(body.refreshToken).toBeTruthy();\n  expect(body.expiresIn).toBe(3600);\n});` },
      { specId: 'spec-auth-svc-002', name: 'Refresh token rotates on use', type: 'api', feature: authService, team: platformTeam, url: 'https://api.retailco.example/v2/auth',
        code: `test('Refresh token rotates on use', async ({ request }) => {\n  const loginRes = await request.post('https://api.retailco.example/v2/auth/login', { data: { email: 'demo@retailco.example', password: 'DemoPass123!' } });\n  const { refreshToken } = await loginRes.json();\n  const refreshRes = await request.post('https://api.retailco.example/v2/auth/refresh', { data: { refreshToken } });\n  expect(refreshRes.status()).toBe(200);\n  const body = await refreshRes.json();\n  expect(body.refreshToken).not.toBe(refreshToken);\n});` },
      { specId: 'spec-auth-svc-003', name: 'Expired token rejected with 401', type: 'api', feature: authService, team: platformTeam, url: 'https://api.retailco.example/v2/auth',
        code: `test('Expired token rejected with 401', async ({ request }) => {\n  const expired = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid';\n  const res = await request.get('https://api.retailco.example/v2/users/me', { headers: { Authorization: \`Bearer \${expired}\` } });\n  expect(res.status()).toBe(401);\n  const body = await res.json();\n  expect(body.error).toContain('expired');\n});` },
      { specId: 'spec-auth-svc-004', name: 'Rate limiting triggers after 5 failed attempts', type: 'api', feature: authService, team: platformTeam, url: 'https://api.retailco.example/v2/auth',
        code: `test('Rate limiting triggers after 5 failed attempts', async ({ request }) => {\n  const attempts = Array.from({ length: 6 }, () =>\n    request.post('https://api.retailco.example/v2/auth/login', { data: { email: 'demo@retailco.example', password: 'WRONG' } })\n  );\n  const responses = await Promise.all(attempts);\n  expect(responses.at(-1).status()).toBe(429);\n});` },
      { specId: 'spec-auth-svc-005', name: 'Logout invalidates access token', type: 'api', feature: authService, team: platformTeam, url: 'https://api.retailco.example/v2/auth',
        code: `test('Logout invalidates access token', async ({ request }) => {\n  const loginRes = await request.post('https://api.retailco.example/v2/auth/login', { data: { email: 'demo@retailco.example', password: 'DemoPass123!' } });\n  const { accessToken } = await loginRes.json();\n  await request.post('https://api.retailco.example/v2/auth/logout', { headers: { Authorization: \`Bearer \${accessToken}\` } });\n  const meRes = await request.get('https://api.retailco.example/v2/users/me', { headers: { Authorization: \`Bearer \${accessToken}\` } });\n  expect(meRes.status()).toBe(401);\n});` },

      // ── API Gateway / Product Catalogue ───────────────────────────────────
      { specId: 'spec-catalogue-api-001', name: 'Product list returns paginated results', type: 'api', feature: catalogueApi, team: platformTeam, url: 'https://api.retailco.example/v2/products',
        code: `test('Product list returns paginated results', async ({ request }) => {\n  const res = await request.get('https://api.retailco.example/v2/products?page=1&limit=20');\n  expect(res.status()).toBe(200);\n  const body = await res.json();\n  expect(body.data).toHaveLength(20);\n  expect(body.pagination.total).toBeGreaterThan(20);\n});` },
      { specId: 'spec-catalogue-api-002', name: 'Product detail returns correct schema', type: 'api', feature: catalogueApi, team: platformTeam, url: 'https://api.retailco.example/v2/products',
        code: `test('Product detail returns correct schema', async ({ request }) => {\n  const res = await request.get('https://api.retailco.example/v2/products/PRD-001');\n  expect(res.status()).toBe(200);\n  const product = await res.json();\n  expect(product).toMatchObject({ id: expect.any(String), name: expect.any(String), price: expect.any(Number), sku: expect.any(String) });\n});` },
      { specId: 'spec-catalogue-api-003', name: 'Category filter returns matching products only', type: 'api', feature: catalogueApi, team: platformTeam, url: 'https://api.retailco.example/v2/products',
        code: `test('Category filter returns matching products only', async ({ request }) => {\n  const res = await request.get('https://api.retailco.example/v2/products?category=electronics');\n  expect(res.status()).toBe(200);\n  const body = await res.json();\n  expect(body.data.every(p => p.category === 'electronics')).toBe(true);\n});` },
    ]

    const specMap = {}
    for (const def of specDefs) {
      const spec = await prisma.agentTestSpec.create({
        data: {
          specId:        def.specId,
          name:          def.name,
          url:           def.url,
          testType:      def.type,
          status:        'ready',
          isSynthetic:   false,
          markdownSpec:  `## ${def.name}\n\nVerify that ${def.name.toLowerCase()} works correctly.\n\n**URL:** ${def.url}\n**Type:** ${def.type}`,
          generatedCode: def.code,
          codeStorage:   'inline',
          enabled:       true,
          teamId:        def.feature.teamId,
          tagsJson:      stringifyJson([def.feature.name.toLowerCase().replace(/[^a-z0-9]/g, '-')])
        }
      })
      specMap[def.specId] = spec
    }
    console.log(`✅  ${specDefs.length} test specs`)

    // ── Test Packs ────────────────────────────────────────────────────────────
    const packs = [
      { name: 'Guest Checkout — Full Flow',     desc: 'End-to-end guest checkout from basket to confirmation', team: checkoutTeam, initiative: paymentsV3,    feature: guestCheckout, specs: ['spec-guest-checkout-001','spec-guest-checkout-002','spec-guest-checkout-003','spec-guest-checkout-004','spec-guest-checkout-005'] },
      { name: 'Saved Payment Methods',           desc: 'Save, use, remove, and PAN-mask stored cards',          team: checkoutTeam, initiative: paymentsV3,    feature: savedPayments, specs: ['spec-saved-payments-001','spec-saved-payments-002','spec-saved-payments-003','spec-saved-payments-004'] },
      { name: '3DS Authentication Flow',         desc: '3D Secure v2 challenge — pass, fail, and error paths',  team: checkoutTeam, initiative: paymentsV3,    feature: threeDsAuth,   specs: ['spec-3ds-auth-001','spec-3ds-auth-002','spec-3ds-auth-003'] },
      { name: 'Account Dashboard',               desc: 'Login, dashboard load, profile, and preferences',        team: checkoutTeam, initiative: portalRedesign, feature: acctDashboard, specs: ['spec-acct-dashboard-001','spec-acct-dashboard-002','spec-acct-dashboard-003','spec-acct-dashboard-004'] },
      { name: 'Order History & Tracking',        desc: 'Order list, order detail, and tracking navigation',      team: checkoutTeam, initiative: portalRedesign, feature: orderHistory,  specs: ['spec-order-history-001','spec-order-history-002','spec-order-history-003'] },
      { name: 'Auth Service — API Suite',        desc: 'JWT login, token rotation, expiry, rate limit, logout',  team: platformTeam, initiative: apiGateway,    feature: authService,   specs: ['spec-auth-svc-001','spec-auth-svc-002','spec-auth-svc-003','spec-auth-svc-004','spec-auth-svc-005'] },
      { name: 'Product Catalogue API',           desc: 'Pagination, schema validation, and category filtering',  team: platformTeam, initiative: apiGateway,    feature: catalogueApi,  specs: ['spec-catalogue-api-001','spec-catalogue-api-002','spec-catalogue-api-003'] },
    ]

    for (const p of packs) {
      const pack = await prisma.testPack.create({
        data: { name: p.name, description: p.desc, isActive: true, teamId: p.team.id, initiativeId: p.initiative.id, featureId: p.feature.id, lastRunAt: daysAgo(1) }
      })
      for (let i = 0; i < p.specs.length; i++) {
        await prisma.testPackTest.create({ data: { testPackId: pack.id, specId: p.specs[i], sortOrder: i + 1 } })
      }
    }
    console.log('✅  Test packs')

    // ── Test Results — 7 days ─────────────────────────────────────────────────
    // Payments v3: 95% pass   |   Portal: 88% pass   |   API Gateway: 72% pass
    const resultGroups = [
      { specIds: ['spec-guest-checkout-001','spec-guest-checkout-002','spec-guest-checkout-003','spec-guest-checkout-004','spec-guest-checkout-005','spec-saved-payments-001','spec-saved-payments-002','spec-saved-payments-003','spec-saved-payments-004','spec-3ds-auth-001','spec-3ds-auth-002','spec-3ds-auth-003'], passRate: 0.95, team: checkoutTeam },
      { specIds: ['spec-acct-dashboard-001','spec-acct-dashboard-002','spec-acct-dashboard-003','spec-acct-dashboard-004','spec-order-history-001','spec-order-history-002','spec-order-history-003'], passRate: 0.88, team: checkoutTeam },
      { specIds: ['spec-auth-svc-001','spec-auth-svc-002','spec-auth-svc-003','spec-auth-svc-004','spec-auth-svc-005','spec-catalogue-api-001','spec-catalogue-api-002','spec-catalogue-api-003'], passRate: 0.72, team: platformTeam },
    ]

    let resultCount = 0
    for (const grp of resultGroups) {
      for (const sid of grp.specIds) {
        const spec = specMap[sid]
        for (let day = 6; day >= 0; day--) {
          const rnd    = Math.random()
          const status = rnd < grp.passRate ? 'passed' : rnd < grp.passRate + 0.08 ? 'flaky' : 'failed'
          await prisma.testResult.create({
            data: {
              testCaseId:   `${sid}-d${day}`,
              testName:     spec.name,
              testType:     spec.testType,
              suite:        spec.name.split('—')[0].trim(),
              status,
              duration:     Math.floor(Math.random() * 4000) + 600,
              browser:      'chromium',
              environment:  'staging',
              teamId:       grp.team.id,
              specId:       spec.id,
              errorMessage: status === 'failed' ? 'Assertion failed: expected element to be visible' : null,
              executedAt:   daysAgo(day)
            }
          })
          resultCount++
        }
      }
    }
    console.log(`✅  ${resultCount} test results`)

    // ── Synthetic Monitors ────────────────────────────────────────────────────
    const monitors = [
      { id: 'mon-checkout-home',  name: 'Checkout Homepage',    url: 'https://shop.retailco.example',              schedule: '*/15 * * * *', uptime: 0.998 },
      { id: 'mon-checkout-flow',  name: 'Checkout Flow',        url: 'https://shop.retailco.example/checkout',     schedule: '*/30 * * * *', uptime: 0.992 },
      { id: 'mon-account-portal', name: 'Customer Portal',      url: 'https://shop.retailco.example/account',      schedule: '*/30 * * * *', uptime: 0.985 },
      { id: 'mon-api-health',     name: 'API Gateway Health',   url: 'https://api.retailco.example/v2/health',    schedule: '*/5 * * * *',  uptime: 0.971 },
    ]

    for (const mon of monitors) {
      await prisma.syntheticTransaction.create({
        data: { transactionId: mon.id, name: mon.name, url: mon.url, scriptPath: `scripts/synthetic/${mon.id}.js`, enabled: true, schedule: mon.schedule, timeout: 30000, tagsJson: stringifyJson(['synthetic', 'monitoring']) }
      })
      for (let h = 0; h < 168; h++) {
        const ok = Math.random() < mon.uptime
        await prisma.syntheticResult.create({
          data: {
            transaction:     { connect: { transactionId: mon.id } },
            transactionName: mon.name,
            url:             mon.url,
            status:          ok ? 'passed' : 'failed',
            duration:        ok ? Math.floor(Math.random() * 1800) + 350 : 0,
            pageMetricsJson: stringifyJson([{ pageName: mon.name, url: mon.url, httpStatusCode: ok ? 200 : 503, fcp: ok ? Math.floor(Math.random() * 800) + 500 : null, loadTime: ok ? Math.floor(Math.random() * 1800) + 350 : null }]),
            errorMessage:    ok ? null : 'Connection timeout exceeded',
            browser:         'chromium',
            viewportJson:    stringifyJson({ width: 1920, height: 1080 }),
            scheduledRun:    true,
            cronSchedule:    mon.schedule,
            executedAt:      hoursAgo(h)
          }
        })
      }
    }
    console.log('✅  Synthetic monitors + 7 days of results')

    console.log('\n🎉  Aurora demo seed complete!')
    console.log('   Manager  : Emma Clarke — emma.clarke@retailco.example')
    console.log('   Initiatives:')
    console.log('     ✅  Payments v3 (85% · critical · in-progress)')
    console.log('     🟡  Customer Portal Redesign (62% · high · on-track)')
    console.log('     🔴  API Gateway Migration (38% · medium · at-risk)')

  } catch (err) {
    console.error('❌  Seed error:', err)
    throw err
  } finally {
    await prisma.$disconnect()
    process.exit(0)
  }
}

seed()
