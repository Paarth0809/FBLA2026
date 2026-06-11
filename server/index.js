// index.js — Server entry point
// This file boots the Express application, wires up all middleware and routes,
// and starts listening for HTTP requests on port 3000.

require('dotenv').config();   // load .env settings

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
console.log('\nChecking seed data...');
seed();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-session-secret-change-me';
  console.warn('  Warning: SESSION_SECRET is not set. Using a development-only fallback.');
  return 'dev-only-session-secret-change-me-before-deploying';
}

function createSessionStore() {
  if (process.env.SESSION_STORE !== 'postgres' || !process.env.DATABASE_URL) {
    return undefined;
  }
  const pgSession = require('connect-pg-simple')(session);
  const { Pool } = require('pg');
  return new pgSession({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    tableName: 'user_sessions',
    createTableIfMissing: true
  });
}

// ── Middleware ─────────────────────────────────────────────────────────────────

app.use(helmet({
  // The current frontend is a static HTML app with inline page scripts. We keep
  // CSP disabled for this production-lite demo while preserving the rest of
  // Helmet's security headers.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false
});

// Parse incoming JSON request bodies (used by our API endpoints)
app.use(express.json());

// Parse form submissions that come in as URL-encoded strings
app.use(express.urlencoded({ extended: true }));

// Session middleware — stores the logged-in user's ID and role in a server-side
// session tied to a cookie. We use this instead of JWTs to keep things simple.
app.use(session({
  store: createSessionStore(),
  secret: getSessionSecret(),  // used to sign the session cookie
  resave: false,            // don't re-save the session if nothing changed
  saveUninitialized: false, // don't create a session until the user logs in
  name: 'glhs.sid',
  cookie: {
    httpOnly: true,         // prevents JavaScript from reading the cookie (XSS protection)
    secure: isProduction,   // set to true in production when using HTTPS
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000  // session lasts 7 days
  }
}));

// Lightweight CSRF protection for browser-originated mutations. SameSite cookies
// do most of the work locally; this rejects unsafe requests if a browser sends
// an Origin header from another site. CLI tests without Origin remain supported.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originHost = new URL(origin).host;
    if (originHost === req.get('host')) return next();
  } catch {
    // Fall through to forbidden response.
  }
  return res.status(403).json({ error: 'Request origin is not allowed.' });
});

// Serve uploaded item photos through a small controlled route rather than a raw
// directory mount. Filenames are UUID-based, and this blocks path traversal or
// accidental non-image file exposure.
app.get('/uploads/:filename', (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return res.status(404).send('Not found');
  }
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// ── API Routes ─────────────────────────────────────────────────────────────────
// Each route file handles a specific resource. The prefix is set here so the
// individual route files don't need to repeat it.

app.use('/api', apiLimiter);
app.use('/api/auth',          require('./routes/auth'));         // signup, login, logout, delete account
app.use('/api/items',         require('./routes/items'));        // found items (public search + submit)
app.use('/api/missing-items', require('./routes/missingItems')); // missing items
app.use('/api/claims',        require('./routes/claims'));       // ownership claims on found/missing items
app.use('/api/admin',         require('./routes/admin'));        // admin-only approval/rejection actions
app.use('/api/messages',      require('./routes/messages'));     // in-app messaging between finders and claimers
app.use('/api/matches',       require('./routes/matches'));      // potential item matches

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
  console.log(`\nGreen Level Lost & Found is running!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
