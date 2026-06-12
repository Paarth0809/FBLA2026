## Summary

What changed?

## Checklist

- [ ] I branched from the latest `main`.
- [ ] I did not push directly to `main`.
- [ ] I did not commit `.env`, secrets, database passwords, API keys, or local workspace folders.
- [ ] I checked `git status` before committing.
- [ ] I coordinated before editing high-risk files such as homepage 3D, scroll lens, auth, routes, Prisma, or migrations.
- [ ] I tested the affected page or flow manually.
- [ ] I ran `npm test` for backend/API/auth/database changes.
- [ ] I checked desktop and mobile layout for UI changes.

## High-Risk Areas Touched

List any of these if touched:

- `public/js/scroll-lens.js`
- `public/js/scroll-story.js`
- `public/js/home-3d.js`
- `public/css/style.css`
- `server/routes/*`
- `server/middleware/*`
- `server/lib/*`
- `prisma/schema.prisma`
- `prisma/migrations/*`

## Notes For Review

Anything the reviewer should pay special attention to?
