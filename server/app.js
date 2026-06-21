require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

let cachedSessionStore;

function ensureLocalDirectories() {
  if (process.env.VERCEL === '1') return;
  for (const dir of ['../uploads', '../data']) {
    const fullPath = path.join(__dirname, dir);
    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
  }
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-session-secret-change-me';
  console.warn('  Warning: SESSION_SECRET is not set. Using a development-only fallback.');
  return 'dev-only-session-secret-change-me-before-deploying';
}

function shouldUseDatabaseSsl() {
  if (process.env.PGSSLMODE === 'require') return true;
  const url = process.env.DATABASE_URL || '';
  return /(vercel|neon|supabase|amazonaws|render|railway)/i.test(url);
}

function createSessionStore() {
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

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

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

  app.get('/uploads/:filename', require('./routes/uploadProxy'));

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
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  });

  app.use(express.static(path.join(__dirname, '../public')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
