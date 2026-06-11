// ui-teardown.js — kills the test server and cleans up after the UI test suite
const fs   = require('fs');
const path = require('path');

const PID_FILE = path.resolve(__dirname, '.ui-server.pid');

module.exports = async function globalTeardown() {
  // Kill the test server
  if (fs.existsSync(PID_FILE)) {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
    try { process.kill(pid); } catch { /* already gone */ }
    fs.unlinkSync(PID_FILE);
  }

  console.log('\n  🧹 UI test server stopped.\n');
};
