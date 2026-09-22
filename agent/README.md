# Agent Onboarding — Edara

You are an AI coding agent about to work on **Edara**, an officer‑evaluation‑committee web app for
the Egyptian Navy (Arabic / RTL). Read this folder first, then keep it and the files below open.

## Read these first (in order)
1. **`PROJECT_MAP.md`** (repo root) — architecture + a task‑oriented "change X → open file Y" map.
2. **`.cursor/rules/*.mdc`** — the enforced conventions:
   - `project-overview.mdc` — the big picture, data model, key business logic.
   - `arabic-numerals.mdc` — Arabic‑Indic digits & date rules (**strict**).
   - `backend-conventions.mdc` — sql.js patterns, API response shapes, `mapRows`, `saveDB`.
   - `frontend-conventions.mdc` — React/Tailwind/RTL patterns.
   - `import-system.mdc` — quarterly Oracle→SQLite import mapping.
   - `legacy-system.mdc` / `legacy-xml-review.mdc` — matching the original Oracle Forms behavior.
3. **`agent/RECIPES.md`** — concrete step‑by‑step recipes (DB edits, seeding, publishing, testing).
4. **`دليل-المستخدم.md`** (repo root) — end‑user guide (Arabic), useful for understanding intent.

## Golden rules (do not violate)
- **Arabic‑Indic numerals** in ALL UI output (`٠١٢٣…`), never Western digits. Convert at render with
  `toArabicDigits` (`client/src/utils/format.ts`); dates via `formatDate` (never run a raw ISO date
  through `toArabicDigits`). State / keys / `<option value>` / API payloads stay Western.
- **RTL layout** (`<html dir="rtl">`). In flexbox the first child is on the **right**; use
  `flex-row-reverse` to flip. `border-s-*` / `-translate-x-*` are start‑relative.
- **sql.js is in‑memory.** The dev server holds the whole DB and rewrites `server/data/edara.db` on
  every `saveDB()`. Any script that writes the DB file **while the server runs is silently
  overwritten** — stop the server first (see RECIPES), or make the change through the running API.
- **Schema changes need a migration.** `CREATE TABLE IF NOT EXISTS` (schema.sql) only affects fresh
  DBs. Add an `ALTER TABLE … ADD COLUMN` to `runMigrations()` in `server/src/db/connection.ts` for
  existing DBs.
- **After any DB write on the server, call `saveDB()`.** Read rows with the `mapRows()` helper.
- **One active committee at a time**; activating one deactivates the others.
- Don't add narrating comments; keep changes minimal and match existing style.

## Run / build / verify
```
npm run dev            # root: server :3000 + client :5173 together (concurrently -k)
npm run build          # server tsc + client vite build (use to sanity‑check a production build)
npm --prefix client run dev   # client only
npm --prefix server run dev   # server only
npm --prefix server run db    # interactive sql.js SQL shell over data/edara.db (read/inspect)
```
- App: **http://localhost:5173**. Admin `admin` / `admin123`. Panel members `member123`. Guest seat
  = زائر (passwordless quick‑login from the login screen).
- **Verify a change**: run `npx tsc --noEmit` in BOTH `client/` and `server/` (must be clean). For
  behavior, hit the API (see RECIPES "smoke test"). The dev server hot‑reloads (Vite HMR for client,
  `tsx watch` restarts for server) — you usually don't need to restart it.

## Environment layout (important)
- The **WSL working copy** `/home/navy/workspace/edara` is the **source of truth** — do all edits
  here (Linux `node_modules`, runs in WSL).
- `F:\Repos\edara` (= `/mnt/f/Repos/edara`) is the old code. `F:\Repos\edara_V.2`, `edara_V.3`, … are
  **Windows‑ready published snapshots** (win32 `node_modules`, run natively on Windows with
  `npm run dev`). Publishing = rsync the source + robocopy the Windows `node_modules` (deps must
  match). See RECIPES "publish". **Do not `npm install` from WSL into a Windows copy** (it produces
  Linux binaries that break on Windows).

## Recent feature areas (context from prior sessions)
- **شاشة التصويت** — a projector/spectator display (login button opens it via the زائر seat):
  `pages/member/VotingDisplayScreen.tsx`, `components/member/DisplayOfficerCard.tsx`,
  `components/member/PendingVoters.tsx`; fed by the decision‑free `memberStatuses` in
  `routes/evaluations.ts` `/current`.
- **التدرج الوظيفي highlight** — imported `marked_color` (dark_green / light_green) tints career rows
  with a legend: `components/officer/OfficerCvContent.tsx`; columns `taraky_c`,
  `taraky_c_suggested`, `marked_color` on `officer_holder_wazayef`.
- **Children** show gender + computed age, oldest→youngest: `OfficerCvContent.tsx` + the officer‑cv
  query in `routes/evaluations.ts`.
- **حذف قرارات اللجنة / reset‑session** — bulk action that clears votes + officer state (backup
  first): `routes/committees.ts` (`/:id/officers/bulk`, action `reset-session`) + `CommitteeDetail.tsx`.

## Etiquette for this project
- Prefer changing data through the **running admin API** over hand‑writing SQL (safer, no restart).
- When you must touch the DB directly, use a temporary `sql.js` script, run it with the server
  stopped, delete the script afterward.
- Keep the UI Arabic and match the exact legacy labels (see `legacy-xml-review.mdc`).
