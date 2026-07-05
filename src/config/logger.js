/**
 * src/config/logger.js
 * Winston logger — output ke console & file.
 */

'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');
const env = require('./env');

// Pastikan folder log ada
if (!fs.existsSync(env.LOG_DIR)) {
  fs.mkdirSync(env.LOG_DIR, { recursive: true });
}

const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `[${timestamp}] ${level}: ${message} ${extra}`;
        })
      ),
    }),
    new transports.File({
      filename: path.join(env.LOG_DIR, 'error.log'),
      level: 'error',
    }),
    new transports.File({
      filename: path.join(env.LOG_DIR, 'combined.log'),
    }),
  ],
});

module.exports = logger;
