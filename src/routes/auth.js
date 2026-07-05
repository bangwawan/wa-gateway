/**
 * src/routes/auth.js
 * Endpoint: /auth/register, /auth/login, /auth/qr, /auth/status
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const prisma = require('../config/prisma');
const env = require('../config/env');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const whatsappService = require('../services/whatsappService');


// ─── POST /auth/register ──────────────────────────────────────────────────
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registrasi user baru
 *     tags: [Auth]
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, dan password wajib diisi.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role: role === 'ADMIN' ? 'ADMIN' : 'USER' },
    });

    return res.status(201).json({
      success: true,
      message: 'Registrasi berhasil.',
      data: { id: user.id, name: user.name, email: user.email, apiKey: user.apiKey, role: user.role },
    });
  } catch (err) { next(err); }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email dan password wajib diisi.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Login berhasil.',
      data: { token, apiKey: user.apiKey, role: user.role, expiresIn: env.JWT_EXPIRES_IN },
    });
  } catch (err) { next(err); }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, apiKey: true, createdAt: true },
    });
    return res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── GET /auth/qr ─────────────────────────────────────────────────────────
router.get('/qr', verifyToken, requireAdmin, (req, res) => {
  const qr = whatsappService.getQrDataUrl();
  const status = whatsappService.getStatus();
  if (status === 'CONNECTED') {
    return res.json({ success: true, status, message: 'WhatsApp sudah terhubung.' });
  }
  if (!qr) {
    return res.json({ success: true, status, message: 'QR belum tersedia. Tunggu beberapa detik.' });
  }
  return res.json({ success: true, status, qrDataUrl: qr });
});

// ─── GET /auth/wa-status ──────────────────────────────────────────────────
router.get('/wa-status', verifyToken, (req, res) => {
  const status = whatsappService.getStatus();
  const info = whatsappService.getClientInfo();
  return res.json({
    success: true,
    data: { status, phone: info?.wid?.user || null },
  });
});

// ==========================================
// ENDPOINT UNTUK GANTI NOMOR (RESET)
// ==========================================
router.post('/switch-number', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    await whatsappService.switchWhatsAppNumber();
    const result = { success: true };

    return res.json({
      status: 'success',
      message: 'Sesi lama dihapus. Silahkan cek dashboard untuk scan nomor baru.',
      result: result
    });

  } catch (error) {
    console.error('Gagal mengganti nomor:', error);
    return res.status(500).json({ status: 'error', message: 'Gagal melakukan switch nomor' });
  }
});

module.exports = router;
