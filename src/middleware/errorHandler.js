/**
 * src/middleware/errorHandler.js
 * Global error handler Express.
 */

'use strict';

const logger = require('../config/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, url: req.originalUrl });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal server.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
