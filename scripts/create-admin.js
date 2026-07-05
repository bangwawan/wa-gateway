/**
 * scripts/create-admin.js
 * Buat user admin langsung ke DB via Prisma (tanpa server running).
 * Jalankan: node scripts/create-admin.js
 */
'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

async function main() {
  const email    = 'admin@example.com';
  const password = 'password123';
  const name     = 'Admin';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('ℹ️  User sudah ada:');
    console.log('   Email  :', existing.email);
    console.log('   API Key:', existing.apiKey);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: hashed, role: 'ADMIN' },
  });

  console.log('✅ Admin berhasil dibuat!');
  console.log('   ID     :', user.id);
  console.log('   Email  :', user.email);
  console.log('   API Key:', user.apiKey);
  console.log('\n📌 Login dengan:');
  console.log('   POST /auth/login');
  console.log('   { "email": "admin@example.com", "password": "password123" }');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
