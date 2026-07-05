/**
 * src/config/env.js
 * Memuat dan memvalidasi semua environment variable.
 * Pastikan semua variable wajib tersedia sebelum app berjalan.
 */

'use strict';

// Load .env secara manual tanpa dotenv package (Node 20.6+ native support)
// Jika Node < 20.6 gunakan: require('dotenv').config()
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // Hapus tanda kutip jika ada
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (err) {
  console.warn('Warning: Gagal membaca .env', err.message);
}

const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[ENV] Variable wajib tidak ditemukan: ${missing.join(', ')}`);
  process.exit(1);
}

const env = {
  NODE_ENV:    process.env.NODE_ENV     || 'development',
  PORT:        parseInt(process.env.PORT || '3000', 10),

  DATABASE_URL: process.env.DATABASE_URL,

  JWT_SECRET:   process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // API Keys (bisa multiple, pisah koma)
  API_KEYS: (process.env.API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean),

  WA_SESSION_PATH: process.env.WA_SESSION_PATH || './wa-session',

  REDIS_HOST: process.env.REDIS_HOST || null,
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_DIR:   process.env.LOG_DIR   || './logs',
};

module.exports = env;
