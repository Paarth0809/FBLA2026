# Final Website Review

Last updated: June 11, 2026

## Verdict

The project is in a strong judge-demo state. The core user flows are automated,
public APIs do not expose private contact fields, admin access is protected by a
fresh database role lookup, and the frontend no longer depends on CDN fonts,
icons, or Tailwind during the presentation.

The cinematic homepage and 3D/WebGL work are a major presentation
differentiator. The live backend now uses local PostgreSQL through Prisma, with
Postgres-backed sessions and JSON retained only as a migration/backup source.

## Must Fix Before Judges

1. Run a full manual offline demo the morning of the event.
   - Start PostgreSQL locally before entering the room.
   - Run `npm run db:check` and `npm start`.
   - Open every important page once while online or on local network so browser cache is warm.
   - Keep `http://localhost:3000` open and ready.

2. Use a strong `SESSION_SECRET` in `.env`.
   - The server warns in dev if the fallback is being used.
   - For the actual demo laptop, set a real secret even if this is local-only.

3. Keep the Postgres data restore path ready.
   - Keep the known-good `data/` folder as a backup import source.
   - If demo data gets messy, run `npm run db:reset:local`.

4. Explain the database layer confidently.
   - Honest wording: “The app runs locally on PostgreSQL through Prisma, so it is database-backed without depending on venue Wi-Fi.”

5. Keep optional Prisma audit context ready.
   - `npm audit --omit=dev --omit=optional` is clean.
   - Default `npm audit --omit=dev` reports Prisma CLI optional tooling through `@prisma/client`; avoid `npm audit fix --force` because it downgrades Prisma and is breaking.

## Nice-To-Have Polish

1. Add token-based CSRF.
   - The current origin check blocks cross-site browser mutations in the normal demo path.
   - A synchronized CSRF token would be a stronger production story.

2. Add Zod schemas to every mutating route.
   - Existing validation covers required fields and common bad values.
   - Zod would make the validation model easier to explain and maintain.

3. Add a formal service-worker/offline shell.
   - Current offline readiness comes from vendored assets and local server execution.
   - A service worker would make refreshes more resilient after first load, but is not required for the local demo.

4. Add axe checks to the Playwright suite.
   - Accessibility docs and visible focus states are present.
   - Automated axe assertions would strengthen the rubric evidence.

5. Expand Playwright coverage.
   - Current UI suite covers the main lifecycle: missing report, admin approval, found report, claim, and close-loop approval.
   - Additional coverage should include messages, Matches tab claim links, account deletion, mobile nav, and admin message viewer.

## Page Review

`index.html`
- Strongest page visually. Cinematic scrollytelling, local frame assets, local GSAP/Three assets, and reduced-motion fallback are all judge-friendly.
- No public “AI” wording is visible.
- Risk: heavy frame sequence is large, so run locally and pre-open the page before presenting.

`login.html`
- Matches the premium signup style.
- Auth remains real email/password auth.
- Icon overlap has been addressed by the local CSS/form layout.

`signup.html`
- Strong visual first impression.
- Includes password confirmation and protected-contact copy.
- No internet dependency remains for fonts/icons.

`search.html`
- Public found-item gallery hides pending/claimed items.
- Public API DTO no longer leaks `contactEmail`, `submittedBy`, or generated profile metadata.

`search-missing.html`
- Public missing-item gallery uses the same approved-only visibility.
- Sidebar/filter layout works with local CSS after the Tailwind conversion.

`item.html`
- Found item detail supports real claim CTA.
- Claimed items show the closed-loop banner.
- Public detail no longer exposes contact email.

`missing-item.html`
- Public detail supports “Message Owner” without exposing owner email.
- Owner/admin may still see owner contact fields because the route intentionally returns raw owner/admin data.

`my-submissions.html`
- Student portal contains the five key tabs: Found, Missing, Claims, Matches, Messages.
- Approved-contact flows are visible only after the appropriate status.
- Future test coverage should exercise messages and matches directly.

`report.html`
- Found report form keeps real IDs and upload behavior.
- Success message tells users to check My Submissions for updates.
- Upload limit copy remains 10 MB.

`report-missing.html`
- Missing report form mirrors found report behavior.
- HEIC preview fallback and conversion path remain in place.
- Success message points to My Submissions.

`claim.html`
- Claim form stays backend-aligned; no fake student ID, serial number, PDF, or 5 MB copy.
- Claim link format from matches should remain `/claim.html?id=FOUND_ID&type=found`.

`admin.html`
- Admin tabs and actions remain intact.
- Admin route now reloads the current user role from persisted data, preventing stale role escalation.
- Message viewer modal regression from local Tailwind was fixed with scoped hidden rules.

## Security And Privacy Review

- Public found/missing APIs now use DTOs and do not expose private emails/user IDs/profile metadata.
- Admin checks no longer trust the session role alone.
- Sessions regenerate on signup/login.
- Mutating browser requests have an origin check.
- API routes have rate limiting without throttling static story frames.
- Uploads are served through a controlled filename route instead of raw directory static serving.
- Messages can be sent to missing-item owners without revealing the owner email in the public item response.

Remaining risk:
- CSRF is still origin-check based rather than token based.
- Validation is route-level rather than consistently schema based.

## Offline / Slow Wi-Fi Readiness

- Tailwind is built locally.
- Fonts are vendored locally.
- Material Symbols are vendored locally.
- Three.js, GSAP, the GLB, HDRI, and scroll frames are local assets.
- Public app files do not require Google/CDN resources at runtime.
- The app is best presented as a local server demo, not a remote hosted demo dependent on venue Wi-Fi.
- PostgreSQL is local too; no cloud database is required.

Presentation backup plan:
- Start the server before judging.
- Start the local PostgreSQL service before judging.
- Use `localhost:3000`.
- Keep `npm run db:reset:local` ready if you need to restore seed data.
- If the network is unavailable, do not use Gemini/profile generation; the app still submits items and runs the matcher from form data.

## Verification Evidence

- `npm test`: 93 / 93 passed.
- `npm run test:ui`: 6 / 6 Playwright lifecycle tests passed.
- `node --check server/index.js`: passed.
- `node --check public/js/nav.js`: passed.
- `node --check public/js/scroll-lens.js`: passed.
- `node --check public/js/scroll-story.js`: passed.
- `git diff --check`: passed.
- `npm run db:check`: verifies local dev/test Postgres connections.
- `npm run prisma:validate`: passed.
- `npm audit --omit=dev --omit=optional`: 0 vulnerabilities.

## Presentation Talking Points

- “The site works locally with no Wi-Fi because fonts, icons, animation frames, 3D model assets, Tailwind CSS, and JavaScript libraries are bundled.”
- “Contact details are protected from public browse/detail APIs and only revealed in owner, approved claim, or admin contexts.”
- “Admins review found and missing reports before they become public.”
- “Claims close the loop by marking a found item as claimed after approval.”
- “The cinematic homepage is not just a video: it is scroll-linked canvas plus a live WebGL magnifying lens.”
- “The live app is backed by local PostgreSQL through Prisma, so it has a real relational database without needing venue Wi-Fi.”
