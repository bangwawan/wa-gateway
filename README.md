# WhatsApp Gateway

REST API + WebSocket gateway untuk WhatsApp berbasis **whatsapp-web.js**, dibangun dengan **Node.js**, **Express**, **Prisma ORM**, dan **MySQL**.

---

## ✨ Fitur

| Fitur | Keterangan |
|-------|-----------|
| 🔐 Login via QR Code | Scan QR sekali, sesi tersimpan otomatis |
| 📤 Kirim Pesan | Teks, gambar, dokumen |
| 📥 Terima Pesan | Incoming message disimpan + notifikasi realtime |
| 📊 Status Pesan | PENDING → SENT → DELIVERED → READ |
| 🔁 Sistem Antrian | Bull (Redis) atau in-memory queue |
| 🔌 WebSocket | Real-time update via Socket.io |
| 🔑 Auth | JWT + API Key |
| 📄 Swagger UI | Dokumentasi interaktif di `/api-docs` |
| 📈 Laporan | Statistik & data harian |

---

## 🗂️ Struktur Proyek

```
wa-gateway/
├── prisma/
│   └── schema.prisma        # Skema database
├── src/
│   ├── config/
│   │   ├── env.js           # Validasi environment variable
│   │   ├── prisma.js        # Prisma client singleton
│   │   └── logger.js        # Winston logger
│   ├── middleware/
│   │   ├── auth.js          # JWT verifikasi
│   │   ├── apiKey.js        # API Key verifikasi
│   │   └── errorHandler.js  # Global error handler
│   ├── routes/
│   │   ├── auth.js          # /auth/*
│   │   ├── messages.js      # /messages
│   │   ├── reports.js       # /reports/*
│   │   └── status.js        # /status
│   ├── services/
│   │   ├── whatsappService.js  # whatsapp-web.js logic
│   │   ├── queueService.js     # Antrian pesan
│   │   └── socketService.js    # Socket.io singleton
│   └── app.js               # Entry point
├── docs/
│   └── openapi.yaml         # Dokumentasi API
├── uploads/                 # File media (auto-created)
├── logs/                    # Log files (auto-created)
├── wa-session/              # Sesi WhatsApp (auto-created)
├── .env                     # Konfigurasi rahasia (JANGAN commit!)
├── package.json
└── README.md
```

---

## 🛠️ Prasyarat

- **Node.js** >= 18
- **MySQL** >= 8
- **yarn** atau **npm**
- (Opsional) **Redis** >= 6 untuk antrian berbasis Redis

---

## ⚡ Instalasi & Menjalankan

### 1. Clone & Install

```bash
git clone <repo-url> wa-gateway
cd wa-gateway
yarn install
```

### 2. Konfigurasi `.env`

Salin contoh dan sesuaikan nilai:

```bash
copy .env.example .env
```

**Variable wajib:**

```env
DATABASE_URL="mysql://root:rahasia@localhost:3306/wa_gateway"
JWT_SECRET="isi_dengan_string_random_minimal_32_karakter"
API_KEYS="key_rahasia_1"
```

### 3. Buat Database & Migrasi

```bash
# Buat database MySQL
mysql -u root -p -e "CREATE DATABASE wa_gateway CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Jalankan migrasi Prisma
yarn db:migrate
```

### 4. Jalankan Server

```bash
# Development (auto-reload)
yarn dev

# Production
yarn start
```

Server berjalan di: **http://localhost:3000**  
Swagger UI: **http://localhost:3000/api-docs**

---

## 🔑 Autentikasi

### A. Register & Login (JWT)

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"password123","role":"ADMIN"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

Simpan `token` dari response login untuk digunakan di header:
```
Authorization: Bearer <token>
```

### B. API Key

Gunakan header `x-api-key` dengan value dari `.env`:
```
x-api-key: key_rahasia_1
```

---

## 📱 Login WhatsApp (QR Code)

1. Buka browser, akses: **http://localhost:3000/auth/qr**  
   (gunakan Authorization: Bearer token dari login)
2. Gambar QR akan muncul di response `qrDataUrl` (base64 PNG)
3. Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR code
5. Sesi tersimpan otomatis di folder `wa-session/`

---

## 📤 Contoh Kirim Pesan

### Kirim Teks

```bash
curl -X POST http://localhost:3000/messages \
  -H "x-api-key: key_rahasia_1" \
  -H "Content-Type: application/json" \
  -d '{"to":"628123456789","content":"Halo dari WhatsApp Gateway!"}'
```

### Kirim Gambar

```bash
curl -X POST http://localhost:3000/messages \
  -H "x-api-key: key_rahasia_1" \
  -F "to=628123456789" \
  -F "caption=Ini gambar dari API" \
  -F "media=@/path/to/image.jpg"
```

---

## 🔌 WebSocket (Real-time)

Koneksi menggunakan `socket.io-client`:

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer <jwt_token>' },
});

// Pesan masuk
socket.on('message:incoming', (msg) => console.log('Pesan baru:', msg));

// Update status pesan
socket.on('message:status', (data) => console.log('Status update:', data));

// QR Code baru
socket.on('wa:qr', ({ qrDataUrl }) => console.log('QR:', qrDataUrl));

// WA terhubung
socket.on('wa:ready', ({ phone }) => console.log(`WA connected: +${phone}`));
```

**Event yang tersedia:**

| Event | Arah | Keterangan |
|-------|------|-----------|
| `wa:qr` | Server → Client | QR code baru tersedia |
| `wa:ready` | Server → Client | WhatsApp terhubung |
| `wa:authenticated` | Server → Client | Sesi terautentikasi |
| `wa:disconnected` | Server → Client | WhatsApp terputus |
| `message:incoming` | Server → Client | Pesan masuk baru |
| `message:status` | Server → Client | Status pesan berubah |

---

## 📊 Endpoint API

| Method | Path | Auth | Keterangan |
|--------|------|------|-----------|
| GET | `/status` | ❌ | Health check |
| POST | `/auth/register` | ❌ | Registrasi user |
| POST | `/auth/login` | ❌ | Login |
| GET | `/auth/me` | JWT | Profil user |
| GET | `/auth/qr` | JWT+Admin | QR Code WA |
| GET | `/auth/wa-status` | JWT | Status WA |
| POST | `/messages` | JWT/APIKey | Kirim pesan |
| GET | `/messages` | JWT | List pesan |
| GET | `/messages/:id` | JWT | Detail pesan |
| DELETE | `/messages/:id` | JWT | Hapus pesan |
| GET | `/reports/summary` | JWT | Statistik |
| GET | `/reports/daily` | JWT | Data harian |
| GET | `/reports/failed` | JWT | Pesan gagal |

> 📄 Dokumentasi lengkap: **http://localhost:3000/api-docs**

---

## 🖥️ PM2 (Production)

```bash
npm install -g pm2

# Jalankan
pm2 start src/app.js --name wa-gateway

# Auto-start saat reboot
pm2 startup
pm2 save

# Monitor
pm2 monit
pm2 logs wa-gateway
```

---

## 🗄️ Database

```bash
# Jalankan migrasi
yarn db:migrate

# Buka GUI Prisma Studio
yarn db:studio

# Generate ulang Prisma Client (setelah ubah schema)
yarn db:generate
```

---

## 📋 Catatan Keamanan

- ⚠️ **Jangan commit `.env`** ke git
- ⚠️ **Ganti `JWT_SECRET`** dengan string random yang kuat (min 32 karakter)
- ⚠️ **Ganti `API_KEYS`** dengan key yang unik dan rahasia
- ⚠️ Folder `wa-session/` berisi data sesi WhatsApp — backup secara berkala
- ⚠️ Gunakan **HTTPS** di production (reverse proxy dengan Nginx + Let's Encrypt)

---

## 📝 Lisensi

MIT License
