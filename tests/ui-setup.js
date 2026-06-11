// ui-setup.js — starts a clean test server before the UI test suite runs
const { exec, spawn } = require('child_process');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const PORT     = 3002;
const PID_FILE = path.resolve(__dirname, '.ui-server.pid');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for UI tests.');

// Poll until the server responds on the given port
function waitForServer(port, attempts = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      http.get(`http://localhost:${port}/api/auth/me`, () => resolve())
        .on('error', () => {
          if (++tries >= attempts) return reject(new Error('Server did not start in time.'));
          setTimeout(check, 300);
        });
    };
    check();
  });
}

function runCommand(command, env = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: path.resolve(__dirname, '..'), env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) {
        error.message += `\n${stdout}\n${stderr}`;
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function resetDatabase() {
  await runCommand('npx prisma migrate deploy', { DATABASE_URL: TEST_DATABASE_URL });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL })
  });
  try {
    await prisma.message.deleteMany();
    await prisma.claim.deleteMany();
    await prisma.foundItem.deleteMany();
    await prisma.missingItem.deleteMany();
    await prisma.uploadedAsset.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = async function globalSetup() {
  await resetDatabase();

  const server = spawn('node', ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_STORE: 'postgres',
      SESSION_SECRET: 'test-session-secret-change-me'
    },
    stdio: 'pipe',
  });

  // Save PID so the teardown can kill it
  fs.writeFileSync(PID_FILE, String(server.pid));

  await waitForServer(PORT);
  console.log(`\n  🧪 UI test server ready on http://localhost:${PORT}\n`);
};
