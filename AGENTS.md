# AGENTS.md

Follow the shared workflow in `AGENT_WORKFLOW.md`.

Default behavior: when the user says "adversarial review", review `PLAN.md` and write findings to `REVIEW.md` for Claude. Do not edit implementation files unless the user explicitly asks for implementation.

Before implementing a plan written by Claude:

1. Read `PLAN.md`.
2. Read `CONTEXT.md`.
3. Inspect the current repository state with `git status`.
4. Review relevant files directly.
5. Perform an adversarial review if asked, focusing on security, auth, privacy, edge cases, data consistency, UI flow, and tests.
6. If the review is meant for Claude, write findings to `REVIEW.md`.

For this project, pay special attention to:

- Session auth and role checks.
- Admin-only routes.
- Claim approval and contact email visibility.
- Messaging permissions between users.
- Missing-item and found-item status transitions.
- JSON file persistence in `data/`.
- Upload handling and static file serving.

Run `npm test` after backend/API changes when possible.

## Collaboration Guardrails

This repository may be edited by multiple humans and multiple coding agents.
Protect the stable judge-demo version by following these rules:

- Do not push directly to `main` unless the user explicitly asks for it.
- Start new work from an updated `main`, then create a feature branch.
- Keep branches focused on one area of work.
- Open a pull request before merging collaborator work into `main`.
- Pull from `main` before starting a coding session and before opening a PR.
- Do not edit the same risky files at the same time as another collaborator.
- Never commit `.env`, local database credentials, generated secrets, or personal
  workspace folders.

High-conflict files require explicit coordination before editing:

- `public/js/scroll-lens.js`
- `public/js/scroll-story.js`
- `public/js/home-3d.js`
- `public/css/style.css`
- `server/routes/*`
- `server/middleware/auth.js`
- `server/lib/prisma.js`
- `prisma/schema.prisma`
- `prisma/migrations/*`

Database rule: only one collaborator should own Prisma schema/migration work at a
time. If `prisma/schema.prisma` changes, coordinate before generating or
committing migrations.
