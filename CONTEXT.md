# CONTEXT.md — Session Handoff for Codex

> Written by Claude at end of session or on request. Codex reads this to pick up where Claude left off.
> Last updated: 2026-06-09

---

## Project overview
School Lost & Found web app — FBLA 2026 competition project.
- Stack: Node.js + Express + plain HTML/CSS/JS + JSON file storage (no database)
- Auth: express-session + bcryptjs
- File uploads: multer → saved to uploads/ folder
- Run: `npm run dev` → http://localhost:3000
- Demo accounts: admin@school.edu / admin123 | student@school.edu / student123

## Full file map
```
server/index.js              — Express entry point, mounts all routes
server/lib/db.js             — readJSON / writeJSON helpers
server/lib/seed.js           — creates demo data on first run
server/lib/aiProfile.js      — Gemini 2.5 Flash vision profile generator (fire-and-forget)
server/lib/matcher.js        — pure match scoring (object families, AI profiles, keywords)
server/middleware/auth.js    — requireAuth / requireAdmin middleware
server/routes/auth.js        — login, signup, logout
server/routes/items.js       — found items CRUD
server/routes/missingItems.js — missing items CRUD
server/routes/claims.js      — ownership claims (email gates on approval)
server/routes/messages.js    — in-app messaging between finders and claimers
server/routes/admin.js       — admin-only routes (approve/reject/delete)
server/routes/matches.js     — GET /api/matches/my-missing — match missing items to found items
data/users.json              — user accounts
data/items.json              — found items (may contain aiProfile field after Gemini analysis)
data/missing-items.json      — missing items (may contain aiProfile field after Gemini analysis)
data/claims.json             — ownership claims
data/messages.json           — in-app messages (new, untracked in git)
uploads/                     — user-uploaded photos (.gitignore'd)
public/css/style.css         — all styles (no framework)
public/js/api.js             — fetch() wrapper
public/js/nav.js             — shared nav, auth state, SCHOOL_NAME constant
public/*.html                — one file per page
.env.example                 — template for AI_MATCHING_ENABLED and GEMINI_API_KEY
```

## Pages
index, login, signup, search, search-missing, report, report-missing, item, missing-item, claim, admin, my-submissions

## Messaging system (recently added, not yet committed)
`server/routes/messages.js` implements in-app messaging:
- POST /api/messages — send a message (auth required, relationship-gated)
- GET /api/messages/inbox — messages received by current user
- GET /api/messages/sent — messages sent by current user
- Authorization rules: finder → approved claimer, approved claimer → finder, reply participants, any user → missing-item owner
- Messages stored in data/messages.json as flat array
- Item name is always resolved from DB (never trusted from client)

## What was completed this session (2026-06-09)
### AI-powered item matching system
Complete implementation of the AI matching feature:

**New files:**
- `server/lib/aiProfile.js` — Gemini 2.5 Flash vision API profile generator
  - `generateAndSave(itemId, itemType)` fires and forgets (non-blocking)
  - Caches structured aiProfile (keywords, color, brand, material, distinguishingFeatures, detailedDescription) on item object in JSON
  - Guarded by `AI_MATCHING_ENABLED=true` + `GEMINI_API_KEY` in .env
  - Free tier: 1,500 req/day via aistudio.google.com
- `server/lib/matcher.js` — pure scoring logic (no API calls)
  - OBJECT_FAMILIES map (12 synonym families for common school items)
  - SYNONYM_LIST sorted longest-first to prevent "macbook charger" matching laptop family
  - `scoreMatch()`: category +10 (bonus only), object family +35 (strong signal), name word overlap +15/word (strong), AI keywords +8/kw (strong if ≥2), AI brand +20 (strong), AI features +10/feature (strong), location +5 (bonus)
  - `findMatchesForMissingItems()`: MIN_SCORE=20, MAX_MATCHES=5, requires BOTH score threshold AND strongSignal flag
- `server/routes/matches.js` — GET /api/matches/my-missing (requireAuth)
- `.env.example` — template with AI_MATCHING_ENABLED and GEMINI_API_KEY

**Modified files:**
- `server/index.js` — added dotenv.config(), mounted /api/matches route
- `server/routes/items.js` — triggers generateAndSave on found-item submit (fire-and-forget)
- `server/routes/missingItems.js` — triggers generateAndSave on missing-item submit
- `server/routes/admin.js` — triggers generateAndSave on approve (if no existing aiProfile)
- `public/my-submissions.html` — added Matches tab with match cards grouped by missing item
- `public/css/style.css` — added match card, reason tag, strength badge styles

**Dependencies added:** `@google/generative-ai`, `dotenv`

### Matcher precision fix (Codex review addressed)
- Previously category alone (+30) exceeded MIN_SCORE (15) → false matches
- Fix: category reduced to +10 (bonus only), strongSignal gate added
- "AirPods" and "MacBook charger" now correctly do NOT match (different families)
- "AirPods" and "wireless earbuds" now correctly DO match (earbuds family)

### Tests
- `tests/run.js` includes 8 matcher unit tests (pure, no server)
- Tests cover: AirPods↔earbuds match, AirPods↔charger no-match, category-only rejected, location-only rejected, AI keyword overlap, findMatchesForMissingItems filtering, getObjectFamily accuracy
- All 83/83 tests passing

## Current git status (unstaged changes)
- data/claims.json, data/items.json, data/missing-items.json — data changes
- public/admin.html — View buttons + date fix
- public/css/style.css, public/missing-item.html, public/my-submissions.html — UI changes
- server/index.js, server/routes/admin.js, server/routes/auth.js, server/routes/claims.js — backend changes
- New: server/lib/aiProfile.js, server/lib/matcher.js, server/routes/matches.js, .env.example
- Untracked: .vscode/, data/messages.json, server/routes/messages.js

## Known constraints (important for any AI working on this)
- NO databases — JSON files only
- NO frontend frameworks (React, Vue) — vanilla JS only
- NO build tools (Vite, webpack) — no compilation step
- Keep code explanation-friendly for FBLA judges

## How to pick up new work
1. Read PLAN.md — if there is an active plan, review it before touching code
2. Run `npm run dev` to start the server
3. Check git status to understand what is staged vs unstaged

## Open questions / next steps
- To enable AI matching: copy `.env.example` to `.env`, set `AI_MATCHING_ENABLED=true`, add a `GEMINI_API_KEY` from aistudio.google.com (free tier, no billing required)
- Without a key: matching still works via keyword/category/object-family fallback — no Gemini calls are made
- Await new task from user.
