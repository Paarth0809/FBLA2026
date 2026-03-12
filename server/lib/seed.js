// seed.js — Populates the database with demo accounts on first run
//
// This function is called once every time the server starts. It checks whether
// an admin account already exists before writing anything, so running it on an
// existing database is completely safe — nothing will be duplicated.

const bcrypt = require('bcryptjs');
const { readJSON, writeJSON } = require('./db');

function seed() {
  // ── Users ────────────────────────────────────────────────────────────────────
  let users = readJSON('users.json');

  // Only seed if no admin exists yet (i.e., this is a fresh install)
  if (!users.find(u => u.role === 'admin')) {

    // Admin account — used to approve/reject submissions and claims
    users.push({
      id: 'admin-001',
      name: 'Administrator',
      email: 'admin@school.edu',
      // bcrypt.hashSync hashes the password with a salt factor of 10.
      // We never store the plain-text password — only this hash.
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString()
    });

    // Demo student 1 — for testing the regular user workflow
    users.push({
      id: 'user-001',
      name: 'Alex Chen',
      email: 'student@school.edu',
      passwordHash: bcrypt.hashSync('student123', 10),
      role: 'user',
      createdAt: new Date().toISOString()
    });

    // Demo student 2 — useful for showing the two-student claim flow in demos
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
