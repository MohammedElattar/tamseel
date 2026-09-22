# AGENTS.md — start here

This is **Edara**, an Arabic/RTL officer‑evaluation‑committee app (React + Vite client, Express +
sql.js server, TypeScript monorepo). If you're an AI agent working on this project, read, in order:

1. **`agent/README.md`** — onboarding, golden rules, how to run/build/verify, environment layout.
2. **`agent/RECIPES.md`** — step‑by‑step recipes (DB edits, seeding, smoke tests, publishing).
3. **`PROJECT_MAP.md`** — architecture + "I want to change X → open file Y" map.
4. **`.cursor/rules/*.mdc`** — enforced conventions (Arabic numerals, backend/frontend, import, legacy).

Quick start: `npm run dev` (client :5173, server :3000). Admin `admin` / `admin123`, members
`member123`. Verify changes with `npx tsc --noEmit` in both `client/` and `server/`.

Non‑negotiables: Arabic‑Indic digits in all UI; RTL layout; sql.js is in‑memory so **stop the dev
server before writing the DB file**; schema changes need a migration in
`server/src/db/connection.ts`. Details in `agent/README.md`.
