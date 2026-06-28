# Green Level Lost & Found

**FBLA Website Coding & Development 2026**
Paarth Rathod & Aadit Urhekar — Green Level High School, Cary, NC

## Overview

Green Level Lost & Found is a campus lost-and-found system for reporting found
items, posting missing items, submitting ownership claims, receiving item-match
suggestions, messaging securely, and letting school staff approve each step.

The project is designed for a competition demo room: it runs locally, keeps core
assets bundled in the repo, and does not require Wi-Fi for the main presentation
or judging walkthrough.

## Quick Start

```bash
cp .env.example .env
# edit .env with the local fbla_app password and a strong SESSION_SECRET
brew services start postgresql@16
npm install
npm run db:check
npm run db:prepare
npm start
```

Open `http://localhost:3000`.

Demo accounts are created automatically on first run:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@school.edu` | `admin123` |
| Student | `madelinefredrick@gmail.com` | `student123` |
| Student | `student2@school.edu` | `student123` |

## Offline Demo Notes

- The live app uses local PostgreSQL through Prisma. It does not need internet,
  but the local database service must be running before `npm start`.
- Fonts, icons, Tailwind utilities, GSAP, Three.js, the GLB model, HDRI, and the
  480 scroll frames are vendored locally.
- Optional photo profiling for richer matching is disabled by default and the
  matcher falls back to local keyword/category logic.
- `data/*.json` remains only as a migration/backup source for
  `npm run data:migrate-json`.

## Core Features

- Public homepage with cinematic scroll story and reduced-motion fallback
- Public search for approved found items and approved missing reports
- Found item and missing item submissions with photo upload and HEIC conversion
- Student portal with found reports, missing reports, claims, matches, messages
- Claim submission and admin claim approval
- Secure in-app messaging for approved claim participants and missing-item owners
- Admin dashboard for approvals, rejections, deletes, claimed/found status changes
- Privacy-safe public APIs that do not expose contact emails or owner IDs
- Stale-session admin protection: admin status is reloaded from storage
- Local tests covering auth, privacy, routes, messaging, and admin actions

## Local PostgreSQL Setup

The app is Postgres-only at runtime. The normal judge-day flow is local and works
with slow or unavailable Wi-Fi because PostgreSQL, Node, and every browser asset
run on the laptop.

```bash
cp .env.example .env
brew services start postgresql@16
createuser fbla_app --pwprompt
createdb fbla2026_dev -O fbla_app
createdb fbla2026_test -O fbla_app
npm run prisma:validate
npm run prisma:generate
npm run prisma:deploy
npm run data:migrate-json
```

Set `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_STORE=postgres`, and a strong
`SESSION_SECRET` in `.env`. If the database already exists, `npm run db:prepare`
is the short command for validate/generate/migrate/import.

## Useful Commands

```bash
npm run build:css          # rebuild local Tailwind CSS
npm test                   # API/unit test suite
npm run test:ui            # Playwright UI tests, when configured
npm run db:check           # verify DATABASE_URL and TEST_DATABASE_URL connect
npm run db:prepare         # validate, generate, migrate, import JSON seed data
npm run prisma:validate    # validate database schema
```

## Documentation

- [Judge README](docs/JUDGE_README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Sources and Licenses](docs/SOURCES_AND_LICENSES.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Presentation Notes](docs/PRESENTATION_NOTES.md)

## Technology

Node.js, Express, PostgreSQL, Prisma, plain HTML/CSS/JavaScript, Tailwind
generated locally, GSAP, Three.js, bcrypt password hashing, Postgres-backed
session cookies, Multer uploads, HEIC conversion, and Playwright-compatible
tests.
