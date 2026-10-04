const prisma = require('../lib/prisma')
const { stringifyJson } = require('../lib/helpers')
require('dotenv').config()

async function seed() {
  try {
    console.log('🌱 Starting database seed...')

    // Clear existing data (in correct order due to foreign keys)
    await prisma.syntheticResult.deleteMany({})
    await prisma.syntheticTransaction.deleteMany({})
    await prisma.testResult.deleteMany({})
    await prisma.agentTestSpec.deleteMany({})
    await prisma.testPackTest.deleteMany({})
    await prisma.testPack.deleteMany({})
    await prisma.strategicInitiative.deleteMany({})
    await prisma.teamMember.deleteMany({})
    await prisma.team.deleteMany({})
    await prisma.aPIKey.deleteMany({})
    await prisma.agentTerminalSession.deleteMany({})
    await prisma.license.deleteMany({})
    await prisma.appSettings.deleteMany({})
    console.log('✨ Cleared existing data')

    // Create AppSettings (singleton)
    const appSettings = await prisma.appSettings.create({
      data: {
        managerName: 'Sarah Chen',
        email: 'sarah.chen@testtracker.com',
        preferencesJson: stringifyJson({
          theme: 'dark',
          notifications: { email: true, browser: true }
        }),
        setupCompleted: true
      }
    })
    console.log('✅ Created app settings')

    // Create License (free tier)
    await prisma.license.create({
      data: {
        tier: 'free',
        limitsJson: stringifyJson({
          maxTeams: 2,
          maxMembersPerTeam: 5,
          maxSyntheticMonitors: 3,
          aiTestGeneration: true,
          continuumPush: false
        })
      }
    })
    console.log('✅ Created license')

    // Create Teams
    const frontendTeam = await prisma.team.create({
      data: {
        name: 'Frontend Team',
        description: 'Responsible for UI testing and frontend quality',
        color: '#7367F0',
        metricsJson: stringifyJson({
          passRate: 92,
          totalTests: 342,
          coveragePercent: 85
        })
      }
    })

    const backendTeam = await prisma.team.create({
      data: {
        name: 'Backend Team',
        description: 'Backend API and service testing',
        color: '#28C76F',
        metricsJson: stringifyJson({
          passRate: 96,
          totalTests: 256,
          coveragePercent: 91
        })
      }
    })

    const mobileTeam = await prisma.team.create({
      data: {
        name: 'Mobile Team',
        description: 'Mobile app testing for iOS and Android',
        color: '#FF9F43',
        metricsJson: stringifyJson({
          passRate: 88,
          totalTests: 128,
          coveragePercent: 72
        })
      }
    })
    console.log('✅ Created teams')

    // Create Team Members
    const sarahLead = await prisma.teamMember.create({
      data: {
        name: 'Sarah Chen',
        email: 'sarah.chen@testtracker.com',
        role: 'qa_lead',
        teamId: frontendTeam.id,
        statsJson: stringifyJson({
          testsCreated: 125,
          testsExecuted: 890,
          bugsFound: 34
        })
      }
    })

    await prisma.teamMember.create({
      data: {
        name: 'John Doe',
        email: 'john.doe@testtracker.com',
        role: 'qa_engineer',
        teamId: frontendTeam.id,
        statsJson: stringifyJson({
          testsCreated: 78,
          testsExecuted: 562,
          bugsFound: 21
        })
      }
    })

    const janeLead = await prisma.teamMember.create({
      data: {
        name: 'Jane Smith',
        email: 'jane.smith@testtracker.com',
        role: 'qa_lead',
        teamId: backendTeam.id,
        statsJson: stringifyJson({
          testsCreated: 156,
          testsExecuted: 723,
          bugsFound: 45
        })
      }
    })

    const bobLead = await prisma.teamMember.create({
      data: {
        name: 'Bob Johnson',
        email: 'bob.johnson@testtracker.com',
        role: 'qa_lead',
        teamId: mobileTeam.id,
        statsJson: stringifyJson({
          testsCreated: 89,
          testsExecuted: 445,
          bugsFound: 28
        })
      }
    })
    console.log('✅ Created team members')

    // Update teams with leads
    await prisma.team.update({
      where: { id: frontendTeam.id },
      data: { leadId: sarahLead.id }
    })
    await prisma.team.update({
      where: { id: backendTeam.id },
      data: { leadId: janeLead.id }
    })
    await prisma.team.update({
      where: { id: mobileTeam.id },
      data: { leadId: bobLead.id }
    })

    // Create Strategic Initiatives
    const initiatives = [
      {
        name: 'Automated API Testing',
        description: 'Implement comprehensive automated API testing across all microservices with 95% endpoint coverage',
        teamId: backendTeam.id,
        progress: 87,
        status: 'in-progress',
        priority: 'high',
        targetQuarter: 'Q1 2025',
        startDate: new Date('2024-06-01'),
        targetDate: new Date('2025-03-31'),
        assigneeId: janeLead.id,
        milestonesJson: stringifyJson([
          { id: '1', name: 'Framework Selection', status: 'completed', targetDate: '2024-07-01', completedDate: '2024-06-28' },
          { id: '2', name: 'Auth Service Coverage', status: 'completed', targetDate: '2024-09-01', completedDate: '2024-08-25' },
          { id: '3', name: 'Payment Service Coverage', status: 'in-progress', targetDate: '2024-12-01' },
          { id: '4', name: 'Full Integration Suite', status: 'pending', targetDate: '2025-03-01' }
        ]),
        metricsJson: stringifyJson({
          testsAutomated: 342,
          coverageTarget: 95,
          coverageCurrent: 87
        }),
        tagsJson: stringifyJson(['automation', 'api', 'backend'])
      },
      {
        name: 'Test Coverage to 95%',
        description: 'Increase overall test coverage across all codebases to achieve 95% coverage target',
        teamId: frontendTeam.id,
        progress: 82,
        status: 'on-track',
        priority: 'critical',
        targetQuarter: 'Q1 2025',
        startDate: new Date('2024-04-01'),
        targetDate: new Date('2025-03-31'),
        assigneeId: sarahLead.id,
        milestonesJson: stringifyJson([
          { id: '1', name: 'Coverage Audit', status: 'completed', targetDate: '2024-05-01', completedDate: '2024-04-28' },
          { id: '2', name: 'Frontend Coverage 90%', status: 'completed', targetDate: '2024-08-01', completedDate: '2024-07-25' },
          { id: '3', name: 'Backend Coverage 90%', status: 'completed', targetDate: '2024-10-01', completedDate: '2024-09-28' },
          { id: '4', name: 'Full Suite 95%', status: 'in-progress', targetDate: '2025-03-01' }
        ]),
        metricsJson: stringifyJson({
          testsAutomated: 892,
          coverageTarget: 95,
          coverageCurrent: 82
        }),
        tagsJson: stringifyJson(['coverage', 'quality', 'testing'])
      },
      {
        name: 'Mobile Test Automation',
        description: 'Implement cross-platform mobile test automation for iOS and Android applications',
        teamId: mobileTeam.id,
        progress: 45,
        status: 'in-progress',
        priority: 'medium',
        targetQuarter: 'Q2 2025',
        startDate: new Date('2024-09-01'),
        targetDate: new Date('2025-06-30'),
        assigneeId: bobLead.id,
        milestonesJson: stringifyJson([
          { id: '1', name: 'Framework Evaluation', status: 'completed', targetDate: '2024-10-01', completedDate: '2024-09-28' },
          { id: '2', name: 'iOS Test Suite', status: 'in-progress', targetDate: '2025-01-15' },
          { id: '3', name: 'Android Test Suite', status: 'pending', targetDate: '2025-04-01' },
          { id: '4', name: 'Cross-platform Integration', status: 'pending', targetDate: '2025-06-01' }
        ]),
        metricsJson: stringifyJson({
          testsAutomated: 89,
          coverageTarget: 85,
          coverageCurrent: 45
        }),
        tagsJson: stringifyJson(['mobile', 'ios', 'android', 'appium'])
      }
    ]

    for (const initiative of initiatives) {
      await prisma.strategicInitiative.create({ data: initiative })
    }
    console.log('✅ Created strategic initiatives')

    // Create Functional Test Results
    const testCases = [
      { id: 'TC_LOGIN_001', name: 'User login with valid credentials', suite: 'Login' },
      { id: 'TC_LOGIN_002', name: 'Login with invalid password', suite: 'Login' },
      { id: 'TC_CHECKOUT_001', name: 'Add items to cart', suite: 'Checkout' },
      { id: 'TC_CHECKOUT_002', name: 'Process payment successfully', suite: 'Checkout' },
      { id: 'TC_CHECKOUT_003', name: 'Payment timeout handling', suite: 'Checkout' },
      { id: 'TC_PROFILE_001', name: 'Update user profile', suite: 'Profile' },
      { id: 'TC_SEARCH_001', name: 'Search returns results', suite: 'Search' },
      { id: 'TC_UPLOAD_001', name: 'Image upload timeout', suite: 'Upload' }
    ]

    const teams = [frontendTeam, backendTeam, mobileTeam]
    const browsers = ['Chrome', 'Firefox', 'Safari']
    const tools = ['playwright']

    for (let i = 0; i < 100; i++) {
      const testCase = testCases[Math.floor(Math.random() * testCases.length)]
      const daysAgo = Math.floor(Math.random() * 7)
      const status = Math.random() > 0.15 ? 'passed' : Math.random() > 0.5 ? 'failed' : 'flaky'

      await prisma.testResult.create({
        data: {
          testCaseId: testCase.id,
          testName: testCase.name,
          testType: 'functional',
          suite: testCase.suite,
          status,
          duration: Math.floor(Math.random() * 5000) + 500,
          browser: browsers[Math.floor(Math.random() * 3)],
          environment: 'staging',
          teamId: teams[Math.floor(Math.random() * 3)].id,
          scriptLocation: `src/tests/${testCase.suite.toLowerCase()}`,
          retries: status === 'flaky' ? Math.floor(Math.random() * 3) : 0,
          metadataJson: stringifyJson({
            tool: tools[Math.floor(Math.random() * 3)],
            coverage: Math.floor(Math.random() * 20) + 70
          }),
          executedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          errorMessage: status === 'failed' ? 'Element not found' : null
        }
      })
    }
    console.log('✅ Created functional test results')

    // Create Synthetic Transactions
    const syntheticTransactions = [
      {
        transactionId: 'checkout-homepage',
        name: 'Checkout homepage',
        description: 'Example: checkout homepage availability and performance',
        url: 'https://shop.retailco.example',
        scriptPath: 'tests/synthetic/transactions/checkout-homepage.js',
        enabled: false,
        schedule: '*/30 * * * *',
        timeout: 60000,
        tagsJson: stringifyJson(['example'])
      },
      {
        transactionId: 'customer-portal',
        name: 'Customer portal',
        description: 'Example: customer portal availability and performance',
        url: 'https://shop.retailco.example/account',
        scriptPath: 'tests/synthetic/transactions/customer-portal.js',
        enabled: false,
        schedule: '*/30 * * * *',
        timeout: 60000,
        tagsJson: stringifyJson(['example'])
      },
      {
        transactionId: 'api-gateway-health',
        name: 'API gateway health',
        description: 'Example: API gateway health check',
        url: 'https://api.retailco.example/v2/health',
        scriptPath: 'tests/synthetic/transactions/api-gateway-health.js',
        enabled: false,
        schedule: '*/30 * * * *',
        timeout: 60000,
        tagsJson: stringifyJson(['example'])
      }
    ]

    for (const tx of syntheticTransactions) {
      await prisma.syntheticTransaction.create({ data: tx })
    }
    console.log('✅ Created synthetic transaction definitions')

    // Create Synthetic Results
    const transactions = [
      { id: 'checkout-homepage', name: 'Checkout homepage', url: 'https://shop.retailco.example' },
      { id: 'customer-portal', name: 'Customer portal', url: 'https://shop.retailco.example/account' },
      { id: 'api-gateway-health', name: 'API gateway health', url: 'https://api.retailco.example/v2/health' }
    ]

    let resultCount = 0
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour += 1) {
        for (const transaction of transactions) {
          const hoursAgo = day * 24 + hour
          const status = Math.random() > 0.95 ? 'failed' : 'passed'
          const loadTime = Math.floor(Math.random() * 2000) + 500

          await prisma.syntheticResult.create({
            data: {
              transactionId: transaction.id,
              transactionName: transaction.name,
              url: transaction.url,
              description: `Automated monitoring of ${transaction.name}`,
              status,
              duration: loadTime + Math.floor(Math.random() * 500),
              pageMetricsJson: stringifyJson([{
                pageName: transaction.name,
                url: transaction.url,
                httpStatusCode: status === 'passed' ? 200 : 500,
                fcp: status === 'passed' ? Math.floor(Math.random() * 1000) + 500 : null,
                tti: status === 'passed' ? Math.floor(Math.random() * 2000) + 1000 : null,
                loadTime,
                domContentLoaded: Math.floor(Math.random() * 1500) + 400
              }]),
              errorMessage: status === 'failed' ? 'Navigation timeout exceeded' : null,
              browser: 'chromium',
              viewportJson: stringifyJson({ width: 1920, height: 1080 }),
              scheduledRun: true,
              cronSchedule: '*/30 * * * *',
              executedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
            }
          })
          resultCount++
        }
      }
    }
    console.log(`✅ Created ${resultCount} synthetic test results`)

    console.log('🎉 Database seeded successfully!')
    console.log('')
    console.log('📝 App is ready to use (no login required - desktop mode)')

  } catch (error) {
    console.error('❌ Error seeding database:', error)
  } finally {
    await prisma.$disconnect()
    console.log('👋 Database connection closed')
    process.exit(0)
  }
}

seed()
