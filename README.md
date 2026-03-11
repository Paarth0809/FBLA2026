# Green Level Lost & Found
**FBLA Website Coding & Development 2026**
Paarth Rathod & Aadit Urhekar — Green Level High School, Cary NC

---

## What is this?

Our school's physical lost and found is a table in the main office that overflows and nobody checks. We built a web app to replace it — students can post found items, report missing ones, search the board, and submit claims. An admin account handles approvals so nothing goes live without being reviewed first.

No templates were used. Everything was written by hand.

---

## How to run it

You need Node.js installed. That's the only requirement.

```
git clone https://github.com/Paarth0809/FBLA2026.git
cd FBLA2026
npm install
npm start
```

Go to http://localhost:3000. The demo accounts get created automatically the first time.

---

## Demo accounts

| | Email | Password |
|---|---|---|
| Admin | admin@school.edu | admin123 |
| Student 1 | student@school.edu | student123 |
| Student 2 | student2@school.edu | student123 |

There are quick-fill buttons for these right on the login page.

---

## What it can do

- Report a found item with a photo, category, location, and contact email
- Report a missing item with last-seen location
- Search and browse all approved items (no account needed)
- Submit a claim on a found item with proof of ownership
- Admin approves/rejects submissions and claims
- Once a claim is approved, both students get each other's contact info
- Missing item reporter can mark their own report as found once it's resolved
- My Submissions page shows live status of everything you've posted
- Clear history removes resolved entries without touching anything still pending

---

## File layout

```
server/
  index.js              — server entry point
  middleware/auth.js    — requireAuth / requireAdmin
  lib/db.js             — read/write JSON helpers
  lib/seed.js           — creates demo accounts on first run
  routes/               — auth, items, missingItems, claims, admin

public/
  css/style.css         — all styles, no framework
  js/api.js             — fetch() wrapper
  js/nav.js             — shared nav, auth state, helper functions
  images/school.jpg     — Green Level campus photo
  *.html                — 12 pages total

data/                   — JSON files (users, items, missing-items, claims)
uploads/                — uploaded photos (gitignored)
tests/
  run.js                — 75 API tests
  ui-flow.test.js       — Playwright end-to-end tests
```

---

## Libraries used

| Library | What we used it for | Link |
|---|---|---|
| Express | HTTP server and routing | https://expressjs.com |
| express-session | Login sessions | https://github.com/expressjs/session |
| bcryptjs | Password hashing | https://github.com/dcodeIO/bcrypt.js |
| multer | Photo uploads | https://github.com/expressjs/multer |
| uuid | Unique IDs for every item | https://github.com/uuidjs/uuid |
| nodemon | Auto-restart during dev | https://nodemon.io |
| Playwright | End-to-end UI testing | https://playwright.dev |
| Inter (Google Fonts) | Font | https://fonts.google.com/specimen/Inter |

All MIT licensed except Playwright (Apache 2.0) and Inter (OFL).

---

## Tests

```
npm test        — runs 75 API tests against an isolated data directory
npm run test:ui — runs Playwright UI tests (full signup → report → claim → resolve flow)
```

---

## Notes

- Data is stored in JSON files using Node's built-in `fs` module — no database
- The frontend is plain HTML/CSS/JS — no React, Vue, or any build step
- Passwords are hashed with bcrypt before being written anywhere
- All submission endpoints redirect to login if you're not signed in
