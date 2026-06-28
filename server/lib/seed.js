// seed.js — Populates the database with demo accounts on first run.

const bcrypt = require('bcryptjs');
const { prisma } = require('./prisma');

async function seed() {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount > 0) return;

  await prisma.user.createMany({
    data: [
      {
        id: 'admin-001',
        name: 'Administrator',
        email: 'admin@school.edu',
        passwordHash: bcrypt.hashSync('admin123', 10),
        role: 'ADMIN'
      },
      {
        id: 'user-001',
        name: 'Madeline Fredrick',
        email: 'madelinefredrick@gmail.com',
        passwordHash: bcrypt.hashSync('student123', 10),
        role: 'USER'
      },
      {
        id: 'user-002',
        name: 'Jordan Lee',
        email: 'student2@school.edu',
        passwordHash: bcrypt.hashSync('student123', 10),
        role: 'USER'
      }
    ],
    skipDuplicates: true
  });

  await prisma.auditLog.create({
    data: {
      action: 'DATA_MIGRATED',
      targetType: 'seed',
      metadata: { seededDemoAccounts: true }
    }
  });

  console.log('  Admin account:   admin@school.edu   / admin123');
  console.log('  Demo student:    madelinefredrick@gmail.com / student123');
}

module.exports = seed;
