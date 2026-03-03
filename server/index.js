const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Make sure uploads/ and data/ folders exist before anything else
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Seed the database with starter data on first run
const seed = require('./lib/seed');
console.log('\n📦 Checking seed data...');
seed();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'fbla-lost-found-2026-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,          // set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000  // stay logged in for 7 days
  }
}));

// Serve uploaded photos as static files at /uploads/filename.jpg
app.use('/uploads', express.static(uploadsDir));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/items',         require('./routes/items'));
app.use('/api/missing-items', require('./routes/missingItems'));
app.use('/api/claims',        require('./routes/claims'));
app.use('/api/admin',         require('./routes/admin'));

// ── Frontend ──────────────────────────────────────────────────────────────────
// Serve the public/ folder as static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, '../public')));

// For any URL that doesn't match an API route or a real file,
// send back index.html so the browser doesn't get a 404
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔍 School Lost & Found is running!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
