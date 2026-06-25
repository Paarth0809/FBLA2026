require('dotenv').config();

// Central Express app factory. Keeping this separate from server/index.js lets
// local Node, Vercel serverless, and tests all boot the exact same app stack.
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// The Postgres session store owns a connection pool, so cache it across app
// creation in tests/serverless warm starts instead of opening duplicate pools.
let cachedSessionStore;

function ensureLocalDirectories() {
  // Vercel has a read-only deployment filesystem; local dev still needs these
  // folders for fallback uploads and legacy data-migration tooling.
  if (process.env.VERCEL === '1') return;
  for (const dir of ['../uploads', '../data']) {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
  }
}

function getSessionSecret() {
  // Sessions protect login state, so production must provide a real secret.
  // Tests/dev get deterministic fallbacks to keep local setup lightweight.
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-session-secret-change-me';
  console.warn('  Warning: SESSION_SECRET is not set. Using a development-only fallback.');
  return 'dev-only-session-secret-change-me-before-deploying';
}

function shouldUseDatabaseSsl() {
  // Hosted Postgres providers generally require TLS, while local Postgres
  // normally does not. This heuristic keeps both paths working without code
  // changes between local demo and Vercel.
  if (process.env.PGSSLMODE === 'require') return true;
  const url = process.env.DATABASE_URL || '';
  return /(vercel|neon|supabase|amazonaws|render|railway)/i.test(url);
}

function createSessionStore() {
  // Postgres-backed sessions make logins survive server restarts and Vercel
  // function instances. If unavailable, express-session falls back to memory
  // for local-only development.
  if (process.env.SESSION_STORE !== 'postgres' || !process.env.DATABASE_URL) {
    return undefined;
  }
  if (cachedSessionStore) return cachedSessionStore;

  const pgSession = require('connect-pg-simple')(session);
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseDatabaseSsl() ? { rejectUnauthorized: false } : undefined
  });

  cachedSessionStore = new pgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  });
  return cachedSessionStore;
}

function createApp() {
  ensureLocalDirectories();

  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  // Required behind Vercel/proxies so secure cookies and protocol-aware URLs
  // are interpreted correctly.
  app.set('trust proxy', 1);

  // Helmet provides baseline security headers. CSP is intentionally disabled
  // because this project serves rich local WebGL/Three.js assets and inline
  // legacy scripts during the FBLA demo.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  // A broad API limiter protects auth/report/admin routes from accidental
  // repeated submissions while keeping tests unconstrained.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 10000 : 600,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    store: createSessionStore(),
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    name: 'glhs.sid',
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  app.use((req, res, next) => {
    // Lightweight CSRF guard: browser-mutating requests must come from the
    // same host. This keeps forms simple while blocking cross-site posts.
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

  // Uploads are not exposed as a raw directory. The proxy validates filenames
  // and can redirect to Vercel Blob when production storage is enabled.
  app.get('/uploads/:filename', require('./routes/uploadProxy'));

  // API routes stay grouped by domain so permissions, privacy rules, and tests
  // can reason about each workflow independently.
  app.use('/api', apiLimiter);
  app.use('/api/auth',          require('./routes/auth'));
  app.use('/api/items',         require('./routes/items'));
  app.use('/api/missing-items', require('./routes/missingItems'));
  app.use('/api/claims',        require('./routes/claims'));
  app.use('/api/admin',         require('./routes/admin'));
  app.use('/api/messages',      require('./routes/messages'));
  app.use('/api/matches',       require('./routes/matches'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/gatorbot',      require('./routes/gatorbot'));

  app.use('/api', (err, req, res, next) => {
    // Keep unexpected details out of API responses while still logging enough
    // for local debugging.
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  app.use(express.static(path.join(__dirname, '../public')));

  app.get('*', (req, res) => {
    // Static multipage fallback: unknown browser routes land on the homepage
    // instead of exposing Express internals.
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
