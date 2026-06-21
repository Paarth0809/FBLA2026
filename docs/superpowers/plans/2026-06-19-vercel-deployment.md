# Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Green Level Lost & Found to Vercel with hosted Postgres, persistent uploads, working sessions, SMTP email, OpenAI-backed GatorBot/matching, and judge-safe production behavior.

**Architecture:** Convert the current local Express app into a Vercel-compatible serverless Express handler while keeping the local `npm run dev` workflow. Move runtime state that currently depends on local disk (`uploads/`, notification JSON, user settings JSON) into hosted services: Postgres for structured data and Vercel Blob for uploaded images. Keep existing page URLs and API route shapes stable so the frontend behavior does not regress.

**Tech Stack:** Vercel Functions for Express APIs, Vercel static hosting for `public/`, Vercel Blob for uploaded images, hosted PostgreSQL for Prisma and session storage, Prisma migrate deploy, OpenAI Node SDK for GatorBot and image profiles, SMTP through existing Nodemailer settings.

## Global Constraints

- Do not commit `.env`, API keys, SMTP passwords, database credentials, Vercel tokens, Blob tokens, or generated secrets.
- Do not push directly to `main` unless explicitly asked; use a focused deployment branch.
- Preserve current public page URLs and API route names.
- Preserve the 10 MB upload limit and HEIC conversion behavior.
- Preserve GatorBot fallback behavior when OpenAI is missing, slow, or unavailable.
- Preserve local offline demo workflow where possible; Vercel live deployment is a networked production path, not a replacement for judge-day local fallback.
- Use official deployment documentation as the source of truth:
  - Vercel Express guide: https://vercel.com/docs/frameworks/backend/express
  - Vercel Blob docs: https://vercel.com/docs/vercel-blob
  - Vercel environment variables docs: https://vercel.com/docs/environment-variables
  - Prisma production migration docs: https://www.prisma.io/docs/orm/prisma-migrate/workflows/deploying-migrations

---

## File Structure

- Create `server/app.js`: exports the configured Express app without listening on a port.
- Modify `server/index.js`: keeps local development startup only: seed once, then `app.listen()`.
- Create `api/index.js`: Vercel serverless entrypoint that imports the Express app.
- Create `vercel.json`: build command, route rewrites, and function configuration.
- Modify `server/lib/photoUpload.js`: support Vercel-compatible upload handling through Blob-backed storage.
- Create `server/lib/storageProvider.js`: single interface for local disk in development and Vercel Blob in production.
- Modify `server/lib/aiProfile.js`: read image bytes/URLs through the storage provider instead of directly from `uploads/`.
- Modify `server/lib/notificationService.js`: replace local JSON notification preferences/logs with Prisma-backed records.
- Modify `server/lib/userSettingsService.js`: replace `data/user-settings.json` with Prisma-backed account settings.
- Modify `prisma/schema.prisma`: add persistent user settings, notification preferences/logs, and upload storage metadata.
- Create Prisma migration files through `npx prisma migrate dev` locally, then deploy with `npx prisma migrate deploy`.
- Modify `.env.example`: add production/Vercel placeholders only.
- Modify `README.md` and `docs/JUDGE_README.md`: document live deployment, local fallback, and judge-day commands.
- Modify tests in `tests/run.js` or split into focused backend tests if the current harness supports it.

---

### Task 1: Deployment Preflight And Secret Safety

**Files:**
- Modify: none
- Test: none

**Interfaces:**
- Consumes: current repository state.
- Produces: a clean understanding of dirty files and secret risks before deployment work starts.

- [ ] **Step 1: Create and switch to a deployment branch from current branch**

Run:
```bash
git status --short --branch
git switch -c codex/vercel-deployment
```

Expected:
```text
Switched to a new branch 'codex/vercel-deployment'
```

- [ ] **Step 2: Scan for accidentally committed secrets**

Run:
```bash
rg -n "sk-proj-|sk-[A-Za-z0-9]|OPENAI_API_KEY=.+|SMTP_PASS=.+|DATABASE_URL=postgresql://[^\\s]+:[^\\s]+@" . \
  -g '!node_modules' \
  -g '!.git' \
  -g '!data' \
  -g '!uploads'
```

Expected:
```text
No output, or only placeholder examples from .env.example.
```

- [ ] **Step 3: Confirm `.env` and runtime data are ignored**

Run:
```bash
git check-ignore -v .env data/user-settings.json data/notification-preferences.json data/notification-logs.json uploads/example.jpg || true
```

Expected:
```text
Each real local-only path should be ignored. If any local secret/runtime file is not ignored, add it to .gitignore before continuing.
```

- [ ] **Step 4: Commit only if a `.gitignore` fix was needed**

Run only if `.gitignore` changed:
```bash
git add .gitignore
git commit -m "chore: protect local deployment secrets"
```

Expected:
```text
[codex/vercel-deployment ...] chore: protect local deployment secrets
```

---

### Task 2: Split Express App From Local Server Startup

**Files:**
- Create: `server/app.js`
- Modify: `server/index.js`
- Create: `api/index.js`
- Test: `tests/run.js`

**Interfaces:**
- Consumes: current route modules under `server/routes/*`.
- Produces:
  - `const app = require('../server/app')` for Vercel.
  - `const app = require('./app')` for local `server/index.js`.

- [ ] **Step 1: Add a source-level test for serverless app export**

Add this check to the existing test harness in `tests/run.js`:
```js
test('server app module exports an Express app without starting a listener', async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  const app = require('../server/app');
  assert(app && typeof app.use === 'function', 'server/app should export an Express app');
  assert(typeof app.listen === 'function', 'exported app should still be an Express app');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:
```bash
npm test
```

Expected:
```text
Cannot find module '../server/app'
```

- [ ] **Step 3: Create `server/app.js` by moving app construction out of `server/index.js`**

Create `server/app.js` with this structure, moving the existing middleware/routes/static setup from `server/index.js` into it:
```js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
const dataDir = path.join(__dirname, '../data');
if (process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-session-secret-change-me';
  console.warn('Warning: SESSION_SECRET is not set. Using a development-only fallback.');
  return 'dev-only-session-secret-change-me-before-deploying';
}

function createSessionStore() {
  if (process.env.SESSION_STORE !== 'postgres' || !process.env.DATABASE_URL) return undefined;
  const pgSession = require('connect-pg-simple')(session);
  const { Pool } = require('pg');
  return new pgSession({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    tableName: 'user_sessions',
    createTableIfMissing: true
  });
}

function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

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
    } catch {}
    return res.status(403).json({ error: 'Request origin is not allowed.' });
  });

  app.get('/uploads/:filename', require('./routes/uploadProxy'));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: process.env.NODE_ENV === 'test' ? 10000 : 600,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/items', require('./routes/items'));
  app.use('/api/missing-items', require('./routes/missingItems'));
  app.use('/api/claims', require('./routes/claims'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/messages', require('./routes/messages'));
  app.use('/api/matches', require('./routes/matches'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/gatorbot', require('./routes/gatorbot'));

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
```

- [ ] **Step 4: Create a placeholder upload proxy route that preserves current local behavior**

Create `server/routes/uploadProxy.js`:
```js
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');

module.exports = function uploadProxy(req, res) {
  const filename = path.basename(req.params.filename || '');
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return res.status(404).send('Not found');
  }
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
};
```

- [ ] **Step 5: Reduce `server/index.js` to local startup only**

Replace `server/index.js` with:
```js
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 3000;

async function start() {
  if (process.env.SKIP_SEED_ON_START !== 'true') {
    const seed = require('./lib/seed');
    console.log('\nChecking seed data...');
    await seed();
  }

  app.listen(PORT, () => {
    console.log('\nGreen Level Lost & Found is running!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Open: http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Create Vercel API entrypoint**

Create `api/index.js`:
```js
const app = require('../server/app');

module.exports = app;
```

- [ ] **Step 7: Run static checks and tests**

Run:
```bash
node --check server/app.js
node --check server/index.js
node --check api/index.js
npm test
```

Expected:
```text
All node --check commands exit 0.
npm test passes.
```

- [ ] **Step 8: Commit**

Run:
```bash
git add server/app.js server/index.js server/routes/uploadProxy.js api/index.js tests/run.js
git commit -m "refactor: split express app for vercel"
```

---

### Task 3: Add Vercel Configuration

**Files:**
- Create: `vercel.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `api/index.js`, `public/`, Prisma generate script.
- Produces: deterministic Vercel build and routing behavior.

- [ ] **Step 1: Create `vercel.json`**

Create:
```json
{
  "version": 2,
  "buildCommand": "npm run build:css && npm run prisma:generate",
  "outputDirectory": "public",
  "functions": {
    "api/index.js": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    },
    {
      "source": "/uploads/(.*)",
      "destination": "/api/index.js"
    }
  ]
}
```

- [ ] **Step 2: Add a deployment check script**

In `package.json`, add:
```json
"deploy:check": "npm run prisma:validate && npm run prisma:generate && node --check server/app.js && node --check api/index.js && npm test"
```

- [ ] **Step 3: Run deployment check**

Run:
```bash
npm run deploy:check
```

Expected:
```text
Prisma validates, Prisma Client generates, static checks pass, and npm test passes.
```

- [ ] **Step 4: Commit**

Run:
```bash
git add vercel.json package.json package-lock.json
git commit -m "chore: add vercel deployment config"
```

---

### Task 4: Move Account Settings And Notifications To Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `server/lib/userSettingsService.js`
- Modify: `server/lib/notificationService.js`
- Modify: `tests/run.js`

**Interfaces:**
- Consumes: current `User` model.
- Produces:
  - `UserSettings` row per user.
  - `NotificationPreference` row per user.
  - `NotificationLog` rows for notification history.

- [ ] **Step 1: Add Prisma models**

In `prisma/schema.prisma`, add:
```prisma
model UserSettings {
  id                   String   @id @default(uuid())
  userId               String   @unique
  preferredLanguage    String   @default("en")
  dyslexicFontEnabled  Boolean  @default(false)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model NotificationPreference {
  id             String   @id @default(uuid())
  userId         String   @unique
  emailEnabled   Boolean  @default(true)
  matchAlerts    Boolean  @default(true)
  claimAlerts    Boolean  @default(true)
  messageAlerts  Boolean  @default(true)
  statusAlerts   Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model NotificationLog {
  id          String   @id @default(uuid())
  userId      String?
  email       String?
  type        String
  subject     String
  status      String
  error       String?
  metadata    Json?
  createdAt   DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
}
```

Also add relation fields to `User`:
```prisma
settings                UserSettings?
notificationPreference  NotificationPreference?
notificationLogs        NotificationLog[]
```

- [ ] **Step 2: Create and apply a local migration**

Run:
```bash
npx prisma migrate dev --name add_user_settings_notifications
```

Expected:
```text
The migration applies locally and Prisma Client regenerates.
```

- [ ] **Step 3: Refactor `server/lib/userSettingsService.js`**

Replace JSON file reads/writes with Prisma upsert:
```js
const prisma = require('./prisma');

const DEFAULT_SETTINGS = {
  preferredLanguage: 'en',
  dyslexicFontEnabled: false
};

const SUPPORTED_LANGUAGES = new Set([
  'en', 'es', 'zh', 'fr', 'de', 'vi', 'ar', 'ko', 'hi', 'gu', 'tl', 'ru', 'ja',
  'te', 'ta', 'ur', 'ne', 'mr', 'el'
]);

function normalizeSettings(input = {}) {
  const preferredLanguage = SUPPORTED_LANGUAGES.has(input.preferredLanguage)
    ? input.preferredLanguage
    : DEFAULT_SETTINGS.preferredLanguage;
  return {
    preferredLanguage,
    dyslexicFontEnabled: input.dyslexicFontEnabled === true
  };
}

async function getSettings(userId) {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  return existing ? normalizeSettings(existing) : { ...DEFAULT_SETTINGS };
}

async function saveSettings(userId, input) {
  const data = normalizeSettings(input);
  const saved = await prisma.userSettings.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data }
  });
  return normalizeSettings(saved);
}

module.exports = {
  DEFAULT_SETTINGS,
  normalizeSettings,
  getSettings,
  saveSettings
};
```

- [ ] **Step 4: Refactor `server/lib/notificationService.js`**

Keep the existing SMTP dispatch code, but replace local log/preference file functions:
```js
const prisma = require('./prisma');

async function getPreferences(userId) {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  return existing || {
    emailEnabled: true,
    matchAlerts: true,
    claimAlerts: true,
    messageAlerts: true,
    statusAlerts: true
  };
}

async function savePreferences(userId, input) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    update: {
      emailEnabled: input.emailEnabled !== false,
      matchAlerts: input.matchAlerts !== false,
      claimAlerts: input.claimAlerts !== false,
      messageAlerts: input.messageAlerts !== false,
      statusAlerts: input.statusAlerts !== false
    },
    create: {
      userId,
      emailEnabled: input.emailEnabled !== false,
      matchAlerts: input.matchAlerts !== false,
      claimAlerts: input.claimAlerts !== false,
      messageAlerts: input.messageAlerts !== false,
      statusAlerts: input.statusAlerts !== false
    }
  });
}

async function appendLog(log) {
  return prisma.notificationLog.create({
    data: {
      userId: log.userId || null,
      email: log.email || null,
      type: log.type || 'general',
      subject: log.subject || 'Notification',
      status: log.status || 'sent',
      error: log.error || null,
      metadata: log.metadata || {}
    }
  });
}

async function getLogs(userId) {
  return prisma.notificationLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
}
```

- [ ] **Step 5: Update tests for settings/notification persistence**

Add tests that:
```js
test('account settings persist in Prisma', async () => {
  const user = await createTestUser();
  await request(app)
    .post('/api/auth/settings')
    .set('Cookie', user.cookie)
    .send({ preferredLanguage: 'es', dyslexicFontEnabled: true })
    .expect(200);

  const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  assert.equal(row.preferredLanguage, 'es');
  assert.equal(row.dyslexicFontEnabled, true);
});

test('notification preferences persist in Prisma', async () => {
  const user = await createTestUser();
  await request(app)
    .post('/api/notifications/preferences')
    .set('Cookie', user.cookie)
    .send({ emailEnabled: false, matchAlerts: true })
    .expect(200);

  const row = await prisma.notificationPreference.findUnique({ where: { userId: user.id } });
  assert.equal(row.emailEnabled, false);
  assert.equal(row.matchAlerts, true);
});
```

- [ ] **Step 6: Run checks**

Run:
```bash
npx prisma validate
node --check server/lib/userSettingsService.js
node --check server/lib/notificationService.js
npm test
```

Expected:
```text
All checks pass.
```

- [ ] **Step 7: Commit**

Run:
```bash
git add prisma/schema.prisma prisma/migrations server/lib/userSettingsService.js server/lib/notificationService.js tests/run.js
git commit -m "feat: persist settings and notifications in postgres"
```

---

### Task 5: Add Persistent Upload Storage With Vercel Blob

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Create: `server/lib/storageProvider.js`
- Modify: `server/lib/photoUpload.js`
- Modify: `server/routes/uploadProxy.js`
- Modify: `server/lib/aiProfile.js`
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `UploadedAsset`, current `photo` filename fields on items.
- Produces:
  - `storageProvider.putImage({ buffer, originalName, contentType })`
  - `storageProvider.getImageBuffer(assetOrFilename)`
  - `/uploads/:filename` remains backwards-compatible.

- [ ] **Step 1: Install Vercel Blob**

Run:
```bash
npm install @vercel/blob
```

Expected:
```text
package.json and package-lock.json include @vercel/blob.
```

- [ ] **Step 2: Extend uploaded asset metadata**

In `prisma/schema.prisma`, add these fields to `UploadedAsset`:
```prisma
storageProvider String @default("local")
storageKey      String?
publicUrl       String?
contentType     String?
```

Run:
```bash
npx prisma migrate dev --name add_upload_storage_metadata
```

- [ ] **Step 3: Create storage provider module**

Create `server/lib/storageProvider.js`:
```js
const fs = require('fs/promises');
const path = require('path');
const { put, del } = require('@vercel/blob');
const { v4: uuidv4 } = require('uuid');

const uploadsDir = path.join(__dirname, '../../uploads');

function extensionFromContentType(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

function useBlob() {
  return process.env.STORAGE_PROVIDER === 'vercel-blob' && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function putImage({ buffer, contentType }) {
  const filename = `${uuidv4()}.${extensionFromContentType(contentType)}`;
  if (useBlob()) {
    const blob = await put(`uploads/${filename}`, buffer, {
      access: 'public',
      contentType
    });
    return {
      filename,
      storageProvider: 'vercel-blob',
      storageKey: blob.pathname,
      publicUrl: blob.url,
      contentType
    };
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, filename), buffer);
  return {
    filename,
    storageProvider: 'local',
    storageKey: filename,
    publicUrl: `/uploads/${filename}`,
    contentType
  };
}

async function getLocalImageBuffer(filename) {
  return fs.readFile(path.join(uploadsDir, path.basename(filename)));
}

async function deleteImage(asset) {
  if (asset?.storageProvider === 'vercel-blob' && asset.storageKey) {
    await del(asset.storageKey);
    return;
  }
  if (asset?.storedName) {
    await fs.unlink(path.join(uploadsDir, path.basename(asset.storedName))).catch(() => {});
  }
}

module.exports = {
  putImage,
  getLocalImageBuffer,
  deleteImage,
  useBlob
};
```

- [ ] **Step 4: Convert uploads to memory storage**

In `server/lib/photoUpload.js`, replace disk storage with `multer.memoryStorage()` and keep validation:
```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});
```

Update HEIC conversion to convert `req.file.buffer` in memory and store through `storageProvider.putImage()`. Ensure route handlers receive:
```js
req.processedUpload = {
  filename,
  originalName,
  mimeType,
  size,
  storageProvider,
  storageKey,
  publicUrl
};
```

- [ ] **Step 5: Preserve `/uploads/:filename` route**

In `server/routes/uploadProxy.js`, if an `UploadedAsset` row has `publicUrl`, redirect:
```js
const prisma = require('../lib/prisma');

module.exports = async function uploadProxy(req, res) {
  const filename = path.basename(req.params.filename || '');
  const asset = await prisma.uploadedAsset.findFirst({ where: { storedName: filename } });
  if (asset?.publicUrl) return res.redirect(302, asset.publicUrl);
  // Keep local fallback from Task 2 here.
};
```

- [ ] **Step 6: Update AI profile image reads**

In `server/lib/aiProfile.js`, replace direct `fs.readFile(path.join(...uploads...))` with:
```js
const prisma = require('./prisma');
const storageProvider = require('./storageProvider');

async function getPhotoBuffer(item) {
  const asset = await prisma.uploadedAsset.findFirst({ where: { storedName: item.photo } });
  if (asset?.publicUrl) {
    const response = await fetch(asset.publicUrl);
    if (!response.ok) throw new Error(`Unable to fetch uploaded image: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return storageProvider.getLocalImageBuffer(item.photo);
}
```

- [ ] **Step 7: Add upload persistence tests**

Add tests that submit a found item with an image and assert:
```js
assert.equal(asset.storageProvider, process.env.STORAGE_PROVIDER || 'local');
assert(asset.storedName.endsWith('.jpg') || asset.storedName.endsWith('.png') || asset.storedName.endsWith('.webp'));
```

- [ ] **Step 8: Run checks**

Run:
```bash
npx prisma validate
node --check server/lib/storageProvider.js
node --check server/lib/photoUpload.js
node --check server/routes/uploadProxy.js
node --check server/lib/aiProfile.js
npm test
```

- [ ] **Step 9: Commit**

Run:
```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations server/lib/storageProvider.js server/lib/photoUpload.js server/routes/uploadProxy.js server/lib/aiProfile.js tests/run.js
git commit -m "feat: support persistent upload storage"
```

---

### Task 6: Production Environment Variables

**Files:**
- Modify: `.env.example`
- Modify: `docs/JUDGE_README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Vercel project settings.
- Produces: documented env contract for local and production.

- [ ] **Step 1: Update `.env.example`**

Add this production section:
```env
# Production/Vercel
NODE_ENV=production
APP_BASE_URL=https://your-vercel-project.vercel.app

# Hosted PostgreSQL
DATABASE_URL=
SESSION_STORE=postgres
SESSION_SECRET=

# Persistent uploads
STORAGE_PROVIDER=vercel-blob
BLOB_READ_WRITE_TOKEN=

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_GATORBOT_MODEL=gpt-5.4-mini
OPENAI_AI_PROFILE_MODEL=gpt-5.4-mini
OPENAI_TIMEOUT_MS=6500
GATORBOT_AI_ENABLED=true
AI_MATCHING_ENABLED=true

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=Green Level Lost & Found
```

- [ ] **Step 2: Add Vercel env setup commands to docs**

Add this command block to `docs/JUDGE_README.md`:
```bash
vercel env add DATABASE_URL production
vercel env add SESSION_STORE production
vercel env add SESSION_SECRET production
vercel env add STORAGE_PROVIDER production
vercel env add BLOB_READ_WRITE_TOKEN production
vercel env add OPENAI_API_KEY production
vercel env add GATORBOT_AI_ENABLED production
vercel env add AI_MATCHING_ENABLED production
vercel env add SMTP_HOST production
vercel env add SMTP_PORT production
vercel env add SMTP_SECURE production
vercel env add SMTP_USER production
vercel env add SMTP_PASS production
vercel env add SMTP_FROM_EMAIL production
vercel env add SMTP_FROM_NAME production
```

- [ ] **Step 3: Run docs check**

Run:
```bash
git diff --check .env.example README.md docs/JUDGE_README.md
```

- [ ] **Step 4: Commit**

Run:
```bash
git add .env.example README.md docs/JUDGE_README.md
git commit -m "docs: document vercel environment"
```

---

### Task 7: Hosted Postgres And Migration Deployment

**Files:**
- Modify: none unless docs corrections are needed

**Interfaces:**
- Consumes: Vercel Postgres/Neon/Supabase production `DATABASE_URL`.
- Produces: migrated hosted production database.

- [ ] **Step 1: Create hosted Postgres**

Use one of these:
```text
Recommended for Vercel: Vercel Marketplace Neon Postgres or Vercel Postgres if available in the account.
Acceptable: Supabase Postgres with pooled connection string.
```

Production `DATABASE_URL` must be a hosted Postgres URL, not `localhost`.

- [ ] **Step 2: Add production database URL**

Run:
```bash
vercel env add DATABASE_URL production
vercel env add SESSION_STORE production
```

Use:
```text
SESSION_STORE=postgres
```

- [ ] **Step 3: Deploy Prisma migrations to hosted DB from local machine**

Run with production env loaded locally or pasted into a one-shot shell:
```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public" npx prisma migrate deploy
```

Expected:
```text
All migrations have been successfully applied.
```

- [ ] **Step 4: Seed production demo data intentionally**

Run only after confirming seed data is judge-safe:
```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public" node server/lib/seed.js
```

Expected:
```text
Demo accounts/items are created or confirmed without duplicating unsafe data.
```

- [ ] **Step 5: Verify production DB connection**

Run:
```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB?schema=public" node scripts/verify-local-postgres.js
```

If that script assumes local hostnames, create `scripts/verify-database-url.js`:
```js
require('dotenv').config();
const prisma = require('../server/lib/prisma');

async function main() {
  const count = await prisma.user.count();
  console.log(`Database reachable. Users: ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
```

- [ ] **Step 6: Commit verification script if created**

Run only if a new script was needed:
```bash
git add scripts/verify-database-url.js package.json
git commit -m "chore: add hosted database verification"
```

---

### Task 8: Deploy Preview And Production On Vercel

**Files:**
- Modify: none unless deployment reveals a config bug

**Interfaces:**
- Consumes: committed deployment branch.
- Produces: Vercel preview URL and production URL.

- [ ] **Step 1: Install/login/link Vercel CLI**

Run:
```bash
npm install -g vercel
vercel login
vercel link
```

Expected:
```text
Project linked to a Vercel project.
```

- [ ] **Step 2: Add preview env vars too**

Run:
```bash
vercel env pull .env.vercel.local
```

Do not commit `.env.vercel.local`.

- [ ] **Step 3: Run local Vercel simulation**

Run:
```bash
vercel dev
```

Manual checks:
```text
Open http://localhost:3000
Check /api/auth/account
Check /search.html
Submit a small test report with image
Open /uploads/<filename>
```

- [ ] **Step 4: Deploy preview**

Run:
```bash
vercel deploy
```

Expected:
```text
Vercel prints a preview URL.
```

- [ ] **Step 5: Run preview smoke checks**

Open preview URL and verify:
```text
Public homepage loads.
GatorBot opens and answers fallback/basic questions.
Search Items loads approved items.
Report Found requires login.
Login works.
Photo upload works and image survives refresh.
Campus Map loads.
```

- [ ] **Step 6: Deploy production**

Run:
```bash
vercel --prod
```

Expected:
```text
Production URL is live.
```

---

### Task 9: Production Security And Privacy QA

**Files:**
- Modify: tests only if gaps are found
- Test: `tests/run.js`

**Interfaces:**
- Consumes: production-like app config.
- Produces: confidence that judge/live deployment does not leak private data.

- [ ] **Step 1: Run local production-mode tests**

Run:
```bash
NODE_ENV=production npm test
```

Expected:
```text
Tests pass or test-only session-cookie expectations are explicitly adjusted.
```

- [ ] **Step 2: Verify public APIs do not leak emails**

Use production preview URL:
```bash
curl -s https://YOUR-PREVIEW.vercel.app/api/items | rg -i "email|@"
curl -s https://YOUR-PREVIEW.vercel.app/api/missing-items | rg -i "email|@"
```

Expected:
```text
No private contact emails in public responses.
```

- [ ] **Step 3: Verify protected routes reject anonymous users**

Run:
```bash
curl -i https://YOUR-PREVIEW.vercel.app/api/items/mine
curl -i https://YOUR-PREVIEW.vercel.app/api/admin/items
```

Expected:
```text
401 or 403 responses.
```

- [ ] **Step 4: Verify session cookies are secure**

Login from browser DevTools and confirm:
```text
Cookie name: glhs.sid
HttpOnly: true
Secure: true on Vercel
SameSite: Lax
```

- [ ] **Step 5: Commit any test hardening**

Run only if tests changed:
```bash
git add tests/run.js
git commit -m "test: cover production deployment privacy"
```

---

### Task 10: Full Live App QA Checklist

**Files:**
- Modify: `docs/JUDGE_README.md`

**Interfaces:**
- Consumes: production URL.
- Produces: judge-demo checklist with fallback plan.

- [ ] **Step 1: Add live QA matrix to `docs/JUDGE_README.md`**

Add:
```markdown
## Live Vercel QA Matrix

- [ ] Homepage loads on production URL.
- [ ] GatorBot opens only when clicked and answers website questions.
- [ ] Search Items loads approved found items.
- [ ] Missing Items page loads.
- [ ] Signup creates a student user.
- [ ] Login persists after refresh.
- [ ] Report Found submits with photo and optional map pin.
- [ ] HEIC upload converts successfully.
- [ ] Uploaded image displays after refresh and after redeploy.
- [ ] Report Missing submits.
- [ ] My Submissions loads all tabs.
- [ ] Claim flow submits proof of ownership.
- [ ] Messages send/reply/delete for authorized users.
- [ ] Admin approves/rejects/deletes items.
- [ ] Approved found items appear as campus map pins.
- [ ] Password reset sends SMTP email.
- [ ] AI matching can be demonstrated with `AI_MATCHING_ENABLED=true`.
- [ ] Local fallback demo still runs on localhost with local Postgres.
```

- [ ] **Step 2: Run automated checks before final production demo**

Run:
```bash
npm run deploy:check
npm run test:ui
```

Expected:
```text
Backend tests pass. UI tests pass or documented browser/WebGL exceptions are listed in JUDGE_README.
```

- [ ] **Step 3: Commit docs**

Run:
```bash
git add docs/JUDGE_README.md
git commit -m "docs: add live deployment qa checklist"
```

---

## Deployment Risks And Decisions

- **Local disk is not production storage.** Vercel functions may have ephemeral filesystem behavior. Uploaded photos, HEIC conversions, and AI profile image reads need Blob/object storage.
- **Local JSON is not production persistence.** `data/user-settings.json`, notification preferences, and notification logs need Prisma-backed persistence.
- **Server startup cannot run forever.** Vercel needs an exported handler. Local `app.listen()` belongs in `server/index.js`, not the serverless entrypoint.
- **Seeding on every serverless invocation is unsafe.** Seed production intentionally with a one-time command.
- **Rate limiting in memory is not global in serverless.** The current limiter is acceptable for a judge demo, but serious production rate limiting should move to Vercel WAF, Upstash Redis, or provider-level protection.
- **Live demo still depends on Wi-Fi.** Keep the local Postgres/offline demo path ready for judges in case the venue network fails.

## Self-Review

- Spec coverage: The plan covers Vercel serverless entrypoint, hosted Postgres, Prisma migrations, persistent uploads, env vars, OpenAI/GatorBot/matching, SMTP, privacy checks, production QA, and judge fallback.
- Placeholder scan: No `TBD`, `TODO`, or “implement later” placeholders are used. Each task has concrete files, commands, and expected behavior.
- Type consistency: Storage provider names and environment variables are consistent across tasks: `STORAGE_PROVIDER=vercel-blob`, `BLOB_READ_WRITE_TOKEN`, `SESSION_STORE=postgres`, `OPENAI_API_KEY`, and `AI_MATCHING_ENABLED`.
