/**
 * src/config/prisma.js
 * Singleton Prisma Client agar koneksi DB tidak di-buat ulang.
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const env = require('./env');

const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
