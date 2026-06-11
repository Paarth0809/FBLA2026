# Architecture

## System Diagram

```mermaid
flowchart LR
  Browser["Static HTML/CSS/JS Browser App"] --> API["Express API"]
  API --> Auth["Session Auth + Role Middleware"]
  API --> Uploads["Controlled Upload Route"]
  API --> Prisma["Prisma Data Layer"]
  Prisma --> Postgres["Local PostgreSQL DB"]
  JSON["Legacy JSON Seed Files"] -. import .-> Prisma
```

## Runtime Modes

Local judging mode:

- PostgreSQL runs locally through Homebrew.
- Prisma is the live data layer for users, found items, missing items, claims,
  messages, uploaded assets, audit logs, and sessions.
- Static assets are local, so the app works without Wi-Fi once the local
  database service and Node server are running.

Migration/backup mode:

- `scripts/migrate-json-to-postgres.js` migrates JSON demo data into Postgres
  while preserving UUIDs, statuses, photos, claims, messages, and relationships.
- `data/*.json` is not used by live routes; it exists as a seed/restore source.

## Data Model

```mermaid
erDiagram
  User ||--o{ FoundItem : submits
  User ||--o{ MissingItem : submits
  User ||--o{ Claim : submits
  User ||--o{ Message : sends
  User ||--o{ Message : receives
  User ||--o{ UploadedAsset : owns
  UploadedAsset ||--o{ FoundItem : photo
  UploadedAsset ||--o{ MissingItem : photo
  User ||--o{ AuditLog : actor
```

## Route Map

- `/api/auth`: signup, login, logout, session inspection, account deletion
- `/api/items`: public found search/detail, found report submission, user reports
- `/api/missing-items`: public missing search/detail, missing report submission
- `/api/claims`: submit claims, user claim views, received claims
- `/api/messages`: secure item conversations
- `/api/matches`: local match suggestions
- `/api/admin`: admin-only moderation and message oversight

## Security Model

- Passwords are hashed with bcrypt.
- Login and signup regenerate sessions to reduce fixation risk.
- Admin middleware reloads the user from storage on every protected request.
- Sessions are stored in PostgreSQL when `SESSION_STORE=postgres`.
- Public item DTOs remove contact emails, submitter IDs, and private photo
  profile data.
- Mutating browser requests are checked against the request `Origin`.
- Upload serving is restricted to UUID-style image filenames.
- Helmet security headers and rate limiting are enabled.
- Messages are stored by sender and receiver user IDs rather than raw email-only
  relationships.

## Status Transitions

- Found item: `pending -> approved -> claimed`, or `pending/approved -> rejected`.
- Missing item: `pending -> approved -> found`, or `pending/approved -> rejected`.
- Claim: `pending -> approved/rejected`.
- Admin claim approval validates the linked item before writing status changes.

## Offline Asset Strategy

The homepage scroll story, GLB lens, generated Tailwind CSS, fonts, icons, GSAP,
Three.js, and environment texture are all served from `public/`. The presentation
does not depend on CDN availability. The only local service dependency is
PostgreSQL, which runs on the presentation laptop.
