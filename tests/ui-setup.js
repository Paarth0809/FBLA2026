// ui-setup.js — starts a clean test server before the UI test suite runs
const { spawn } = require('child_process');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT     = 3002;
const DATA_DIR = path.resolve(__dirname, '../data-ui-test');
const PID_FILE = path.resolve(__dirname, '.ui-server.pid');

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

module.exports = async function globalSetup() {
  // Wipe and recreate the isolated test data folder
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Start the server on port 3002 pointed at the isolated data folder
  const server = spawn('node', ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
    stdio: 'pipe',
  });

  // Save PID so the teardown can kill it
  fs.writeFileSync(PID_FILE, String(server.pid));

  await waitForServer(PORT);
  console.log(`\n  🧪 UI test server ready on http://localhost:${PORT}\n`);
};
