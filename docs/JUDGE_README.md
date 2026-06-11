# Judge README

## Fast Demo Setup

One-time setup on the presentation laptop:

```bash
brew services start postgresql@16
npm install
npm run db:check
npm run db:prepare
```

Daily judge-room startup:

```bash
brew services start postgresql@16
npm start
```

Open `http://localhost:3000`.

Demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@school.edu` | `admin123` |
| Student | `student@school.edu` | `student123` |
| Student | `student2@school.edu` | `student123` |

## Offline Backup Plan

This project is prepared for slow or unavailable venue Wi-Fi:

- Runtime CSS is local: `/css/tailwind-local.css` and `/css/style.css`.
- Fonts and Material Symbols are local under `/vendor/`.
- GSAP, Three.js, the magnifying-glass model, HDRI, school image, and 480 scroll
  frames are local.
- PostgreSQL runs locally on the laptop. No cloud database or venue internet is
  required after setup.
- `data/*.json` can be re-imported with `npm run data:migrate-json` if demo data
  needs to be restored.
- Optional photo profiling is disabled by default. Matching still works locally
  through item names, categories, object families, keywords, and locations.

If a laptop has no internet, start the local Postgres service and run the app
exactly the same way with `npm start`.

## Suggested 7-Minute Walkthrough

1. Open the homepage and scroll through the cinematic table/lens story.
2. Search approved found items.
3. Open a found item and submit a claim.
4. Log in as a student and submit a missing item.
5. Show My Submissions: Found, Missing, Claims, Matches, Messages.
6. Log in as admin and approve/reject a submission or claim.
7. Show privacy: public item pages do not expose private contact emails.

## Rubric Mapping

| Rubric Need | Where It Appears |
| --- | --- |
| Home page and navigation | `index.html`, shared nav |
| Found item submission | `report.html`, `/api/items` |
| Photo upload | Multer + HEIC conversion in `server/lib/photoUpload.js` |
| Searchable found listings | `search.html`, `/api/items` |
| Missing item workflow | `report-missing.html`, `search-missing.html` |
| Claim/inquiry form | `claim.html`, `/api/claims` |
| Admin approval system | `admin.html`, `/api/admin/*` |
| Responsive design | Shared CSS, local Tailwind, mobile layouts |
| Source documentation | `docs/`, README, code comments |

## Database Notes For Judges

The live app is backed by local PostgreSQL through Prisma. Sessions are stored in
Postgres when `SESSION_STORE=postgres`, route handlers use Prisma repositories,
and the JSON files are retained only as an importable seed/backup source.
