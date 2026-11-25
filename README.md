# Post-Surgery Journal

A daily log and scrapbook of an ACL reconstruction recovery. Anyone with the
link can read the journey; the site PIN unlocks logging and the prescription;
the doctor PIN lets the surgeon follow along and update the exercise and
medicine plan.

See [PLAN.md](PLAN.md) for the design and the build phases.

## What's built

- **Access without accounts.** Anyone with the link can read everything except
  the prescription, medicines and notes on the plan (so the doctor never needs
  to log in just to look). Site PIN ("me") to log; doctor PIN to comment and
  change the plan.
  The mode lives only on the server, in a session row keyed by an httpOnly
  cookie (30 days). 5 wrong PINs lock an IP out for 15 minutes.
- **Prescription.** Exercises (session, days, sets, reps/time, notes, on/off)
  and medicines (dose, times of day, date range). Every change is logged with
  who made it and the before/after values; Plan → History shows them.
- **Today.** A checklist built from the prescription for that weekday, one tap
  to tick, optional actual reps; pain, swelling, stiffness, knee angles, mood,
  red flags, journal, photos and Drive videos, milestones. Saves as you go.
- **Comments.** Me ↔ doctor threads on any day and on the plan, each optionally
  "about" an exercise, reading or medicine; unread badge and an inbox.
- **Overview.** The doctor's home page: today's numbers with what they were last
  time, the last 14 days as a colour strip and a table, missed days and red
  flags called out. Statuses: On track (80%+ of the day's exercises), Partial,
  Not logged (`shared/status.ts`).
- **Journey.** The public home: a scrapbook timeline of days and milestones,
  with a status chip on each day and markers for missed stretches.
- **Progress.** Streak, heatmap and charts (public); a weekly summary for the
  doctor with its own comments. Skipped days count as scheduled, so they lower
  the completion %.

## Setup

Needs Node 23.6 or newer (it runs the TypeScript server directly) and a free
[Neon](https://neon.com) account.

```bash
npm install
cp .env.example .env
```

1. In Neon, create a project and a second branch called `test`. Put each
   branch's pooled connection string in `DATABASE_URL` and `TEST_DATABASE_URL`.
2. Make the two PIN hashes and paste them into `.env`:
   ```bash
   npm run hash-pin   # once for the site PIN, once for the doctor PIN
   ```
3. Create the tables and load the starting prescription:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. Run it:
   ```bash
   npm run dev        # API on :3001, site on http://localhost:5173
   ```
   To open it on your phone, run `npm run dev:client -- --host` and visit the
   Network address on the same Wi-Fi.

Photos need a private bucket on Neon Object Storage (Neon console → Storage)
and a credential with `storage:read` and `storage:write`; fill in the
`STORAGE_*` values in `.env`. Without them the app works, but photo upload is
switched off. Give the `test` branch its own bucket with the same name.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (auto-restarts) + Vite dev server |
| `npm test` | API tests against the `test` branch (wipes that branch's tables) |
| `npm run typecheck` | TypeScript checks for server and client |
| `npm run build` | Production build of the client into `dist/` |
| `npm run build:vercel` | Full Vercel build into `.vercel/output` |
| `npm run db:migrate` | Applies new files in `server/migrations/` |
| `npm run db:seed` | Loads the starting prescription (only into an empty table) |
| `npm run hash-pin` | Prompts for a PIN and prints its bcrypt hash |

## Deploy (Vercel, free)

`npm run build:vercel` writes `.vercel/output` (Vercel's Build Output API):
the static site, plus the whole API bundled into one function in Singapore
(`sin1`, next to the Neon database). `vercel.json` tells Vercel to run it.

1. **Choose real PINs** (the development ones were shared in chat):
   `npm run hash-pin` twice: once for your PIN, once for the doctor's.
2. Push the repo to GitHub, then in Vercel: **Add New → Project → Import**
   the repo. Leave the framework as "Other"; `vercel.json` sets the commands.
3. **Settings → Environment Variables** (Production), no quotes around values:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | main branch pooled connection string |
   | `SITE_PIN_HASH` | hash of your PIN |
   | `DOCTOR_PIN_HASH` | hash of the doctor's PIN |
   | `SURGERY_DATE` | `2026-08-15` |
   | `TIMEZONE` | `Asia/Kolkata` |
   | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | as in `.env` (main branch endpoint, not the test one) |

   Don't add `TEST_*` values to Vercel.
4. Deploy. Then open the site, unlock with your new PIN, and check Today.
5. Send the doctor the link and **only the doctor PIN**.

Database changes: run `npm run db:migrate` locally (it targets `DATABASE_URL`
in `.env`) before deploying code that needs a new migration.

## Troubleshooting

**`getaddrinfo ENOTFOUND …neon.tech`.** Some home routers and internet
providers refuse DNS lookups for Neon's database hosts. Check with:

```bash
dig +short @1.1.1.1 <your-endpoint-host>   # resolves → it's your DNS
```

Fix: System Settings → Wi-Fi → Details → DNS, and add `1.1.1.1` and
`8.8.8.8`. The hosted site is not affected; this is only for running locally.

## Security notes

- PINs are only stored as bcrypt hashes; session tokens only as SHA-256 hashes.
- Every write needs an `X-PSJ: 1` header (blocks cross-site form posts) and the
  right mode; the server strips private fields (medicines, red flags,
  prescribed sets/targets) before answering public requests.
- The site sends `noindex` (meta tag, `X-Robots-Tag`) and `robots.txt`
  disallows crawling.
- A 6-digit PIN is guessable by someone using many IP addresses. If a PIN
  leaks, make a new hash and delete all rows in `sessions` to log everyone out.
