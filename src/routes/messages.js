/**
 * src/routes/messages.js
 * Endpoint: POST /messages (kirim), GET /messages (list), GET /messages/:id
 */

'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const router   = express.Router();

const prisma   = require('../config/prisma');
const { verifyToken } = require('../middleware/auth');
const { verifyApiKey } = require('../middleware/apiKey');
const queueService = require('../services/queueService');

// ─── Multer config ─────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/', 'video/', 'audio/', 'application/pdf'];
    if (allowed.some((t) => file.mimetype.startsWith(t))) {
      cb(null, true);
    } else {
      cb(new Error('Tipe file tidak didukung.'));
    }
  },
});

// ─── POST /messages ────────────────────────────────────────────────────────
// Bisa diakses dengan JWT ATAU API Key
router.post('/', _flexAuth, upload.single('media'), async (req, res, next) => {
  try {
    const { to, content, caption } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Nomor tujuan (to) wajib diisi.' });

    const isMedia = !!req.file;
    if (!isMedia && !content) {
      return res.status(400).json({ success: false, message: 'Konten pesan (content) wajib diisi.' });
    }

    const msgType = isMedia ? _getMediaType(req.file.mimetype) : 'TEXT';
    const filePath = isMedia ? req.file.path : null;
    const mediaUrl = isMedia ? `/uploads/${req.file.filename}` : null;

    // Simpan pesan ke DB dengan status PENDING
    const message = await prisma.message.create({
      data: {
        userId: req.userId || null,
        direction: 'OUT',
        from: 'me',
        to,
        type: msgType,
        content: content || caption || null,
        mediaUrl,
        mediaType: req.file?.mimetype || null,
        status: 'PENDING',
      },
    });

    // Masukkan ke antrian
    await queueService.enqueue(message.id, {
      type: isMedia ? 'MEDIA' : 'TEXT',
      to,
      content: content || null,
      filePath,
      caption: caption || '',
    });

    return res.status(202).json({
      success: true,
      message: 'Pesan diterima dan sedang diproses.',
      data: { messageId: message.id, status: 'PENDING' },
    });
  } catch (err) { next(err); }
});

// ─── GET /messages ─────────────────────────────────────────────────────────
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20,
      direction, status,
      from, to,
      startDate, endDate,
    } = req.query;

    const where = {};
    if (direction) where.direction = direction.toUpperCase();
    if (status)    where.status = status.toUpperCase();
    if (from)      where.from = { contains: from };
    if (to)        where.to   = { contains: to };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate)   where.createdAt.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, direction: true, from: true, to: true,
          type: true, content: true, mediaUrl: true,
          status: true, waMessageId: true,
          sentAt: true, deliveredAt: true, readAt: true, createdAt: true,
        },
      }),
      prisma.message.count({ where }),
    ]);

    return res.json({
      success: true,
      data: messages,
      pagination: {
        total, page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /messages/:id ────────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: { queueJob: true },
    });
    if (!message) return res.status(404).json({ success: false, message: 'Pesan tidak ditemukan.' });
    return res.json({ success: true, data: message });
  } catch (err) { next(err); }
});

// ─── DELETE /messages/:id ─────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!msg) return res.status(404).json({ success: false, message: 'Pesan tidak ditemukan.' });
    if (['PENDING', 'QUEUED', 'SENDING'].includes(msg.status)) {
      return res.status(400).json({ success: false, message: 'Pesan sedang diproses, tidak bisa dihapus.' });
    }
    // Hapus media file bila ada
    if (msg.mediaUrl) {
      const filepath = path.join(process.cwd(), msg.mediaUrl);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }
    await prisma.message.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'Pesan berhasil dihapus.' });
  } catch (err) { next(err); }
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function _flexAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    // API Key path
    const env = require('../config/env');
    if (!env.API_KEYS.includes(apiKey)) {
      return res.status(403).json({ success: false, message: 'API Key tidak valid.' });
    }
    req.userId = null;
    return next();
  }
  // JWT path
  const jwt = require('jsonwebtoken');
  const env = require('../config/env');
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan.' });
  }
  try {
    const decoded = jwt.verify(authHeader.slice(7), env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token tidak valid.' });
  }
}

function _getMediaType(mimetype) {
  if (mimetype.startsWith('image/'))  return 'IMAGE';
  if (mimetype.startsWith('video/'))  return 'VIDEO';
  if (mimetype.startsWith('audio/'))  return 'AUDIO';
  return 'DOCUMENT';
}

module.exports = router;
