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
