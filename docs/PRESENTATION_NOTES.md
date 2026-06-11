# Presentation Notes

## Opening

"Green Level Lost & Found replaces the overflowing main-office lost-and-found
table with a secure campus workflow: report, search, claim, verify, and return."

## Demo Flow

1. Homepage: show the cinematic item-clear animation and magnifying-glass lens.
2. Search Found Items: explain public browsing without exposing private contacts.
3. Item Detail + Claim: submit ownership proof.
4. Missing Items: show secure message-owner flow without email exposure.
5. Student Portal: show reports, claims, matches, and messages.
6. Admin Portal: approve submissions and claims.
7. Offline Readiness: mention local assets and JSON demo mode.

## Strong Talking Points

- Privacy-safe public APIs: no contact emails or owner IDs in public responses.
- Admin role is checked against storage each request, not blindly trusted from
  the cookie.
- HEIC uploads are converted so iPhone photos work.
- The design is local and presentation-safe: no CDN dependency during judging.
- PostgreSQL + Prisma schema exists for production deployment while the demo
  stays portable.

## Backup Plan

If Wi-Fi fails:

1. Run `npm start`.
2. Use local demo accounts.
3. Avoid optional provider-backed photo profiling.
4. Continue the entire workflow from local data and assets.
