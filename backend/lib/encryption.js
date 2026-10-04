'use strict'
const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const ENCODING  = 'hex'

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'aurora-pack-vars-v1', 32)
}

function encrypt(plaintext, secret) {
  const key = deriveKey(secret)
  const iv  = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString(ENCODING), tag.toString(ENCODING), encrypted.toString(ENCODING)].join(':')
}

function decrypt(encoded, secret) {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivHex, tagHex, dataHex] = parts
  const key     = deriveKey(secret)
  const iv      = Buffer.from(ivHex, ENCODING)
  const tag     = Buffer.from(tagHex, ENCODING)
  const data    = Buffer.from(dataHex, ENCODING)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function generateKey() {
  return crypto.randomBytes(32).toString(ENCODING)
}

module.exports = { encrypt, decrypt, generateKey }
