// db.js — Simple JSON file helpers (our "database")
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

// Make sure the data folder exists when this module loads
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Read a JSON file, returning [] if it doesn't exist yet
function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

// Write data to a JSON file (pretty-printed so it's readable)
function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { readJSON, writeJSON };
