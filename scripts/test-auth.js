/**
 * scripts/test-auth.js
 * Test: login → ambil token → GET /auth/me
 */
'use strict';

const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const BASE = { hostname: 'localhost', port: 3000 };

  // ── 1. Login ──────────────────────────────────────────────────────────────
  console.log('1️⃣  POST /auth/login...');
  const loginPayload = JSON.stringify({ email: 'admin@example.com', password: 'password123' });
  const loginRes = await request({
    ...BASE,
    path: '/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginPayload) },
  }, loginPayload);

  if (!loginRes.body.success) {
    console.error('❌ Login gagal:', loginRes.body.message);
    process.exit(1);
  }

  const token  = loginRes.body.data.token;
  const apiKey = loginRes.body.data.apiKey;
  console.log('   ✅ Login berhasil!');
  console.log('   Token  :', token.slice(0, 40) + '...');
  console.log('   API Key:', apiKey);

  // ── 2. GET /auth/me ───────────────────────────────────────────────────────
  console.log('\n2️⃣  GET /auth/me...');
  const meRes = await request({
    ...BASE,
    path: '/auth/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (meRes.body.success) {
    console.log('   ✅ /auth/me berhasil!');
    console.log('   Data:', JSON.stringify(meRes.body.data, null, 4));
  } else {
    console.error('   ❌ Gagal:', meRes.body.message);
  }

  // ── 3. GET /status ────────────────────────────────────────────────────────
  console.log('\n3️⃣  GET /status...');
  const statusRes = await request({ ...BASE, path: '/status', method: 'GET' });
  console.log('   ✅ Status:', JSON.stringify(statusRes.body.data, null, 4));

  // ── 4. GET /auth/wa-status ────────────────────────────────────────────────
  console.log('\n4️⃣  GET /auth/wa-status...');
  const waRes = await request({
    ...BASE,
    path: '/auth/wa-status',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('   WhatsApp status:', JSON.stringify(waRes.body.data, null, 4));

  console.log('\n🎉 Semua test selesai!');
  console.log('\n📋 Gunakan token ini untuk test lanjutan:');
  console.log(`   Authorization: Bearer ${token}`);
  console.log(`   x-api-key: ${apiKey}`);
}

main().catch(console.error);
