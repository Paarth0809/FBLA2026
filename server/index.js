// index.js — Server entry point
// This file boots the Express application, wires up all middleware and routes,
// and starts listening for HTTP requests on port 3000.

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Create uploads/ and data/ directories if they don't already exist.
// This prevents crashes on a fresh clone where those folders aren't tracked by git.
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Seed the database with demo accounts and sample data on first run.
// seed() checks if an admin user already exists before writing anything, so it's
// safe to call every time the server starts.
const seed = require('./lib/seed');
console.log('\n📦 Checking seed data...');
seed();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────────

// Parse incoming JSON request bodies (used by our API endpoints)
app.use(express.json());

// Parse form submissions that come in as URL-encoded strings
app.use(express.urlencoded({ extended: true }));

// Session middleware — stores the logged-in user's ID and role in a server-side
// session tied to a cookie. We use this instead of JWTs to keep things simple.
app.use(session({
  secret: 'fbla-lost-found-2026-secret-key',  // used to sign the session cookie
  resave: false,            // don't re-save the session if nothing changed
  saveUninitialized: false, // don't create a session until the user logs in
  cookie: {
    httpOnly: true,         // prevents JavaScript from reading the cookie (XSS protection)
    secure: false,          // set to true in production when using HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000  // session lasts 7 days
  }
}));

// Serve uploaded item photos at /uploads/<filename> as static files.
// Multer saves files to the uploads/ folder; Express serves them directly.
app.use('/uploads', express.static(uploadsDir));

// ── API Routes ─────────────────────────────────────────────────────────────────
// Each route file handles a specific resource. The prefix is set here so the
// individual route files don't need to repeat it.

app.use('/api/auth',          require('./routes/auth'));         // signup, login, logout, delete account
app.use('/api/items',         require('./routes/items'));        // found items (public search + submit)
app.use('/api/missing-items', require('./routes/missingItems')); // missing items
app.use('/api/claims',        require('./routes/claims'));       // ownership claims on found/missing items
app.use('/api/admin',         require('./routes/admin'));        // admin-only approval/rejection actions

// ── Frontend ───────────────────────────────────────────────────────────────────
// Serve every file inside public/ (HTML, CSS, JS, images) as a static asset.
// This means http://localhost:3000/search.html just works without any extra routing.
app.use(express.static(path.join(__dirname, '../public')));

// Fallback: if the browser requests a path that isn't an API route or a real file,
// send back index.html. This handles direct navigation to pages like /search.html.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🔍 School Lost & Found is running!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
