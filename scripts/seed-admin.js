/**
 * Script satu kali untuk mendaftarkan user admin pertama.
 * Jalankan: node scripts/seed-admin.js
 */
'use strict';

const http = require('http');

const payload = JSON.stringify({
  name: 'Admin',
  email: 'admin@example.com',
  password: 'password123',
  role: 'ADMIN',
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.success) {
      console.log('✅ Admin berhasil didaftarkan!');
      console.log('Email   :', result.data.email);
      console.log('API Key :', result.data.apiKey);
      console.log('\nSekarang login dengan:');
      console.log('  POST /auth/login  { email, password }');
    } else {
      console.log('ℹ️ ', result.message);
    }
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(payload);
req.end();
