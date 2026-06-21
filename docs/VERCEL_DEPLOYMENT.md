# Vercel Deployment Runbook

This app is Vercel-ready through `api/index.js`, `server/app.js`, `vercel.json`, Prisma migrations, Postgres sessions, and Vercel Blob uploads.

## Required Services

- **Vercel project** for hosting.
- **Hosted Postgres** such as Neon, Supabase, Vercel Postgres, or another Postgres database.
- **Vercel Blob** for uploaded photos, because Vercel serverless functions do not keep local disk files between deployments.

## Required Vercel Environment Variables

Set these in the Vercel project dashboard for Production, Preview, and Development as needed:

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=use-a-long-random-secret
SESSION_STORE=postgres
PUBLIC_APP_URL=https://your-vercel-domain.vercel.app

UPLOAD_STORAGE=vercel-blob
BLOB_READ_WRITE_TOKEN=vercel-blob-token

AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_GATORBOT_MODEL=gpt-5.4-mini
OPENAI_AI_PROFILE_MODEL=gpt-5.4-mini
OPENAI_TIMEOUT_MS=6500
GATORBOT_AI_ENABLED=true
AI_MATCHING_ENABLED=false
```

Optional email delivery:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Green Level Lost & Found
```

Do not commit real `.env` files, API keys, SMTP passwords, Blob tokens, or database credentials.

## Build And Migration Behavior

Vercel runs:

```bash
npm run vercel:build
```

That command runs:

```bash
npm run build:css
npm run prisma:deploy
npm run prisma:generate
```

`prisma migrate deploy` applies checked-in migrations to the hosted Postgres database. It does not use the local `migrate dev` shadow database flow, so it is the correct command for Vercel.

The Postgres session table is managed by `connect-pg-simple` at runtime. It is intentionally not part of the Prisma schema.

## Existing Upload Migration

New uploads on Vercel go straight to Vercel Blob. Existing local uploaded files under `uploads/` can be copied into Blob and linked back to database rows:

```bash
npm run uploads:migrate-blob -- --dry-run
npm run uploads:migrate-blob
```

Run this from a machine that has:

- access to the target `DATABASE_URL`,
- `BLOB_READ_WRITE_TOKEN`,
- the local `uploads/` folder containing the files.

The script updates `UploadedAsset.storageProvider`, `storageKey`, `publicUrl`, and `contentType`.

## Local Verification Before Deploy

```bash
npm run deploy:check
npm test
```

Optional local production-style build check:

```bash
npm run vercel:build
```

## Deploy Commands

```bash
npx vercel login
npx vercel link
npx vercel env add DATABASE_URL production
npx vercel env add SESSION_SECRET production
npx vercel env add SESSION_STORE production
npx vercel env add PUBLIC_APP_URL production
npx vercel env add UPLOAD_STORAGE production
npx vercel env add BLOB_READ_WRITE_TOKEN production
npx vercel env add AI_PROVIDER production
npx vercel env add OPENAI_API_KEY production
npx vercel --prod
```

Add SMTP variables the same way if password reset and alert emails should send real email in production.

## Demo Safety

- If OpenAI is unavailable, GatorBot falls back to local website help.
- If AI matching is disabled, report submissions still work.
- If SMTP is unavailable, password reset and alerts use the app's local/logged fallback behavior.
- The app requires Postgres in production; there is no JSON-file fallback on Vercel.
