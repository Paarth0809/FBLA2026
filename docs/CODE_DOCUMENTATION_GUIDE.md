# Code Documentation Guide

Green Level Lost & Found is organized so judges can inspect original code by layer.

## Source Layout

- `server/`: Express app setup, route guards, validation, uploads, email, AI helpers, Prisma mapping, and audit logging.
- `public/`: static HTML, CSS, and JavaScript modules for UI, Three.js scenes, maps, forms, settings, and GatorBot.
- `prisma/`: PostgreSQL schema and migration history.
- `scripts/`: local and deployment utilities for data migration, CAD conversion, email checks, and asset handling.
- `tests/`: backend, source-level, and UI regression coverage for core workflows.

## Commenting Approach

Comments explain why the code exists: security and privacy choices, role checks, status transitions, rendering pipelines, accessibility, deployment tradeoffs, and judge-demo reliability. Generated assets, vendor bundles, frame sequences, secrets, and `.env` files are intentionally not hand-commented.

## Rubric Alignment

- Backend and Prisma comments show the Express/PostgreSQL architecture and data integrity decisions.
- Frontend comments show separation of HTML, CSS, JavaScript, responsive layout, accessibility, and interactive rendering systems.
- Test and script comments identify workflow coverage for auth, email, maps, AI, uploads, and rendering contracts.
