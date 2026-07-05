/**
 * src/services/whatsappService.js
 * Mengelola satu koneksi WhatsApp menggunakan whatsapp-web.js.
 * Fitur: QR login, kirim teks/media, event handler masuk.
 */

"use strict";

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const logger = require("../config/logger");
const prisma = require("../config/prisma");
const socketService = require("./socketService");

// ─── State ───────────────────────────────────────────────────────────────────
let waClient = null;
let _qrDataUrl = null;
let _status = "DISCONNECTED"; // DISCONNECTED | QR_READY | CONNECTED | RECONNECTING
let _reconnecting = false;

// ─── Init ────────────────────────────────────────────────────────────────────
const initialize = async () => {
  if (waClient) {
    logger.warn("[WA] Client sudah diinisialisasi, skip.");
    return;
  }

  logger.info("[WA] Menginisialisasi WhatsApp client...");

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: env.WA_SESSION_PATH }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  // ── QR Code ──────────────────────────────────────────────────────────────
  waClient.on("qr", async (qr) => {
    _status = "QR_READY";
    _qrDataUrl = await qrcode.toDataURL(qr);
    logger.info("[WA] QR Code siap — silakan scan.");

    await _upsertSession({
      status: "QR_READY",
      qrCode: _qrDataUrl,
      phone: null,
    });
    socketService.emit("wa:qr", { qrDataUrl: _qrDataUrl });
  });

  // ── Siap / Connected ──────────────────────────────────────────────────────
  waClient.on("ready", async () => {
    _status = "CONNECTED";
    _qrDataUrl = null;
    const info = waClient.info;
    const phone = info?.wid?.user || null;
    logger.info(`[WA] Terhubung sebagai +${phone}`);

    await _upsertSession({
      status: "CONNECTED",
      qrCode: null,
      phone,
      connectedAt: new Date(),
    });
    socketService.emit("wa:ready", { phone });
  });

  // ── Authenticated ─────────────────────────────────────────────────────────
  waClient.on("authenticated", () => {
    logger.info("[WA] Sesi terautentikasi.");
    socketService.emit("wa:authenticated", {});
  });

  // ── Auth Gagal ────────────────────────────────────────────────────────────
  waClient.on("auth_failure", async (msg) => {
    _status = "DISCONNECTED";
    logger.error("[WA] Autentikasi gagal:", msg);
    await _upsertSession({ status: "DISCONNECTED" });
    socketService.emit("wa:auth_failure", { message: msg });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  waClient.on("disconnected", async (reason) => {
    if (_reconnecting) return; // Cegah double reconnect
    _reconnecting = true;
    _status = "DISCONNECTED";
    logger.warn("[WA] Terputus:", reason);
    await _upsertSession({ status: "DISCONNECTED" });
    socketService.emit("wa:disconnected", { reason });

    // Destroy client lama agar Puppeteer/Chrome benar-benar berhenti
    const oldClient = waClient;
    waClient = null;
    try {
      if (oldClient) await oldClient.destroy();
    } catch (e) {
      logger.warn("[WA] Gagal destroy client lama:", e.message);
    }

    // Auto reconnect setelah 5 detik
    setTimeout(async () => {
      _reconnecting = false;
      await initialize();
    }, 5000);
  });

  // ── Pesan Masuk ───────────────────────────────────────────────────────────
  waClient.on("message", async (msg) => {
    try {
      // Hanya proses pesan pribadi (abaikan grup dan status)
      if (msg.from.endsWith("@c.us") || msg.from.endsWith("@lid")) {
        logger.info(`[WA] Pesan masuk dari ${msg.from}: ${msg.type}`);

        let mediaUrl = null;
        let mediaType = null;

        if (msg.hasMedia) {
          const media = await msg.downloadMedia();
          if (media) {
            const uploadsDir = path.join(process.cwd(), "uploads");
            if (!fs.existsSync(uploadsDir))
              fs.mkdirSync(uploadsDir, { recursive: true });
            const ext = media.mimetype.split("/")[1]?.split(";")[0] || "bin";
            const filename = `${Date.now()}_${msg.id.id}.${ext}`;
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, Buffer.from(media.data, "base64"));
            mediaUrl = `/uploads/${filename}`;
            mediaType = media.mimetype;
          }
        }

        const msgType = _mapMsgType(msg.type);

        const saved = await prisma.message.create({
          data: {
            direction: "IN",
            from: msg.from,
            to: msg.to || "me",
            type: msgType,
            content: msg.body || null,
            mediaUrl,
            mediaType,
            status: "DELIVERED",
            waMessageId: msg.id?.id || null,
            sentAt: new Date(msg.timestamp * 1000),
            deliveredAt: new Date(),
          },
        });

        socketService.emit("message:incoming", saved);
      }
    } catch (err) {
      logger.error("[WA] Gagal menyimpan pesan masuk:", err.message);
    }
  });

  // ── ACK (status pesan keluar) ─────────────────────────────────────────────
  waClient.on("message_ack", async (msg, ack) => {
    // ack: 1=SENT, 2=DELIVERED, 3=READ, -1=ERROR
    try {
      const statusMap = {
        1: "SENT",
        2: "DELIVERED",
        3: "READ",
        "-1": "FAILED",
      };
      const newStatus = statusMap[ack] || null;
      if (!newStatus || !msg.id?.id) return;

      const updated = await prisma.message.updateMany({
        where: { waMessageId: msg.id.id },
        data: {
          status: newStatus,
          ...(newStatus === "DELIVERED" && { deliveredAt: new Date() }),
          ...(newStatus === "READ" && { readAt: new Date() }),
        },
      });

      if (updated.count > 0) {
        socketService.emit("message:status", {
          waMessageId: msg.id.id,
          status: newStatus,
        });
      }
    } catch (err) {
      logger.error("[WA] Gagal update status ACK:", err.message);
    }
  });

  await waClient.initialize();
};

// ─── Send Text ────────────────────────────────────────────────────────────────
const sendText = async (to, text) => {
  _assertConnected();
  const chatId = _formatNumber(to);
  const msg = await waClient.sendMessage(chatId, text);
  return msg;
};

// ─── Send Media ───────────────────────────────────────────────────────────────
const sendMedia = async (to, filePath, caption = "") => {
  _assertConnected();
  const chatId = _formatNumber(to);
  const media = MessageMedia.fromFilePath(filePath);
  const msg = await waClient.sendMessage(chatId, media, { caption });
  return msg;
};

// ─── Getters ──────────────────────────────────────────────────────────────────
const getStatus = () => _status;
const getQrDataUrl = () => _qrDataUrl;
const getClientInfo = () => {
  if (!waClient || _status !== "CONNECTED") return null;
  return waClient.info;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const _assertConnected = () => {
  if (!waClient || _status !== "CONNECTED") {
    const err = new Error(
      "WhatsApp belum terhubung. Silakan scan QR terlebih dahulu.",
    );
    err.status = 503;
    throw err;
  }
};

const _formatNumber = (number) => {
  // Sudah dalam format chatId
  if (String(number).includes("@")) return String(number);

  // Hapus semua karakter non-digit
  let clean = String(number).replace(/\D/g, "");

  // Konversi nomor lokal Indonesia (08xx) ke format internasional (628xx)
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  }

  return `${clean}@c.us`;
};

const _mapMsgType = (type) => {
  const map = {
    chat: "TEXT",
    image: "IMAGE",
    document: "DOCUMENT",
    audio: "AUDIO",
    video: "VIDEO",
    sticker: "STICKER",
  };
  return map[type] || "TEXT";
};

const _upsertSession = async (data) => {
  try {
    await prisma.whatsAppSession.upsert({
      where: { sessionId: "default" },
      update: { ...data, updatedAt: new Date() },
      create: { sessionId: "default", ...data },
    });
  } catch (e) {
    logger.warn("[WA] Gagal update sesi di DB:", e.message);
  }
};

const switchWhatsAppNumber = async () => {
  logger.info("[WA] Sedang memutuskan nomor lama...");
  socketService.emit("wa:init", {
    status: "DISCONNECTED",
    message: "Sedang memutuskan nomor lama...",
  });
  _status = "DISCONNECTED";
  _qrDataUrl = null;

  if (waClient) {
    try {
      await waClient.logout(); // Hapus sesi di server WhatsApp
    } catch (e) {
      logger.warn("[WA] Sesi mungkin sudah tidak aktif sebelum logout.");
    }
    await waClient.destroy(); // Matikan browser Puppeteer
    waClient = null;

    // Hapus folder sesi secara fisik agar benar-benar bersih
    if (fs.existsSync(env.WA_SESSION_PATH)) {
      fs.rmSync(env.WA_SESSION_PATH, { recursive: true, force: true });
      logger.info("[WA] Folder sesi lama berhasil dibersihkan.");
    }
  }

  // Nyalakan ulang gateway untuk memicu QR Code baru
  await initialize();
};
module.exports = {
  initialize,
  sendText,
  sendMedia,
  getStatus,
  getQrDataUrl,
  getClientInfo,
  switchWhatsAppNumber,
};
