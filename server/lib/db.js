// db.js — JSON file helpers (our lightweight "database")
//
// Instead of a full database like MySQL or MongoDB, we store all data in plain
// JSON files inside the data/ directory. This makes the project easy to run
// without any extra setup — Node's built-in fs module handles everything.
//
// Every collection (users, items, claims, etc.) is one JSON file containing
// an array of objects. readJSON loads it into memory; writeJSON saves it back.

const fs = require('fs');
const path = require('path');

// DATA_DIR can be overridden by an environment variable so the test suite
// can point at a separate temporary folder without touching real data.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '../../data');

// Make sure the data directory exists when this module first loads.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// readJSON — load a JSON file and return its contents as a JavaScript array.
// Returns an empty array [] if the file doesn't exist yet (first run). Malformed
// JSON fails loudly so bad data cannot be silently treated as an empty database.
function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new Error(`Could not read ${filename}: ${err.message}`);
  }
}

// writeJSON — save a JavaScript array back to a JSON file.
// We use JSON.stringify with indentation (null, 2) so the files are
// human-readable when opened directly, which helps with debugging.
function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

module.exports = { readJSON, writeJSON };
