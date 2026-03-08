// seed.js — Creates starter data when the server runs for the first time
const bcrypt = require('bcryptjs');
const { readJSON, writeJSON } = require('./db');

function seed() {
  // ── Users ──────────────────────────────────────────────────────────────────
  let users = readJSON('users.json');
  if (!users.find(u => u.role === 'admin')) {
    users.push({
      id: 'admin-001',
      name: 'Administrator',
      email: 'admin@school.edu',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    users.push({
      id: 'user-001',
      name: 'Alex Chen',
      email: 'student@school.edu',
      passwordHash: bcrypt.hashSync('student123', 10),
      role: 'user',
      createdAt: new Date().toISOString()
    });
    users.push({
      id: 'user-002',
      name: 'Jordan Lee',
      email: 'student2@school.edu',
      passwordHash: bcrypt.hashSync('student123', 10),
      role: 'user',
      createdAt: new Date().toISOString()
    });
    writeJSON('users.json', users);
    console.log('  ✓ Admin account:   admin@school.edu   / admin123');
    console.log('  ✓ Demo student:    student@school.edu / student123');
  }

}

module.exports = seed;
