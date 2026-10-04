// ============================================
// routes/system.js - System metrics and Docker stats
// ============================================
const express = require('express')
const router = express.Router()
const { authMiddleware, adminMiddleware } = require('../middleware/auth')
const os = require('os')

// Try to load dockerode if available
let Docker = null
try {
  Docker = require('dockerode')
} catch (e) {
  console.log('Dockerode not available, Docker stats will be limited')
}

// Get Docker container stats
router.get('/docker-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const containers = []

    if (Docker) {
      const docker = new Docker({ socketPath: '/var/run/docker.sock' })

      try {
        const containerList = await docker.listContainers({ all: true })

        // Filter to only Aurora containers
        const auroraContainers = containerList.filter(c => {
          const name = c.Names[0]?.replace('/', '') || ''
          return name.startsWith('aurora-')
        })

        for (const containerInfo of auroraContainers) {
          const container = docker.getContainer(containerInfo.Id)

          try {
            // Get container stats (one-shot, not streaming)
            const stats = await new Promise((resolve, reject) => {
              container.stats({ stream: false }, (err, data) => {
                if (err) reject(err)
                else resolve(data)
              })
            })

            // Calculate memory usage
            const memUsage = stats.memory_stats?.usage || 0
            const memLimit = stats.memory_stats?.limit || 1
            const memPercent = ((memUsage / memLimit) * 100).toFixed(2)

            // Calculate CPU usage
            const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
              (stats.precpu_stats?.cpu_usage?.total_usage || 0)
            const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
              (stats.precpu_stats?.system_cpu_usage || 0)
            const cpuCount = stats.cpu_stats?.online_cpus || 1
            const cpuPercent = systemDelta > 0
              ? ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2)
              : '0.00'

            // Get container inspect for more details
            const inspect = await container.inspect()

            containers.push({
              id: containerInfo.Id.substring(0, 12),
              name: containerInfo.Names[0]?.replace('/', '') || 'unknown',
              image: containerInfo.Image,
              status: containerInfo.State,
              state: containerInfo.Status,
              created: containerInfo.Created,
              memory: {
                usage: memUsage,
                limit: memLimit,
                percent: parseFloat(memPercent),
                usageFormatted: formatBytes(memUsage),
                limitFormatted: formatBytes(memLimit)
              },
              cpu: {
                percent: parseFloat(cpuPercent)
              },
              network: {
                rxBytes: Object.values(stats.networks || {}).reduce((acc, n) => acc + (n.rx_bytes || 0), 0),
                txBytes: Object.values(stats.networks || {}).reduce((acc, n) => acc + (n.tx_bytes || 0), 0)
              },
              ports: containerInfo.Ports || []
            })
          } catch (statsErr) {
            // Container might not be running, add basic info
            containers.push({
              id: containerInfo.Id.substring(0, 12),
              name: containerInfo.Names[0]?.replace('/', '') || 'unknown',
              image: containerInfo.Image,
              status: containerInfo.State,
              state: containerInfo.Status,
              memory: { usage: 0, limit: 0, percent: 0, usageFormatted: '0 B', limitFormatted: '0 B' },
              cpu: { percent: 0 },
              network: { rxBytes: 0, txBytes: 0 },
              ports: containerInfo.Ports || []
            })
          }
        }
      } catch (dockerErr) {
        console.error('Docker API error:', dockerErr.message)
        // Return process-level stats as fallback
        return res.json({
          success: true,
          dockerAvailable: false,
          message: 'Docker socket not available',
          containers: getProcessStats()
        })
      }
    } else {
      // Dockerode not installed, return process-level stats
      return res.json({
        success: true,
        dockerAvailable: false,
        message: 'Docker module not installed',
        containers: getProcessStats()
      })
    }

    res.json({
      success: true,
      dockerAvailable: true,
      containers
    })
  } catch (error) {
    console.error('Error fetching Docker stats:', error)
    res.status(500).json({
      success: false,
      message: error.message,
      containers: getProcessStats()
    })
  }
})

// Get system info
router.get('/info', authMiddleware, async (req, res) => {
  try {
    const memUsage = process.memoryUsage()
    const uptime = process.uptime()

    res.json({
      success: true,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg()
      },
      process: {
        nodeVersion: process.version,
        uptime: formatUptime(uptime),
        uptimeSeconds: uptime,
        memoryUsage: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
          heapUsedFormatted: formatBytes(memUsage.heapUsed),
          heapTotalFormatted: formatBytes(memUsage.heapTotal),
          rssFormatted: formatBytes(memUsage.rss)
        },
        pid: process.pid
      }
    })
  } catch (error) {
    console.error('Error fetching system info:', error)
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
})

// Helper function to get process-level stats when Docker is not available
function getProcessStats() {
  const memUsage = process.memoryUsage()

  return [
    {
      id: 'backend',
      name: 'aurora-backend',
      image: 'node:20-alpine',
      status: 'running',
      state: 'Up',
      memory: {
        usage: memUsage.rss,
        limit: os.totalmem(),
        percent: parseFloat(((memUsage.rss / os.totalmem()) * 100).toFixed(2)),
        usageFormatted: formatBytes(memUsage.rss),
        limitFormatted: formatBytes(os.totalmem())
      },
      cpu: {
        percent: 0 // Can't easily get CPU usage without sampling
      },
      network: { rxBytes: 0, txBytes: 0 },
      ports: [{ PrivatePort: 3000, PublicPort: 3000 }]
    }
  ]
}

// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)

  return parts.join(' ') || '< 1m'
}

module.exports = router
