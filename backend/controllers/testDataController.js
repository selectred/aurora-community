'use strict'
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const prisma = require('../lib/prisma')
const { parseCSV, resolveLocalDataFilePath, fetchContinuumDataset } = require('../services/testDataService')

function getDataDir() {
  return process.env.AURORA_DATA_DIR || path.join(__dirname, '../data')
}

// POST /api/test-data?filename=myfile.csv  body: text/plain CSV
async function uploadLocalCSV(req, res) {
  try {
    const filename = req.query.filename || 'upload.csv'
    const text = req.body
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Empty CSV body' })
    }

    const { headers, rows } = parseCSV(text)
    if (!headers.length) return res.status(400).json({ success: false, message: 'Could not parse CSV headers' })

    const id = uuidv4()
    const dir = path.join(getDataDir(), 'test-data')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${id}.csv`)
    fs.writeFileSync(filePath, text, 'utf8')

    const record = await prisma.testDataFile.create({
      data: {
        id,
        filename,
        filePath: `test-data/${id}.csv`,
        headersJson: JSON.stringify(headers),
        rowCount: rows.length,
        previewJson: JSON.stringify(rows.slice(0, 5))
      }
    })

    res.json({ success: true, file: formatFile(record) })
  } catch (e) {
    console.error('[testDataController] uploadLocalCSV error:', e)
    res.status(500).json({ success: false, message: e.message })
  }
}

// GET /api/test-data
async function listLocalCSV(req, res) {
  try {
    const files = await prisma.testDataFile.findMany({ orderBy: { createdAt: 'desc' } })
    res.json({ success: true, files: files.map(formatFile) })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// DELETE /api/test-data/:fileId
async function deleteLocalCSV(req, res) {
  try {
    const record = await prisma.testDataFile.findUnique({ where: { id: req.params.fileId } })
    if (!record) return res.status(404).json({ success: false, message: 'File not found' })

    const absPath = resolveLocalDataFilePath(record.id)
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath)

    await prisma.testDataFile.delete({ where: { id: record.id } })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

// GET /api/test-data/continuum  — proxy dataset list from Continuum
async function listContinuumDatasets(req, res) {
  try {
    const settings = await prisma.appSettings.findFirst({
      select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
    })
    if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
      return res.json({ success: true, datasets: [] })
    }

    const axios = require('axios')
    const baseUrl = settings.continuumUrl.replace(/\/$/, '')
    const result = await axios.get(`${baseUrl}/api/test-data/datasets`, {
      headers: { 'X-API-Key': settings.continuumApiKey },
      timeout: 10000
    })
    res.json({ success: true, datasets: result.data?.datasets || [] })
  } catch (e) {
    res.json({ success: true, datasets: [] }) // fail gracefully — Continuum might be offline
  }
}

// GET /api/test-data/continuum/:id  — proxy single dataset headers from Continuum
async function getContinuumDataset(req, res) {
  try {
    const settings = await prisma.appSettings.findFirst({
      select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
    })
    if (!settings?.continuumEnabled || !settings?.continuumUrl || !settings?.continuumApiKey) {
      return res.status(404).json({ success: false, message: 'Continuum not configured' })
    }

    const axios = require('axios')
    const baseUrl = settings.continuumUrl.replace(/\/$/, '')
    const result = await axios.get(`${baseUrl}/api/injection/datasets/${req.params.id}`, {
      headers: { 'X-API-Key': settings.continuumApiKey },
      timeout: 10000
    })
    const dataset = result.data?.dataset || result.data
    res.json({
      success: true,
      id: dataset._id || dataset.id,
      name: dataset.name,
      headers: dataset.headers || Object.keys(dataset.rows?.[0] || {}),
      rowCount: dataset.rows?.length || dataset.rowCount || 0
    })
  } catch (e) {
    res.status(404).json({ success: false, message: 'Dataset not found' })
  }
}

function formatFile(record) {
  return {
    id: record.id,
    filename: record.filename,
    filePath: record.filePath,
    headers: JSON.parse(record.headersJson || '[]'),
    rowCount: record.rowCount,
    preview: JSON.parse(record.previewJson || '[]'),
    createdAt: record.createdAt
  }
}

module.exports = { uploadLocalCSV, listLocalCSV, deleteLocalCSV, listContinuumDatasets, getContinuumDataset }
