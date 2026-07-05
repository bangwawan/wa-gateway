/**
 * src/routes/reports.js
 * Laporan & statistik pengiriman pesan.
 */

'use strict';

const express = require('express');
const router  = express.Router();

const prisma  = require('../config/prisma');
const { verifyToken } = require('../middleware/auth');

// ─── GET /reports/summary ─────────────────────────────────────────────────
router.get('/summary', verifyToken, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate)   dateFilter.lte = new Date(endDate);
    const where = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [total, byStatus, byDirection, byType] = await Promise.all([
      prisma.message.count({ where }),

      prisma.message.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),

      prisma.message.groupBy({
        by: ['direction'],
        where,
        _count: { _all: true },
      }),

      prisma.message.groupBy({
        by: ['type'],
        where,
        _count: { _all: true },
      }),
    ]);

    const statusMap  = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
    const dirMap     = Object.fromEntries(byDirection.map((r) => [r.direction, r._count._all]));
    const typeMap    = Object.fromEntries(byType.map((r) => [r.type, r._count._all]));

    return res.json({
      success: true,
      data: {
        total,
        byStatus:    { PENDING: 0, QUEUED: 0, SENDING: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0, ...statusMap },
        byDirection: { IN: 0, OUT: 0, ...dirMap },
        byType:      { TEXT: 0, IMAGE: 0, DOCUMENT: 0, AUDIO: 0, VIDEO: 0, ...typeMap },
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /reports/messages ────────────────────────────────────────────────
// Pesan per hari (chart data)
router.get('/daily', verifyToken, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const messages = await prisma.message.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, direction: true, status: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const grouped = {};
    for (const msg of messages) {
      const date = msg.createdAt.toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = { date, total: 0, IN: 0, OUT: 0, FAILED: 0 };
      grouped[date].total++;
      grouped[date][msg.direction]++;
      if (msg.status === 'FAILED') grouped[date].FAILED++;
    }

    return res.json({
      success: true,
      data: Object.values(grouped),
    });
  } catch (err) { next(err); }
});

// ─── GET /reports/failed ──────────────────────────────────────────────────
router.get('/failed', verifyToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { status: 'FAILED' },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { queueJob: { select: { attempts: true, lastError: true } } },
      }),
      prisma.message.count({ where: { status: 'FAILED' } }),
    ]);

    return res.json({
      success: true,
      data: messages,
      pagination: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) { next(err); }
});

module.exports = router;
