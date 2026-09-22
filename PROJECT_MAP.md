# Edara — خريطة المشروع (Application Map for Developers)

نظام لجان تقييم الضباط (Officer Evaluation Committee System) — a web rebuild of two legacy
Oracle Forms apps for the Egyptian Navy. This file is a practical map: **what the app is, how it
is laid out, and — most importantly — which files to open when you want to change something.**

---

## 1. What the app does

Manages officer evaluation committees. Two committee types:

- **tagdded (تجديد وترقي)** — promotion/renewal. Members vote يستمر / يحال (+ يؤجل for the
  commander). Outcome depends on the promotion type (`l_lagna_type_c`).
- **edarya (إدارية / قضائية)** — administrative/judicial. Each officer has a `ta3n_type` (case
  type) whose configurable options are the vote choices (e.g. accept/reject an appeal…).

Three committee levels (`tamhidy`): 0 = رئيسية, 1 = تمهيدية, 2 = القائد.

Typical flow: admin creates a committee → imports officer data → loads members → assigns officers →
activates the committee → activates one officer at a time → members vote live → admin monitors →
calculates/reviews decisions → prints reports → ends the committee.

---

## 2. Tech stack

- **Backend:** Node.js + Express + TypeScript, run with `tsx` in dev. Database is **sql.js**
  (SQLite compiled to WASM — no native build). The whole DB lives in memory and is written to
  `server/data/edara.db` on every change (see "Gotchas").
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS. All UI is **Arabic / RTL**.
- **Auth:** JWT, two roles: `admin` and `member` (the زائر/guest is a `member` with `is_guest = 1`).
- **Realtime:** a WebSocket broadcasts a "db-changed" ping so member/login screens refetch.
- **Monorepo:** `server/` and `client/`, plus a root `package.json` that runs both.

---

## 3. Running it

From the project root:

```
npm install     # first time only (installs root + server + client via postinstall)
npm run dev     # runs BOTH: server on :3000 and client on :5173 (concurrently)
```

- Backend only: `npm run dev:server` (or `npm --prefix server run dev`).
- Frontend only: `npm run dev:client`.
- Production build: `npm run build` (server `tsc` + client `vite build`).
- Open **http://localhost:5173**. Default admin: `admin` / `admin123`. Panel members: `member123`.
- On first run the DB is created and seeded (admin, guest, lookups, committee panel members). There
  are **no officers** until you import a quarterly SQL file (Data Import screen).

> `concurrently -k` means if one process dies, the other is killed too. To modify the DB with a
> script you must **stop the server first** (it holds the DB in memory and overwrites the file on save).

---

## 4. Repo layout

```
edara/
├─ package.json            # root: `npm run dev` runs server + client
├─ server/
│  ├─ src/
│  │  ├─ index.ts          # Express bootstrap: initDB, seeds, mounts /api routes, WebSocket
│  │  ├─ realtime.ts       # WebSocket (broadcast on DB change)
│  │  ├─ middleware/auth.ts# authenticate / requireAdmin, JWT
│  │  ├─ db/
│  │  │  ├─ schema.sql     # table definitions (used to create a NEW db)
│  │  │  ├─ connection.ts  # open/save DB + runMigrations() (ALTER for EXISTING dbs)
│  │  │  ├─ seed.ts        # admin/guest/lookups/panel-member seeding
│  │  │  └─ shell.ts       # `npm run db` — interactive SQL shell over data/edara.db
│  │  ├─ routes/           # HTTP API (one file per area) — see §7
│  │  ├─ services/         # business logic (import, scoring, backup, disputes, panel, images)
│  │  └─ config/           # constants/config (panel, decisions, promotion, arabic text, ta3n)
│  └─ data/edara.db        # the live database file (git-ignored)
└─ client/
   ├─ index.html           # <html dir="rtl" lang="ar-EG-u-nu-arab">
   └─ src/
      ├─ App.tsx           # all routes (admin / member / print)
      ├─ pages/            # screens: admin/* and member/* (and admin/reports/*)
      ├─ components/       # member/*, officer/*, layout/* (+ shared)
      ├─ api/              # thin wrappers around fetch/axios per area
      ├─ context/          # AuthContext, Ta3nConfigContext, memberCommittee
      ├─ hooks/            # useLiveUpdates (WebSocket refetch)
      ├─ constants/        # importGuide, voteTone
      └─ utils/format.ts   # toArabicDigits / toWesternDigits / formatDate
```

---

## 5. Core data model (know this before changing tables)

Tables fall into two groups:

- **Imported tables (wiped & reloaded on each quarterly SQL import):**
  `officers` (denormalized officer records), `officer_kafaa`, `officer_punishments_geza`,
  `officer_holder_wazayef` (التدرج الوظيفي / career history), `officer_holder_paasat` (بعثات),
  `officer_holder_health`, `takyeem_scores`, `officers_in_nashra`, lookups (`ranks`, `units`,
  `jobs`, `grades`, `ta3n_types`, `l_lagna_type` …). `officer_children` is per-officer but survives
  the wipe (replaced per officer).
- **Persistent tables (system-managed, never wiped by import):**
  `users`, `committees`, `committee_officers` (denormalized snapshot of an officer inside a
  committee + voting/decision state), `committee_member_assignments`, `member_votes`,
  `committee_backups`, `import_logs`.

Key columns to remember:
- `committees.is_active` (only one live at a time), `.status` (draft/active/completed), `.tamhidy`,
  `.committee_type`, `.nashra_date` (drives which officers load).
- `committee_officers`: `serial` (display order), `is_active` (the one being voted on),
  `done`, `dispute`, `final_eval` (decision code), `l_lagna_type_c`, `ta3n_type`, `kaed_tawsya`.
- `member_votes`: `user_opinion` (2 = not voted), `eval_state`, keyed by
  (committee, user, officer, ta3n_type).
- Decision codes: `1=accept/يستمر, 0=reject/يحال, -1=يؤجل, 3=disciplinary, 4=unsuitability`.

---

## 6. "I want to change… → open these files" (the map)

### Member voting screen (what a member sees while voting)
- Screen container / polling / vote submit: `client/src/pages/member/MemberDashboard.tsx`
- tagdded layout: `client/src/components/member/TagddedVotingScreen.tsx`
- edarya layout: `client/src/components/member/EdaryaVotingScreen.tsx`
- **The officer card (بيانات الضابط / ملخص الاستيفاء):** `client/src/components/member/OfficerDataCard.tsx`
- The vote buttons: `client/src/components/member/VotingPanel.tsx`
- Members' tally box / final decision cards: `VoteTallyBox.tsx` / `DecisionCard.tsx`
- Commander's per-member breakdown (تصويت الأعضاء تفصيلي): `client/src/components/member/MemberVotesPanel.tsx`
- The data behind all of this comes from `GET /api/evaluations/current` →
  `server/src/routes/evaluations.ts` (the `/current` handler builds `activeOfficer`, `tagdded`
  indicators, `tally`, `memberVotes`, `memberStatuses`, `viewer`).

### شاشة التصويت (the projector / spectator display)
- Page: `client/src/pages/member/VotingDisplayScreen.tsx`
- Trimmed officer card (photo + الأقدمية/الوحدة/الوظيفة/التخصص): `client/src/components/member/DisplayOfficerCard.tsx`
- Pending-voters sidebar (في انتظار التصويت, animates each member out as they vote):
  `client/src/components/member/PendingVoters.tsx`
- The nav tab + guest gating: `client/src/components/layout/MemberLayout.tsx`
- Route: `client/src/App.tsx` (`/member/voting-screen`)
- Login entry button (opens it via the زائر seat): `client/src/pages/Login.tsx`
- Its data (decision-free list): the `memberStatuses` block in `evaluations.ts` `/current`.

### زائر (guest) plain view
- `client/src/components/member/GuestViewScreen.tsx` (just the officer card).

### Officer CV / reference screens (ملخص بيانات الضابط)
- Rendering (all tabs: basic, jobs, kafaa, paasat, punishments, health, children):
  `client/src/components/officer/OfficerCvContent.tsx`
  - التدرج الوظيفي row highlight colours + legend: `ROW_COLOR` and `JobsLegend` there.
  - Children table (name/gender/DOB/age): `CHILDREN_COLS` + `ageYears()` there.
- Member-side CV screen wrapper: `client/src/pages/member/OfficerCvScreen.tsx`
- The data endpoint: `GET /api/evaluations/officer-cv/:officerId` in `server/src/routes/evaluations.ts`.

### Admin — committee management
- Committee list / create / edit: `client/src/pages/admin/CommitteeList.tsx`, `CommitteeCreate.tsx`
- **Committee detail (tabs: members, officers, تسجيل الضباط, ترتيب العرض, reports; start/stop/
  إنهاء اللجنة, حذف قرارات اللجنة):** `client/src/pages/admin/CommitteeDetail.tsx`
- Live vote monitor: `client/src/pages/admin/LiveVotingMonitor.tsx`
- Decision review: `client/src/pages/admin/DecisionReview.tsx`
- All committee server logic (create, load-officers, load-members, show-officers, activate,
  deactivate, complete, bulk actions incl. `reset-session`, reports): `server/src/routes/committees.ts`

### Admin — officers
- Browser/list: `client/src/pages/admin/OfficerBrowser.tsx`
- Detail (read-only CV): `client/src/pages/admin/OfficerDetail.tsx`
- **Edit officer (identity, basic, and nested tables like الوظائف السابقة):**
  `client/src/pages/admin/OfficerEdit.tsx` (field lists `IDENTITY_FIELDS`, `BASIC_FIELDS`,
  `SECTIONS`). The server allowlist that must match it: `OFFICER_EDIT_COLS` and `NESTED_SECTIONS`
  in `server/src/routes/officers.ts`.
- Officer photos: `client/src/components/member/OfficerPhoto.tsx` (client),
  `server/src/routes/officers.ts` (`/:id/photo`, `/:id/family-photo`).

### Admin — members / panel
- Members browser: `client/src/pages/admin/MembersBrowser.tsx`
- Server: `server/src/routes/members.ts` and committee member endpoints in `committees.ts`.
- The fixed commander panel (job codes → seats, names, ranks): `server/src/config/committeePanel.ts`
- Materializing the panel onto committee seats: `server/src/services/panelMembers.ts`

### Data import (استيراد البيانات)
- The screen + the on-page guide (Oracle table → SQLite target, example SQL per table):
  `client/src/pages/admin/DataImport.tsx` + `client/src/constants/importGuide.ts`
- The parser + Oracle→SQLite mapping (`TABLE_MAP`, `COLUMN_MAP`, wipe/reload, value transforms):
  `server/src/services/importService.ts`
- The import route (accepts `{ sql_content }`, photo upload, logs): `server/src/routes/import.ts`

### Scoring & decisions
- tagdded scoring / finalize decisions: `server/src/services/scoringService.ts`
- Decision labels + توصية القائد encoding: `server/src/config/decision.ts`
- Promotion type table (`l_lagna_type`, taraky_c meanings): `server/src/config/promotion.ts`
- edarya case types / vote options / case fields (defaults): `server/src/config/ta3nDefaults.ts`,
  managed at runtime via `server/src/routes/ta3nTypes.ts` and `client/src/pages/admin/Ta3nTypes*.tsx`
  (client state in `client/src/context/Ta3nConfigContext.tsx`).
- Dispute detection: `server/src/services/disputeService.ts`
- Backups (auto on finalize/reset, manual): `server/src/services/backupService.ts`

### Reports (printed documents)
- Report pages: `client/src/pages/admin/reports/*` (e.g. DecisionsCardReport, VotingSummaryReport,
  StatisticsReport, FinalDecisionsReport, JudicalMedicalReport, CommitteeMembersReport,
  NotMstawfyReport). Print routes are in `client/src/App.tsx` under `/print/...`.
- Report data endpoints: `server/src/routes/reports.ts` and `committees.ts` (`/:id/reports/...`).

### Database schema / columns
- Adding a NEW column: add it to `server/src/db/schema.sql` **and** add an
  `ALTER TABLE … ADD COLUMN …` to the `additions` list in `server/src/db/connection.ts`
  (the schema only affects fresh DBs; migrations patch existing ones).
- If the column is imported: it auto-maps from the Oracle INSERT by lowercase name (add to
  `COLUMN_MAP` in `importService.ts` only if the name differs). Update the on-page guide in
  `importGuide.ts`.
- If it should be editable in the admin officer editor: add it to `OFFICER_EDIT_COLS` /
  `NESTED_SECTIONS` (server) and the matching field list in `OfficerEdit.tsx` (client).

### Auth / login
- Login screen (seat list, guest, admin login, شاشة التصويت button): `client/src/pages/Login.tsx`
- Auth state (token, role, isGuest, isCommander): `client/src/context/AuthContext.tsx`
- Server auth (login, quick-login, members list): `server/src/routes/auth.ts`,
  middleware `server/src/middleware/auth.ts`.

### Arabic digits / dates (see Gotchas)
- Client helpers: `client/src/utils/format.ts` (`toArabicDigits`, `toWesternDigits`, `formatDate`).
- Server-side verbatim-text digit conversion (for imported prose): `server/src/config/arabicText.ts`.

---

## 7. Backend API reference (server/src/routes)

- `auth.ts` — `POST /api/auth/login`, `GET /api/auth/members` (seat list), `POST /api/auth/quick-login`.
- `officers.ts` — `GET /api/officers` (paged list), `GET /:id/edit`, `PUT /:id` (officer + nested
  sections), `DELETE /:id`, photo endpoints. Allowlists: `OFFICER_EDIT_COLS`, `NESTED_SECTIONS`.
- `committees.ts` — the big one: create, `PUT /:id`, `/:id/load-members`, `/:id/load-officers`,
  `/:id/show-officers`, `/:id/officers/:oid/active`, `/:id/officers/bulk` (actions: done-all,
  reset-done, hide-all, reset-done-disputes, **reset-session**), `/:id/activate`, `/:id/deactivate`,
  `/:id/complete`, `/:id/backup|backups|restore`, registration + judicial case endpoints, reports.
- `evaluations.ts` — `GET /current` (member/guest live context), `POST /vote`, `POST /advance`
  (commander next/prev officer), `GET /officer-cv/:id`, `/committee/:id/status`,
  `/committee/:id/calculate`, `/committee/:id/disputes`.
- `import.ts` — `POST /api/import` (`{ sql_content }`), `POST /api/import/photos`, `GET /logs`.
- `reports.ts`, `lookup.ts`, `ta3nTypes.ts`, `members.ts` — supporting data.

Backend conventions: sql.js returns `{columns, values}[]`; always use the `mapRows()` helper.
Always call `saveDB()` after any write. Admin-only routes use `requireAdmin`.

---

## 8. Frontend routes (client/src/App.tsx)

- `/login` → `Login`.
- `/admin/*` (role=admin, `AdminLayout`): dashboard, committees (+ `:id`, `:id/monitor`,
  `:id/decisions`), officers (+ `:id`, `:id/edit`), members, requirements, ta3n-types, import.
- `/member/*` (role=member, `MemberLayout`): index = `MemberDashboard`,
  `voting-screen` = `VotingDisplayScreen`, `officer/:officerId` = `OfficerCvScreen`.
- `/print/committee/:id/*` (role=admin): the printable report pages.

State/data: `client/src/api/*` wrap the endpoints; `context/AuthContext` holds the session;
`hooks/useLiveUpdates` refetches on the WebSocket ping.

---

## 9. Request lifecycle example (member casts a vote)

1. Member clicks a choice in `VotingPanel` → `MemberDashboard.handleVote` → `api/evaluations.castVote`.
2. `POST /api/evaluations/vote` in `evaluations.ts` validates (allowed options per committee type /
   ta3n_type), writes `member_votes`, `saveDB()`, WebSocket broadcast.
3. Everyone's `useLiveUpdates` fires → refetch `GET /current` → the tally, `memberVotes`
   (commander), and guest `memberStatuses` update; the شاشة التصويت animates the voter out.

---

## 10. Import system (quarterly officer data)

- The Navy provides a `.sql` file of Oracle `INSERT` statements. Paste/upload it on Data Import.
- `importService.parseAndImport()` parses statements, maps Oracle tables → SQLite via `TABLE_MAP`
  (e.g. `ELASASY→officers`, `JOBS/OFFICERS_HOLDER_WAZYEF→officer_holder_wazayef`, `SECURITYS→
  officer_kafaa`, `GAZA→officer_punishments_geza`, `BA3AST→officer_holder_paasat`, `SE7A→
  officer_holder_health`, `MEMBERS→members`). Columns auto-map by lowercase; `COLUMN_MAP` holds the
  few renames. Mapped target tables are **wiped then reloaded** (except `officer_children`, replaced
  per officer).
- To support a new imported column: add the DB column (schema + migration), and if its Oracle name
  isn't just the lowercase of the SQLite name, add it to `COLUMN_MAP`. Update `importGuide.ts` so the
  on-screen guide/example matches.

---

## 11. Conventions & gotchas (read before editing)

- **Arabic-Indic numerals everywhere in the UI.** Never show Western digits to the user. Convert at
  render with `toArabicDigits` (from `utils/format.ts`); dates via `formatDate` (day-month-year — do
  NOT run a raw ISO date through `toArabicDigits`, the segments reverse in RTL). Underlying state,
  `key`s, `<option value>`, and API payloads stay Western.
- **RTL layout.** The app is `dir="rtl"`. In flexbox the first child sits on the **right**; use
  `flex-row-reverse` to flip. `border-s-*` = start side (right in RTL).
- **sql.js is in-memory.** The running server holds the whole DB and rewrites `data/edara.db` on each
  `saveDB()`. A script/`npm run db` that writes the file while the server is running will be
  overwritten — **stop the server first**, apply, then start it (startup never re-seeds officers).
- **Schema changes need a migration.** `CREATE TABLE IF NOT EXISTS` won't alter an existing DB. Add
  an `ALTER TABLE … ADD COLUMN` in `connection.ts` `runMigrations()` for existing DBs.
- **Officers are imported, not computed.** استيفاء (`taraky_estifa`/`estifa_job`) and promotion
  (`taraky_c`/`taraky_tagdeed`) arrive pre-computed as text; the app shows them as-is.
- **One active committee at a time.** Activating a committee deactivates the others.
- **Members auto-load from the fixed commander panel** (`config/committeePanel.ts`). The guest
  (زائر) is a member with `is_guest=1`, never assigned to a committee.
- **Reports must be pixel-perfect** — they replicate the legacy Oracle Reports output and are printed
  as official documents.
- **Legacy source of truth:** field visibility/labels should match the original Oracle Forms XML in
  `legacy-xml/`. Only fields with a visible Item are user-facing; a column existing in a schema does
  not mean it's shown.

---

## 12. Where "seed/demo" data comes from

On a fresh DB, `server/src/db/seed.ts` creates the admin, the guest seat, lookups, and the committee
panel member accounts — but **no officers** (those come from a real import). For local testing,
officers can be added via the Data Import screen or by re-importing a sample SQL dump. The user guide
for end users is `دليل-المستخدم.md` in the project root.
