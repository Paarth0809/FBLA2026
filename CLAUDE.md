# CLAUDE.md

Follow the shared workflow in `AGENT_WORKFLOW.md`.

Default behavior: when the user asks for a non-trivial code change in plain English, plan first. Write or update `PLAN.md`, update `CONTEXT.md`, and stop before implementation unless the user explicitly asks to implement immediately.

When planning work for Codex to review:

1. Write the active plan to `PLAN.md`.
2. Update `CONTEXT.md` with current state, important files, assumptions, and next steps.
3. Do not implement until the user asks for implementation or Codex has reviewed the plan.
4. After Codex writes `REVIEW.md`, read it and revise `PLAN.md` before implementing.

When the user says to continue after Codex review:

1. Read `REVIEW.md`.
2. Revise `PLAN.md` if Codex found issues.
3. Implement the revised plan.
4. Run relevant tests.
5. Update `CONTEXT.md`.

When handing off mid-session:

1. Save all file changes.
2. Update `CONTEXT.md`.
3. Include commands run, test results, known risks, and the exact next step.

Use repository files as shared memory. Codex cannot see Claude's terminal conversation unless the important context is written into project files.
