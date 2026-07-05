/**
 * src/services/queueService.js
 * Sistem antrian pesan menggunakan Bull (Redis) atau fallback in-memory.
 * Mode in-memory aktif bila REDIS_HOST tidak dikonfigurasi.
 */

'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const prisma = require('../config/prisma');
const whatsappService = require('./whatsappService');
const socketService = require('./socketService');

// ─── Bull Queue (Redis) ────────────────────────────────────────────────────
let queue = null;
let _useRedis = false;

const initQueue = () => {
  if (env.REDIS_HOST) {
    try {
      const Bull = require('bull');
      queue = new Bull('wa-messages', {
        redis: { host: env.REDIS_HOST, port: env.REDIS_PORT },
      });
      _useRedis = true;
      logger.info('[Queue] Menggunakan Redis Bull queue.');
      _attachBullProcessor();
    } catch (err) {
      logger.warn('[Queue] Gagal init Bull:', err.message, '— fallback ke in-memory.');
    }
  } else {
    logger.info('[Queue] Redis tidak dikonfigurasi, menggunakan in-memory queue.');
  }
};

// ─── Tambah Job ke Antrian ─────────────────────────────────────────────────
const enqueue = async (messageId, payload) => {
  // Simpan ke tabel QueueJob di DB
  await prisma.queueJob.create({
    data: {
      messageId,
      payload,
      status: 'PENDING',
    },
  });

  if (_useRedis && queue) {
    await queue.add({ messageId, ...payload }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  } else {
    // In-memory: proses setelah delay singkat
    setImmediate(() => _processJob(messageId, payload));
  }
};

// ─── Proses Job ────────────────────────────────────────────────────────────
const _processJob = async (messageId, payload) => {
  try {
    // Update status job & pesan
    await _updateJobStatus(messageId, 'PROCESSING');
    await prisma.message.update({ where: { id: messageId }, data: { status: 'SENDING' } });

    let waMsg;
    if (payload.type === 'TEXT') {
      waMsg = await whatsappService.sendText(payload.to, payload.content);
    } else if (payload.type === 'MEDIA') {
      waMsg = await whatsappService.sendMedia(payload.to, payload.filePath, payload.caption);
    }

    const waMessageId = waMsg?.id?.id || null;

    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'SENT', waMessageId, sentAt: new Date() },
    });
    await _updateJobStatus(messageId, 'COMPLETED');

    socketService.emit('message:status', { messageId, status: 'SENT', waMessageId });
    logger.info(`[Queue] Pesan ${messageId} terkirim. WA ID: ${waMessageId}`);

  } catch (err) {
    const errMsg = err?.message || String(err);
    const errStack = err?.stack || errMsg;
    logger.error(`[Queue] Gagal kirim pesan ${messageId}: ${errMsg}`);
    logger.error(`[Queue] Stack: ${errStack}`);
    await prisma.message.update({ where: { id: messageId }, data: { status: 'FAILED', errorMsg: errMsg } });
    await _updateJobStatus(messageId, 'FAILED', errMsg);
    socketService.emit('message:status', { messageId, status: 'FAILED', error: errMsg });
  }
};

// ─── Bull Processor ────────────────────────────────────────────────────────
const _attachBullProcessor = () => {
  queue.process(async (job) => {
    const { messageId, ...payload } = job.data;
    await _processJob(messageId, payload);
  });

  queue.on('failed', (job, err) => {
    logger.error(`[Queue/Bull] Job gagal: ${job.id}`, err.message);
  });
};

// ─── Helper DB ─────────────────────────────────────────────────────────────
const _updateJobStatus = async (messageId, status, lastError = null) => {
  try {
    await prisma.queueJob.update({
      where: { messageId },
      data: {
        status,
        ...(lastError && { lastError }),
        ...(status === 'COMPLETED' || status === 'FAILED' ? { processedAt: new Date() } : {}),
      },
    });
  } catch (e) {
    logger.warn('[Queue] Gagal update QueueJob:', e.message);
  }
};

module.exports = { initQueue, enqueue };
