'use strict'
/**
 * dataInjectionService.js
 *
 * Test data injection service for Aurora.
 * Injects test data into target databases before spec execution,
 * and cleans up after execution completes.
 *
 * Supports: PostgreSQL, MySQL, MSSQL, MongoDB
 */

const prisma = require('../lib/prisma')

/**
 * Get database client based on type
 */
async function getClient(source) {
  const { dbType, host, port, database, username, password } = source

  switch (dbType) {
    case 'postgres': {
      const { Pool } = require('pg')
      return new Pool({
        host, port: port || 5432, database,
        user: username, password,
        max: 5, idleTimeoutMillis: 30000
      })
    }
    case 'mysql': {
      const mysql = require('mysql2/promise')
      return mysql.createPool({
        host, port: port || 3306, database,
        user: username, password,
        waitForConnections: true, connectionLimit: 5
      })
    }
    case 'mssql': {
      const sql = require('mssql')
      return sql.connect({
        server: host, port: port || 1433, database,
        user: username, password,
        options: { encrypt: false, trustServerCertificate: true }
      })
    }
    case 'mongodb': {
      const { MongoClient } = require('mongodb')
      const uri = `mongodb://${username}:${encodeURIComponent(password)}@${host}:${port || 27017}/${database}`
      const client = new MongoClient(uri)
      await client.connect()
      return client
    }
    default:
      throw new Error(`Unsupported database type: ${dbType}`)
  }
}

/**
 * Inject rows into target database table
 * @param {Object} source - DataSource config { dbType, host, port, database, username, password }
 * @param {string} tableName - Target table name
 * @param {Array} rows - Array of row objects to insert
 * @returns {Object} { injectedCount, ids }
 */
async function injectData(source, tableName, rows) {
  if (!rows || rows.length === 0) {
    return { injectedCount: 0, ids: [] }
  }

  const client = await getClient(source)
  const ids = []

  try {
    switch (source.dbType) {
      case 'postgres': {
        for (const row of rows) {
          const cols = Object.keys(row)
          const vals = Object.values(row)
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
          const result = await client.query(
            `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
            vals
          )
          if (result.rows[0]?.id) ids.push(result.rows[0].id)
        }
        break
      }
      case 'mysql': {
        for (const row of rows) {
          const cols = Object.keys(row)
          const vals = Object.values(row)
          const placeholders = cols.map(() => '?').join(', ')
          const [result] = await client.execute(
            `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`,
            vals
          )
          if (result.insertId) ids.push(result.insertId)
        }
        break
      }
      case 'mssql': {
        for (const row of rows) {
          const cols = Object.keys(row)
          const vals = Object.values(row)
          const placeholders = cols.map((_, i) => `@p${i}`).join(', ')
          const request = client.request()
          vals.forEach((v, i) => request.input(`p${i}`, v))
          const result = await request.query(
            `INSERT INTO ${tableName} (${cols.join(', ')}) OUTPUT INSERTED.id VALUES (${placeholders})`
          )
          if (result.recordset?.[0]?.id) ids.push(result.recordset[0].id)
        }
        break
      }
      case 'mongodb': {
        const db = client.db(source.database)
        const collection = db.collection(tableName)
        const result = await collection.insertMany(rows)
        ids.push(...Object.values(result.insertedIds).map(id => id.toString()))
        break
      }
    }
  } finally {
    // Close connection
    if (source.dbType === 'postgres') await client.end()
    else if (source.dbType === 'mysql') await client.end()
    else if (source.dbType === 'mssql') await client.close()
    else if (source.dbType === 'mongodb') await client.close()
  }

  return { injectedCount: rows.length, ids }
}

/**
 * Cleanup injected data from target database
 * @param {Object} source - DataSource config
 * @param {string} tableName - Target table name
 * @param {Array} ids - Array of IDs to delete
 * @returns {Object} { deletedCount }
 */
async function cleanupData(source, tableName, ids) {
  if (!ids || ids.length === 0) {
    return { deletedCount: 0 }
  }

  const client = await getClient(source)
  let deletedCount = 0

  try {
    switch (source.dbType) {
      case 'postgres': {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
        const result = await client.query(
          `DELETE FROM ${tableName} WHERE id IN (${placeholders})`,
          ids
        )
        deletedCount = result.rowCount
        break
      }
      case 'mysql': {
        const placeholders = ids.map(() => '?').join(', ')
        const [result] = await client.execute(
          `DELETE FROM ${tableName} WHERE id IN (${placeholders})`,
          ids
        )
        deletedCount = result.affectedRows
        break
      }
      case 'mssql': {
        const placeholders = ids.map((_, i) => `@id${i}`).join(', ')
        const request = client.request()
        ids.forEach((id, i) => request.input(`id${i}`, id))
        const result = await request.query(
          `DELETE FROM ${tableName} WHERE id IN (${placeholders})`
        )
        deletedCount = result.rowsAffected[0]
        break
      }
      case 'mongodb': {
        const { ObjectId } = require('mongodb')
        const db = client.db(source.database)
        const collection = db.collection(tableName)
        const objectIds = ids.map(id => {
          try { return new ObjectId(id) } catch { return id }
        })
        const result = await collection.deleteMany({ _id: { $in: objectIds } })
        deletedCount = result.deletedCount
        break
      }
    }
  } finally {
    if (source.dbType === 'postgres') await client.end()
    else if (source.dbType === 'mysql') await client.end()
    else if (source.dbType === 'mssql') await client.close()
    else if (source.dbType === 'mongodb') await client.close()
  }

  return { deletedCount }
}

/**
 * Get test data for a pack (from attached dataset)
 * Returns rows that can be passed to specs via testData fixture
 * @param {string} packId - TestPack ID
 * @returns {Object} { name, headers, rows, mode, source }
 */
async function getPackTestData(packId) {
  const pack = await prisma.testPack.findUnique({
    where: { id: packId }
  })

  if (!pack) return null

  const mode = pack.testDataMode || 'none'
  if (mode === 'none') return null

  // Check for local CSV file
  if (pack.testDataFileId) {
    const file = await prisma.testDataFile.findUnique({
      where: { id: pack.testDataFileId }
    })
    if (file) {
      const fs = require('fs')
      const path = require('path')
      const { parseCSV } = require('./testDataService')

      const dataDir = process.env.AURORA_DATA_DIR || path.join(__dirname, '../data')
      const filePath = path.join(dataDir, file.filePath)

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8')
        const { headers, rows } = parseCSV(content)
        return {
          name: file.filename.replace('.csv', ''),
          headers,
          rows,
          mode,
          source: 'local'
        }
      }
    }
  }

  // Check for Continuum dataset
  if (pack.testDataContinuumId) {
    try {
      const settings = await prisma.appSettings.findFirst({
        select: { continuumEnabled: true, continuumUrl: true, continuumApiKey: true }
      })

      if (settings?.continuumEnabled && settings?.continuumUrl && settings?.continuumApiKey) {
        const axios = require('axios')
        const baseUrl = settings.continuumUrl.replace(/\/$/, '')
        const response = await axios.get(
          `${baseUrl}/api/injection/datasets/${pack.testDataContinuumId}`,
          {
            headers: { 'X-API-Key': settings.continuumApiKey },
            timeout: 10000
          }
        )
        const dataset = response.data?.dataset || response.data
        if (dataset) {
          return {
            name: dataset.name,
            headers: dataset.headers || Object.keys(dataset.rows?.[0] || {}),
            rows: dataset.rows || [],
            mode,
            source: 'continuum',
            // If Continuum dataset has injection config, include it
            dataSource: dataset.dataSource || null,
            targetTable: dataset.targetTable || null
          }
        }
      }
    } catch (e) {
      console.warn('[dataInjectionService] Failed to fetch Continuum dataset:', e.message)
    }
  }

  return null
}

/**
 * Build testData array for Playwright fixtures
 * @param {Object} packData - Result from getPackTestData
 * @returns {Array} Array of { name, rows, ... } for TEST_DATA fixture
 */
function buildTestDataFixture(packData) {
  if (!packData || !packData.rows || packData.rows.length === 0) {
    return []
  }

  return [{
    name: packData.name,
    headers: packData.headers,
    rows: packData.rows,
    mode: packData.mode
  }]
}

module.exports = {
  injectData,
  cleanupData,
  getPackTestData,
  buildTestDataFixture
}
