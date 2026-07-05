/**
 * src/middleware/auth.js
 * Middleware verifikasi JWT token pada header Authorization.
 * Tambahkan req.user = { id, email, role } bila valid.
 */

'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Middleware: wajib login (JWT)
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan.' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kadaluarsa.' });
  }
};

/**
 * Middleware: hanya ADMIN
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Diperlukan role ADMIN.' });
  }
  next();
};

module.exports = { verifyToken, requireAdmin };
