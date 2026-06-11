# Antigravity Collaborator Instructions

For collaborator: `AAU007`

Project: Green Level Lost & Found / FBLA2026

## Core Rule

Do not push directly to `main` unless Paarth explicitly asks you to. Treat
`main` as the stable judge-demo version.

## Starting Work

Always start from the latest `main`:

```bash
git switch main
git pull origin main
git switch -c aau007/short-task-name
```

Use focused branch names, for example:

```bash
aau007/admin-polish
aau007/docs-cleanup
aau007/mobile-spacing-fix
```

## Saving Work

Commit focused changes:

```bash
git status
git add <files-you-changed>
git commit -m "fix: describe the change"
git push origin aau007/short-task-name
```

Then open a GitHub pull request into `main`.

## Before Opening A PR

Update your branch from `main`:

```bash
git switch main
git pull origin main
git switch aau007/short-task-name
git merge main
```

If conflicts appear, stop and ask before guessing, especially in important files.

## Files That Need Coordination

Ask before editing these:

- `public/js/scroll-lens.js`
- `public/js/scroll-story.js`
- `public/js/home-3d.js`
- `public/css/style.css`
- `server/routes/*`
- `server/middleware/auth.js`
- `server/lib/prisma.js`
- `prisma/schema.prisma`
- `prisma/migrations/*`

These files are either visually delicate, security-sensitive, or likely to
produce conflicts.

## Database Rule

Only one person should work on Prisma database schema/migrations at a time.

Do not change `prisma/schema.prisma` or create files under `prisma/migrations/`
unless Paarth says you own the database task.

## Secrets Rule

Never commit:

- `.env`
- database passwords
- session secrets
- API keys
- local editor folders
- local agent folders

Use `.env.example` only for shared placeholder values.

## Local Setup

This project is designed to run without venue Wi-Fi after setup.

```bash
npm install
brew services start postgresql@16
npm run db:check
npm run db:prepare
npm start
```

Open:

```text
http://localhost:3000
```

## Testing Expectations

For backend/API/auth/database changes, run:

```bash
npm test
```

For UI flow changes, run if practical:

```bash
npm run test:ui
```

For visual-only CSS or homepage animation tweaks, at minimum open the page and
manually check desktop and mobile widths.

## Communication Rule

Before touching a risky file, send a quick message:

```text
I am editing public/js/home-3d.js for the spin speed. Please avoid that file until I push my branch.
```

That one sentence prevents most conflicts.

## Agent Behavior Request

If you are using Gemini Antigravity CLI as the coding agent:

- Read `AGENTS.md`, `AGENT_WORKFLOW.md`, and this file first.
- Inspect `git status` before editing.
- Do not overwrite uncommitted work from another collaborator.
- Prefer small commits.
- Preserve the existing premium UI and cinematic homepage unless asked to change
  them.
- Do not introduce visible AI branding or wording into the judge-facing site.
- Ask before making database, auth, privacy, or claim-status changes.
