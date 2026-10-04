// server.js - Main Express server setup
// Updated for Prisma + SQLite
const path = require('path')
const os = require('os')
const fs = require('fs')

// Load .env for development defaults (won't override existing env vars)
require('dotenv').config()

const buildInfo = (() => { try { return require('./buildinfo') } catch { return { buildTime: 'dev', buildTarget: 'dev' } } })()

// ── Desktop / packaged-app bootstrap ────────────────────────────────────────
// When running as a Tauri sidecar (or a pkg binary), we need to write the
// SQLite database and Playwright browsers to a user-writable directory, not
// next to the read-only app bundle.  Tauri passes AURORA_DATA_DIR; outside
// Tauri we derive a sensible platform default.
const isPkg = typeof process.pkg !== 'undefined'
const isDesktop = isPkg || !!process.env.AURORA_DATA_DIR

if (isDesktop) {
  const dataDir = process.env.AURORA_DATA_DIR || (
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'com.selectred.aurora')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA || os.homedir(), 'com.selectred.aurora')
        : path.join(os.homedir(), '.aurora')
  )
  fs.mkdirSync(dataDir, { recursive: true })

  // Store the resolved dir so the migration runner can find it
  process.env.AURORA_DATA_DIR = dataDir

  // Override DATABASE_URL so Prisma writes to the data dir (desktop overrides .env)
  process.env.DATABASE_URL = `file:${path.join(dataDir, 'aurora.db')}`

  // Point promptService to the writable data dir so prompts.json is persisted
  // correctly. Without this, the pkg binary would try to write to the read-only VFS.
  process.env.AURORA_CONFIG_DIR = dataDir

  console.log(`[aurora] Desktop mode: data dir = ${dataDir}`)
  console.log(`[aurora] DATABASE_URL = ${process.env.DATABASE_URL}`)

  // Playwright browsers live in the user's own data dir (no admin rights needed on
  // either OS — see AURORA_DATA_DIR resolution above) and are downloaded in-process
  // during first-run setup (services/browserSetupService.js), not bundled into the
  // installer — see the "Test Engine" setup step / Settings fallback.
  process.env.PLAYWRIGHT_BROWSERS_PATH =
    process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(dataDir, 'browsers')
  console.log(`[aurora] PLAYWRIGHT_BROWSERS_PATH = ${process.env.PLAYWRIGHT_BROWSERS_PATH}`)
}
// ────────────────────────────────────────────────────────────────────────────

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const http = require('http')

// Import Prisma client (AFTER DATABASE_URL is set correctly)
const prisma = require('./lib/prisma')

// ── First-run database migration ─────────────────────────────────────────────
// Runs any unapplied Prisma migrations against the SQLite file without needing
// the Prisma CLI binary (which isn't available inside a pkg bundle).
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'prisma', 'migrations')
  if (!fs.existsSync(migrationsDir)) return

  // Ensure Prisma's migration-tracking table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                  TEXT     NOT NULL PRIMARY KEY,
      "checksum"            TEXT     NOT NULL,
      "finished_at"         DATETIME,
      "migration_name"      TEXT     NOT NULL,
      "logs"                TEXT,
      "rolled_back_at"      DATETIME,
      "started_at"          DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER  NOT NULL DEFAULT 0
    )
  `)

  const applied = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  )
  const appliedSet = new Set(applied.map(r => r.migration_name))

  const dirs = fs.readdirSync(migrationsDir)
    .filter(d => fs.statSync(path.join(migrationsDir, d)).isDirectory())
    .sort()

  for (const dirName of dirs) {
    if (appliedSet.has(dirName)) continue
    const sqlFile = path.join(migrationsDir, dirName, 'migration.sql')
    if (!fs.existsSync(sqlFile)) continue

    console.log(`[aurora] Applying migration: ${dirName}`)
    const sql = fs.readFileSync(sqlFile, 'utf8')

    // Strip block comments and split into individual statements
    const statements = sql
      .replace(/--[^\n]*/g, '')        // strip line comments
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(s.toUpperCase()))

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt)
      } catch (e) {
        if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) throw e
      }
    }

    await prisma.$executeRawUnsafe(`
      INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES ('${Date.now()}-${Math.random().toString(36).slice(2)}', '', '${dirName}', datetime('now'), 1)
    `)
  }
}
// ────────────────────────────────────────────────────────────────────────────

const app = express()
const server = http.createServer(app)

// Initialize WebSocket streaming services (noServer mode — one upgrade router handles both)
const streamingService = require('./services/streamingService')
streamingService.initialize()
const mcpStreamingService = require('./services/mcpStreamingService')
mcpStreamingService.initialize()

server.on('upgrade', (req, socket, head) => {
  const idx = req.url.indexOf('?')
  const pathname = idx !== -1 ? req.url.slice(0, idx) : req.url
  if (pathname === '/ws/terminal') {
    streamingService.wss.handleUpgrade(req, socket, head, ws => {
      streamingService.wss.emit('connection', ws, req)
    })
  } else if (pathname === '/ws/mcp') {
    mcpStreamingService.wss.handleUpgrade(req, socket, head, ws => {
      mcpStreamingService.wss.emit('connection', ws, req)
    })
  } else {
    socket.destroy()
  }
})

const ai = require('./services/aiService')
const syntheticMonitoringService = require('./services/syntheticMonitoring')
const { pruneExpiredBundles } = require('./services/evidenceCleanupService')
const cron = require('node-cron')

// Verify database connection, run migrations, then initialise services
let dbReady = false
prisma.$connect()
  .then(async () => {
    console.log('SQLite database connected via Prisma')
    await runMigrations()
    await ai.initialize()
    syntheticMonitoringService.initializeScheduler()
    // Performance runs left "running" by a restart can't resume; mark them and start the queue.
    require('./services/k6/perfRunner').recover().catch(e => console.error('[perf] recovery failed:', e.message))
    // Daily evidence bundle retention sweep at 2:30am — prunes bundles older than
    // AppSettings.evidenceRetentionDays and nulls out dangling DB references
    cron.schedule('30 2 * * *', () => pruneExpiredBundles(prisma))
    dbReady = true
    console.log('Aurora backend ready')
  })
  .catch(err => console.error('Database connection error:', err))

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use(morgan('combined'))

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/tests', require('./routes/tests'))
app.use('/api/teams', require('./routes/teams'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/synthetics', require('./routes/synthetics'))
app.use('/api/agent-tests', require('./routes/agentTests'))
app.use('/api/mcp', require('./routes/mcp'))
app.use('/api/initiatives', require('./routes/initiatives'))
app.use('/api/features', require('./routes/features'))
app.use('/api/system', require('./routes/system'))
app.use('/api/terminal', require('./routes/terminal'))
app.use('/api/license', require('./routes/license'))
app.use('/api/data', require('./routes/dataTransfer'))
app.use('/api/bug-reports', require('./routes/bugReports'))
app.use('/api/prompts', require('./routes/prompts'))
app.use('/api/hallucinations', require('./routes/hallucinations'))
app.use('/api/agent-tests/recording', require('./routes/recording'))
app.use('/api/test-data', require('./routes/testData'))
app.use('/api/llm', require('./routes/llm'))
app.use('/api/test-cases', require('./routes/testCaseImport'))
app.use('/api/environments', require('./routes/environments'))
app.use('/api/requirements', require('./routes/requirements'))
app.use('/api/k6', require('./routes/k6'))
app.use('/api/performance', require('./routes/performance'))
app.use('/api/tracker', require('./routes/tracker'))
app.use('/api/evidence', require('./routes/evidence'))
app.use('/api/setup', require('./routes/setup'))

// One version, from package.json, so a release bump can't miss it
const APP_VERSION = (() => { try { return require('./package.json').version } catch { return 'unknown' } })()

// Health check endpoint — only returns 200 once DB is connected and migrations done
app.get('/api/health', (req, res) => {
  if (!dbReady) return res.status(503).json({ status: 'starting' })
  res.json({
    status: 'ok',
    service: 'aurora',
    version: APP_VERSION,
    database: 'sqlite',
    buildTime: buildInfo.buildTime,
    buildTarget: buildInfo.buildTarget,
    timestamp: new Date().toISOString()
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  })
})

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`WebSocket available at ws://localhost:${PORT}/ws/terminal`)
})
