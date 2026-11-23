# Post-Surgery Journal — Plan

A daily log and scrapbook of my ACL reconstruction + meniscus repair recovery
(right knee, surgery 15 Aug 2026). Public can read the journey; my surgeon (in
another city) follows along, comments, and updates the prescription.

## Decisions

- **Dates:** surgery day = Day 0. Week 1 = Days 0–6, so post-op weeks run
  Sat–Fri. "Week X · Day Y" on every page. All dates in Asia/Kolkata.
- **Access (no accounts):** three levels, decided on the server from a
  session cookie. The browser never sends the mode.
  - **Public** (no PIN): read-only.
  - **Me** (site PIN): edit everything, tick off exercises/medicines, see and
    edit the prescription.
  - **Doctor** (doctor PIN, entered on the unlock screen): see and edit the
    prescription (exercises + medicines), comment. Cannot edit or delete logs.
    "Exit doctor mode" locks the browser (back to public).
- PIN hashes (bcrypt) in `.env`. 5 wrong tries → 15-minute lockout per IP,
  stored in Postgres so it survives restarts. Sessions: random token in an
  httpOnly cookie (30 days), SHA-256 of the token stored in Postgres.
- Public but unlisted: `noindex` meta + header, `robots.txt` disallow.
- **$0 only, no paid services.**

## What the public sees vs. private

| Public | Me + doctor only |
|---|---|
| Week/Day, timeline, milestones, heatmap, charts | Prescription + history |
| Exercises ticked + actual reps | Prescribed sets, targets, notes |
| Pain, swelling, stiffness, angles, mood, journal | Medicines and their ticks |
| Photos/videos not marked private | Red flags, comments, weekly summary |

## Stack

| Part | Choice | Free-plan note |
|---|---|---|
| Database | Neon Postgres (project `post-surgery-journal`, Singapore) | 1 GB per project |
| Tests | Neon branch `test` | separate data from `main` |
| Photos | Neon Object Storage, private bucket `media`; the API signs requests (SigV4) and streams photos after a permission check | 5 GB per project |
| Videos (Phase 2) | Google Drive links, embedded player | your Drive |
| Hosting | Vercel Hobby (static client + Express API as a function) | personal use |

Dependencies, kept minimal: `express`, `@neondatabase/serverless`, `bcrypt`,
`react`, `react-dom`, `recharts` (Phase 3) + build tools (`typescript`,
`vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/*`).
Hand-written instead of libraries: cookie parsing, security headers, input
validation, router, S3 presigning, rate limiting, heatmap. Node 23 runs the
TypeScript server and tests directly (`node:test`, no tsx/vitest).

## Folder structure

```
post-surgery-journal/
├── shared/        post-op date maths, shared types, seed prescription
├── server/
│   ├── migrations/   numbered .sql files
│   ├── scripts/      migrate.ts, seed.ts, hash-pin.ts
│   ├── src/          config, db, auth, middleware, routes, app.ts, index.ts
│   └── test/         node:test suites
├── client/        Vite + React + Tailwind (index.html, src/, public/robots.txt)
├── .env.example
└── README.md
```

## Tables

- `sessions(token_hash, mode, created_at, expires_at)`
- `pin_attempts(ip, failures, locked_until, updated_at)`
- `exercises(id, name, session, days smallint[], sets, target, notes, active, sort_order)`
- `medicines(id, name, dose, times text[], start_date, end_date, notes, active)`
- `prescription_changes(id, item_type, item_id, action, changed_by, before jsonb, after jsonb, created_at)`
- `day_logs(date, pain, swelling, stiffness, flexion_deg, extension_deg, mood, journal, flag_*)`
- `day_items(id, date, kind, source_id, slot, name, sets, target, notes, done, actual)` —
  a snapshot of the prescription for that day, so old days keep what was
  prescribed at the time.
- Phase 2+: `media`, `milestones`, `comments`.

## API (all under `/api`; every request's session is checked)

| Route | Who |
|---|---|
| `GET /auth/session`, `POST /auth/unlock {pin, as}`, `POST /auth/lock` | anyone |
| `GET /prescription`, `GET /prescription/history` | me, doctor |
| `POST/PATCH /prescription/exercises[/:id]`, `POST/PATCH /prescription/medicines[/:id]` | me, doctor |
| `GET /days/:date` | anyone (private fields stripped for public) |
| `POST /days/:date/ensure`, `PATCH /days/:date`, `PATCH /days/:date/items/:id`, `DELETE /days/:date` | me |
| Phase 2: `/days?before=` timeline, `/media`, `/milestones` | read: anyone; write: me |
| Phase 3: `/stats/*`, `/weeks/:n/summary` | stats: anyone; summary: me, doctor |
| Phase 4: `/comments` | me, doctor |

## Pages

`/unlock`, `/` (Today; read-only for public and doctor), `/day/:date`,
`/prescription`; Phase 2 `/timeline` (public home); Phase 3 `/progress`,
`/week/:n`.

## Phases

1. ✅ PIN access + sessions + rate limit, prescription (exercises + medicines)
   seed + CRUD with change log, Today checklist + daily fields.
2. ✅ Doctor comments (moved up from Phase 4 after doctor-mode feedback):
   threads on any day and on the plan, "about" picker, unread badge, Comments
   inbox; doctor shortcuts to comment / change the plan.
3. ✅ Timeline/scrapbook (public home), photo uploads (Neon Object Storage,
   served through the API so permissions are checked per view and browsers
   never contact the storage host), Drive video links, milestones.
4. ✅ Progress page (public): streak, stat tiles, consistency heatmap by
   post-op week, flexion/extension/pain+stiffness/weekly-completion charts,
   table view. Weekly summary at /week/:n (me + doctor) with week comments.
5. ✅ Plan history at /prescription/history: who changed what, field by
   field, filter to the doctor's changes, "New" tag since last visit.
6. Deploy to Vercel (set real PINs first).
