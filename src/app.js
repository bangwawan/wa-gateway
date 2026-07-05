/**
 * src/app.js
 * Entry point — Express + Socket.io + WhatsApp service.
 */

'use strict';

// Pastikan env dimuat pertama
const env = require('./config/env');
const logger = require('./config/logger');

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('fs');

// Services
const socketService = require('./services/socketService');
const whatsappService = require('./services/whatsappService');
const { initQueue } = require('./services/queueService');

// Routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const reportRoutes = require('./routes/reports');
const statusRoute = require('./routes/status');

// Middleware
const { errorHandler } = require('./middleware/errorHandler');
const jwt = require('jsonwebtoken');

// ─── App Setup ────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io',
});

// Daftarkan IO ke singleton
socketService.setIO(io);

// ─── Global Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Sajikan file upload secara statis
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Sajikan dashboard (src/public)
app.use(express.static(path.join(__dirname, 'public')));

// ─── Swagger / API Docs ───────────────────────────────────────────────────
const docsPath = path.join(process.cwd(), 'docs', 'openapi.yaml');
if (fs.existsSync(docsPath)) {
  const swaggerDoc = YAML.parse(fs.readFileSync(docsPath, 'utf-8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  logger.info('[App] Swagger UI tersedia di /api-docs');
}

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/reports', reportRoutes);
app.use('/status', statusRoute);

// Root → Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// 404 — hanya untuk /api routes
app.use((req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/messages') ||
    req.path.startsWith('/reports') || req.path.startsWith('/status') ||
    req.path.startsWith('/api-docs')) {
    return res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan.' });
  }
  // SPA fallback
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use(errorHandler);

// ─── Socket.io Auth & Events ──────────────────────────────────────────────
// Auth opsional: dashboard dashboard bisa connect tanpa token (guest),
// token diperlukan hanya untuk operasi yang memerlukan user context.
io.use((socket, next) => {
  const rawToken = socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization;
  const token = rawToken ? rawToken.replace('Bearer ', '') : null;
  if (token) {
    try {
      socket.user = jwt.verify(token, env.JWT_SECRET);
    } catch {
      // Token invalid → treat as guest (event-only, no user room)
      socket.user = null;
    }
  } else {
    socket.user = null;
  }
  next(); // selalu lanjut
});

io.on('connection', (socket) => {
  const who = socket.user?.email || 'guest';
  logger.info(`[WS] Client terhubung: ${socket.id} (${who})`);
  if (socket.user?.id) socket.join(`user:${socket.user.id}`);

  // Kirim status WA saat client baru connect
  const waStatus = require('./services/whatsappService').getStatus();
  const waQR = require('./services/whatsappService').getQrDataUrl();
  socket.emit('wa:init', { status: waStatus, qrDataUrl: waQR });

  socket.on('disconnect', () => {
    logger.info(`[WS] Client putus: ${socket.id} (${who})`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    // Init antrian
    initQueue();

    // Init WhatsApp
    whatsappService.initialize().catch((err) => {
      logger.error('[App] Gagal inisialisasi WhatsApp:', err.message);
    });

    server.listen(env.PORT, () => {
      logger.info(`[App] Server berjalan di http://localhost:${env.PORT}`);
      logger.info(`[App] Swagger Docs: http://localhost:${env.PORT}/api-docs`);
      logger.info(`[App] WebSocket: ws://localhost:${env.PORT}/socket.io`);
    });
  } catch (err) {
    logger.error('[App] Gagal start:', err.message);
    process.exit(1);
  }
};

start();





module.exports = { app, server };
