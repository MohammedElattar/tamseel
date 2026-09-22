# Agent Recipes — Edara

Concrete, tested step‑by‑steps for the tasks you'll hit most. Assumes the WSL working copy at
`/home/navy/workspace/edara`. See `agent/README.md` for the golden rules.

---

## Change a UI screen (client)
1. Find the file via `PROJECT_MAP.md` §6.
2. Edit it. Vite hot‑reloads at http://localhost:5173.
3. Verify: `cd client && npx tsc --noEmit` (must be clean).

## Change server logic / an endpoint
1. Edit the route in `server/src/routes/*.ts`. `tsx watch` restarts the server automatically.
2. Verify types: `cd server && npx tsc --noEmit`.
3. Verify behavior with a quick API call (see "Smoke test").

## Add a new DB column
1. Add it to the table in `server/src/db/schema.sql` (for fresh DBs).
2. Add `ALTER TABLE <t> ADD COLUMN <col> <type>` to the `additions` array in
   `server/src/db/connection.ts` `runMigrations()` (for existing DBs). The server restarts and
   applies it.
3. If it is **imported**: it auto‑maps from the Oracle INSERT by lowercase name. Only add to
   `COLUMN_MAP` in `server/src/services/importService.ts` if the Oracle name differs. Update the
   on‑page guide in `client/src/constants/importGuide.ts`.
4. If it should be **editable in the admin officer editor**: add it to `OFFICER_EDIT_COLS` and/or the
   relevant `NESTED_SECTIONS` entry in `server/src/routes/officers.ts`, and add a field to the
   matching list in `client/src/pages/admin/OfficerEdit.tsx`.
5. If it should **display** somewhere: add it to the query that feeds that screen (e.g. the
   `officer-cv` query in `routes/evaluations.ts`) and render it.

## Safely modify / seed the DB directly (server holds it in memory!)
Use this ONLY when the admin API can't do it. The `concurrently -k` root script means stopping the
server also stops the client; restart both after.

1. **Stop the dev server** (frees :3000 and :5173):
   ```
   pkill -f "concurrently -k -n server,client"; pkill -f "tsx watch src/index.ts"
   kill $(lsof -i :3000 -sTCP:LISTEN -t) 2>/dev/null; kill $(lsof -i :5173 -sTCP:LISTEN -t) 2>/dev/null
   # confirm: lsof -i :3000 -sTCP:LISTEN -t   (should be empty)
   ```
2. **Run a one‑off `sql.js` script** (same engine as the app). Pattern:
   ```ts
   import initSqlJs from 'sql.js'; import fs from 'fs'; import path from 'path';
   const DB = path.resolve('data','edara.db');
   const SQL = await initSqlJs(); const db = new SQL.Database(fs.readFileSync(DB));
   db.run('BEGIN'); /* ...db.run(...) updates... */ db.run('COMMIT');
   fs.writeFileSync(DB, Buffer.from(db.export()));
   ```
   Put it in `server/scripts/xxx.ts`, run `cd server && npx tsx scripts/xxx.ts`, then **delete it**.
3. **Restart**: `cd <repo root> && npm run dev` (startup never re‑seeds officers; safe).

Prefer the API instead when possible, e.g. seeding officer children/career rows via
`PUT /api/officers/:id` (nested sections `children` / `jobs`) — no restart needed.

## Seed fake data for testing
- **Officers**: no "create officer" API, so insert directly with a stopped‑server `sql.js` script
  (use ids ≥ 700000 to stay clear of the 900001‑900999 seed range). Give them `in_service='Y'`,
  `nashra_date`, `taraky_c >= 3`, plus the display fields (`full_rank`, `unt_n`, `job_n`,
  `speciality`, `taraky_estifa`, `se7a`, `tawsya_ka2ed`, …).
- **Children / career rows**: via `PUT /api/officers/:id` with `{ children: [...] }` / `{ jobs: [...] }`.
- **A ready committee**: create + load via the real API (guarantees correct wiring):
  `POST /api/committees` → `/:id/load-officers` → `/:id/load-members` → `/:id/show-officers` →
  `/:id/activate` → `/:id/officers/:oid/active`. A tagdded committee loads officers whose
  `nashra_date` matches the committee's and `taraky_c >= 3`.

## Smoke test (verify behavior without the UI)
Node 26 has global `fetch`, or use Python `urllib`. Key endpoints & creds:
```
POST /api/auth/login            {username:'admin', password:'admin123'}      -> {token}
GET  /api/auth/members          (seat list; find the is_guest seat)
POST /api/auth/quick-login      {user_id}                                    -> {token}   (members/guest)
GET  /api/committees            (array)      GET /api/officers               ({officers,total})
GET  /api/committees/:id        GET /api/committees/:id/session-officers
GET  /api/evaluations/current   (member/guest live context)                  Bearer <token>
POST /api/evaluations/vote      {officer_id, user_opinion[, ta3n_type]}      (member; guest -> 403)
GET  /api/evaluations/officer-cv/:officerId
```
Member creds: `EVAL1` … / `member123`. Guest: quick‑login the `is_guest` seat.
> Shell quirk in this env: complex `$(...)` pipelines sometimes error with "failed to change group
> ID". If so, write a small standalone `.py`/`.mjs` file and run that instead.

## Publish a Windows snapshot (F:\Repos\edara_V.X)
Deps must be unchanged vs an existing Windows copy (no new npm packages). Then:
1. Confirm deps match: `diff` the 6 manifests (root/server/client × package.json + lock) between the
   WSL copy and `/mnt/f/Repos/edara`.
2. rsync the source (exclude installs/data/build):
   ```
   rsync -rLt --delete --no-perms --no-owner --no-group \
     --exclude='node_modules/' --exclude='.git/' --exclude='server/data/' --exclude='dist/' \
     --exclude='*.db' --exclude='*.log' \
     /home/navy/workspace/edara/ /mnt/f/Repos/edara_V.X/
   ```
3. Copy the **Windows** node_modules natively (fast, correct binaries):
   ```
   cmd.exe /c "robocopy F:\Repos\edara\node_modules F:\Repos\edara_V.X\node_modules /E /MT:16 ... & \
               robocopy F:\Repos\edara\server\node_modules F:\Repos\edara_V.X\server\node_modules /E /MT:16 ... & \
               robocopy F:\Repos\edara\client\node_modules F:\Repos\edara_V.X\client\node_modules /E /MT:16 ..."
   ```
4. Verify: `@esbuild/win32-x64` exists under server & client `node_modules`; `.cmd` launchers present;
   `sql.js/dist/sql-wasm.wasm` present; new source signatures present; `server/data` absent (fresh DB
   on first run). If a new npm package was added, you cannot reuse Windows node_modules — the user must
   `npm install` on Windows.
> If a dependency changed, `PROJECT_MAP.md` §11 and this recipe's step 1 will catch it (manifests differ).

## Update the user↔Windows sync (after edits)
The WSL copy is source of truth. To push accumulated source edits to a published copy, re‑run the
rsync in "Publish" step 2 (it keeps the Windows `node_modules` and the copy's own DB, both excluded).
