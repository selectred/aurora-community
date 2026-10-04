'use strict'
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const prisma = require('../lib/prisma')

function getDataDir() {
  return process.env.AURORA_DATA_DIR || path.join(__dirname, '../data')
}

function resolveLocalDataFilePath(fileId) {
  return path.join(getDataDir(), 'test-data', `${fileId}.csv`)
}

// Hand-rolled CSV parser — handles quoted fields, no extra dep
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line) {
    const fields = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        i++
        let val = ''
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { val += line[i++] }
        }
        fields.push(val)
        if (line[i] === ',') i++
      } else {
        let val = ''
        while (i < line.length && line[i] !== ',') val += line[i++]
        fields.push(val.trim())
        if (line[i] === ',') i++
      }
    }
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : '' })
    return row
  })

  return { headers, rows }
}

async function fetchContinuumDataset(datasetId) {
  const settings = await prisma.appSettings.findFirst({
    select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
  })
  if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) return null

  const baseUrl = settings.continuumUrl.replace(/\/$/, '')
  const res = await axios.get(`${baseUrl}/api/test-data/datasets/${datasetId}`, {
    headers: { 'X-API-Key': settings.continuumApiKey },
    timeout: 15000
  })
  return res.data?.dataset || null
}

async function getDataForPack(pack) {
  // Try Continuum dataset first
  if (pack.testDataContinuumId) {
    try {
      const dataset = await fetchContinuumDataset(pack.testDataContinuumId)
      if (dataset?.headers?.length) return { headers: dataset.headers, rows: dataset.rows || [] }
    } catch (e) {
      console.error('[testDataService] Continuum dataset fetch failed:', e.message)
    }
  }

  // Fall back to local CSV
  if (pack.testDataFileId) {
    const filePath = resolveLocalDataFilePath(pack.testDataFileId)
    if (fs.existsSync(filePath)) {
      const text = fs.readFileSync(filePath, 'utf8')
      return parseCSV(text)
    }
  }

  return null
}

module.exports = { parseCSV, resolveLocalDataFilePath, fetchContinuumDataset, getDataForPack }
