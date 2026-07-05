/**
 * src/middleware/apiKey.js
 * Middleware verifikasi API Key pada header x-api-key.
 * Cocok untuk akses sistem eksternal / third-party tanpa JWT.
 */

'use strict';

const env = require('../config/env');

const verifyApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ success: false, message: 'API Key tidak ditemukan.' });
  }
  if (!env.API_KEYS.includes(key)) {
    return res.status(403).json({ success: false, message: 'API Key tidak valid.' });
  }
  next();
};

module.exports = { verifyApiKey };
