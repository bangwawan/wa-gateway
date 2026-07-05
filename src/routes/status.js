/**
 * src/routes/status.js
 * Health check & info endpoint.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const prisma  = require('../config/prisma');
const whatsappService = require('../services/whatsappService');

// ─── GET /status ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (_) {}

  const waStatus = whatsappService.getStatus();
  const waInfo   = whatsappService.getClientInfo();

  res.json({
    success: true,
    data: {
      server:    'ok',
      uptime:    process.uptime(),
      timestamp: new Date().toISOString(),
      database:  dbOk ? 'ok' : 'error',
      whatsapp: {
        status: waStatus,
        phone:  waInfo?.wid?.user || null,
      },
    },
  });
});

module.exports = router;
