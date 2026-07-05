const p = require('../src/config/prisma');
p.user.update({ where: { email: 'admin@example.com' }, data: { role: 'ADMIN' } })
  .then((u) => console.log('✅ Role diupdate ke ADMIN:', u.email))
  .finally(() => p.$disconnect());
