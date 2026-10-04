// ============================================
// lib/prisma.js - Prisma client singleton
// ============================================
const { PrismaClient } = require('@prisma/client')

// Create a single instance of PrismaClient
const prisma = new PrismaClient()

module.exports = prisma
