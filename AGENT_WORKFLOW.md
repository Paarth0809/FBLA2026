# AI Agent Workflow

This project uses two coding agents:

- Claude Code for planning, architecture, product thinking, and long-form handoffs.
- Codex for adversarial review, repo-grounded implementation, testing, debugging, and diff review.

Use repository files as the shared memory. Do not rely on either agent remembering the other agent's chat history.

## Shared Files

- `PLAN.md`: Claude writes active implementation plans here before code changes.
- `CONTEXT.md`: Claude or Codex updates this when handing off work or ending a session.
- `REVIEW.md`: Codex writes adversarial review findings here when Claude needs to read them.

## Standard Workflow

1. Claude writes or updates `PLAN.md` with the goal, assumptions, implementation steps, risks, and test plan.
2. Codex reads `PLAN.md`, inspects the current repository, and performs an adversarial review before implementation.
3. Codex writes review findings to `REVIEW.md` when Claude needs to act on them.
4. Claude revises `PLAN.md` based on `REVIEW.md`, or Codex implements if the user asks Codex to continue.
5. The implementing agent runs relevant tests and records results in `CONTEXT.md`.
6. Before stopping, the active agent updates `CONTEXT.md` with current state, changed files, commands run, known risks, and next steps.

## Default Behavior

When the user gives Claude a plain-English request for a non-trivial code change, Claude should default to planning first:

1. Read this file and `CLAUDE.md`.
2. Write or update `PLAN.md`.
3. Update `CONTEXT.md`.
4. Stop before implementation unless the user explicitly says to implement immediately.

When the user tells Codex "adversarial review", Codex should default to:

1. Read this file, `AGENTS.md`, `PLAN.md`, and `CONTEXT.md`.
2. Inspect `git status`, current diffs, and relevant source files.
3. Review the plan skeptically for security, auth, privacy, edge cases, data consistency, UI flow, and tests.
4. Write the findings to `REVIEW.md`.
5. Avoid editing implementation files unless the user explicitly asks Codex to implement.

When the user tells Claude to continue after Codex review, Claude should default to:

1. Read `REVIEW.md`.
2. Revise `PLAN.md` if needed.
3. Implement the revised plan.
4. Run relevant tests.
5. Update `CONTEXT.md`.

## Codex Review Prompt

Use this prompt when Claude has written a plan:

```text
Read PLAN.md and do an adversarial review before implementation.
Inspect the current repo, git status, and relevant files.
Check security, auth, privacy leaks, edge cases, data consistency, UI flow issues, and missing tests.
Write findings to REVIEW.md for Claude.
Do not edit implementation files.
```

## Claude Planning Prompt

Use this prompt before implementation:

```text
Create a detailed implementation plan in PLAN.md.
Include the goal, relevant files, assumptions, step-by-step changes, risks, and test plan.
Update CONTEXT.md with the current state.
Do not implement yet.
```

## Mid-Session Handoff Prompt

Use this prompt when one agent hits limits or stops:

```text
Read CONTEXT.md and PLAN.md.
Inspect git status and the current diff.
Continue from the next step, but verify the previous agent's assumptions before editing.
```

## Review Rules

- Treat plans as proposals, not truth.
- Verify against the current code before implementing.
- Pay special attention to authentication, authorization, contact email visibility, claims, admin routes, messaging permissions, uploads, and JSON data consistency.
- Avoid having both agents edit the same files at the same time.
- Prefer small, testable changes over broad rewrites.
- Run `npm test` after backend or routing changes when possible.
- Run UI checks for frontend flow changes when possible.

## Multi-Collaborator Git Workflow

Use `main` as the stable judge-demo branch. Do not use it as a shared scratchpad.

Before starting work:

```bash
git switch main
git pull origin main
git switch -c your-name/short-task-name
```

While working:

```bash
git status
git add <changed-files>
git commit -m "clear: short description"
git push origin your-name/short-task-name
```

Before a pull request:

```bash
git switch main
git pull origin main
git switch your-name/short-task-name
git merge main
```

Rules:

- Open a pull request for review before merging into `main`.
- Pull early and often, but do not force-pull over uncommitted work.
- If two collaborators need the same file, coordinate first.
- Keep `.env` local; use `.env.example` for shared configuration.
- Avoid broad formatting-only commits while someone else is editing nearby code.
- Keep Prisma/database migration work serialized through one owner.

High-conflict ownership zones:

- Homepage 3D and scroll lens: `public/js/home-3d.js`,
  `public/js/scroll-lens.js`, `public/js/scroll-story.js`
- Design system: `public/css/style.css`
- Backend/API/security: `server/routes/*`, `server/middleware/*`,
  `server/lib/*`
- Database: `prisma/schema.prisma`, `prisma/migrations/*`

## Context Template

`CONTEXT.md` should include:

```md
## Current Goal

## Completed

## Current State

## Important Files

## Commands Run

## Known Risks

## Next Step
```

## Review Template

`REVIEW.md` should include:

```md
# REVIEW.md

## Verdict

## Findings

## Required Changes

## Suggested Tests

## Notes for Claude
```
