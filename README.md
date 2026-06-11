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
npm install
npm start
```

Open `http://localhost:3000`.

Demo accounts are created automatically on first run:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@school.edu` | `admin123` |
| Student | `student@school.edu` | `student123` |
| Student | `student2@school.edu` | `student123` |

## Offline Demo Notes

- The app runs from local JSON data by default, so no database server is required
  during judging.
- Fonts, icons, Tailwind utilities, GSAP, Three.js, the GLB model, HDRI, and the
  480 scroll frames are vendored locally.
- Optional photo profiling for richer matching is disabled by default and the
  matcher falls back to local keyword/category logic.
- PostgreSQL + Prisma is included as the production-lite data path for migration
  and deployment, but the local demo remains self-contained.

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

## Production-Lite Database Lane

The default judging path uses local JSON files for zero-setup reliability. The
repository also includes a Prisma schema for PostgreSQL and a JSON migration
script.

```bash
cp .env.example .env
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
npm run data:migrate-json
```

Set `DATABASE_URL` in `.env` before running migrations. Set
`SESSION_STORE=postgres` only when a Postgres database is running.

## Useful Commands

```bash
npm run build:css          # rebuild local Tailwind CSS
npm test                   # API/unit test suite
npm run test:ui            # Playwright UI tests, when configured
npm run prisma:validate    # validate database schema
```

## Documentation

- [Judge README](docs/JUDGE_README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Sources and Licenses](docs/SOURCES_AND_LICENSES.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Presentation Notes](docs/PRESENTATION_NOTES.md)

## Technology

Node.js, Express, plain HTML/CSS/JavaScript, Tailwind generated locally, GSAP,
Three.js, Prisma/PostgreSQL migration support, bcrypt password hashing, session
cookies, Multer uploads, HEIC conversion, and Playwright-compatible tests.
