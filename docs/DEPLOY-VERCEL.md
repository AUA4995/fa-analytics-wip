# Deploy on Vercel + Marcus's Postgres

Same setup as the Accounts Hub: the app on Vercel (Pro plan, region Sydney), the database on Marcus's Postgres.
The laptop install (docs/INSTALL-LOCAL.md) still works — the code picks the right way to run background jobs by itself.

## 1. Database (Marcus)
- A separate database and user, e.g. `fa_analytics`, with its own password; SSL on.
- Room for the Thomax copy (all tables since 2021 — a few GB) and the database included in his backups.
- Connection string → `DATABASE_URL` below. Add `?sslmode=require` if his server needs it.

## 2. Vercel project
- New project from the GitHub repo `AUA4995/FA-analytics`, framework Next.js. `vercel.json` already sets the region
  (syd1), the build (`npm run vercel-build`: Prisma client, then — for Production only — database migrations and the
  safe seed, then the build) and the cron (`/api/cron/tick` every 5 minutes).
- Pro plan: the tick runs up to 800 seconds (Fluid compute, on by default). Hobby can't run it.
- Optional custom domain, e.g. analytics.fulfilmentaustralia.com.au.

## 3. Environment variables (Vercel → Settings → Environment Variables, Production)
| Name | Value |
|---|---|
| `DATABASE_URL` | from step 1 |
| `APP_URL` | the app's address, e.g. `https://analytics.fulfilmentaustralia.com.au` (email links use only this) |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 — generate once, keep it: it unlocks the stored logins |
| `AUTH_SECRET` | a long random string |
| `CRON_SECRET` | a long random string (16+ characters); Vercel sends it to the cron tick |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | the Xero app (a new one, or the Hub's with a second redirect URL) |
| `XERO_REDIRECT_URI` | `<APP_URL>/api/xero/callback` — must match the Xero app exactly |
| `FRONT_API_TOKEN` | Front API token (read + drafts) |
| `ANTHROPIC_API_KEY` | optional — Claude summaries and column suggestions |
| `DB_POOL_MAX` | optional, default 3 connections per function |

`TRUST_PROXY` isn't needed: on Vercel the caller's address comes from Vercel itself.

## 4. After the first deploy
1. Open the app → `/setup` → create the owner (2-step verification).
2. Settings → Company: connect Xero (owner), check Front.
3. Data sources → WMS: type the Thomax Query API login (cluster "e"), Explore, check and save the tables. The history
   loads every night 20:00–06:00 (or press "Keep loading now"); the nightly copy runs from 02:15.
4. API connections: the Accounts Hub key, and keys for the HR app.
5. Settings → Rules: workers comp rate and the other rates when you have them.

## How background work runs on Vercel
There is no always-on process, so pg-boss isn't started (src/lib/jobs/runner.ts). Every 5 minutes Vercel Cron calls
`/api/cron/tick` (src/lib/jobs/tick.ts), which runs what is due by the Sydney clock — Xero once a day from 05:30, Front
tickets from 05:45, report emails hourly, the Thomax nightly copy from 02:15 (spread over several ticks until every table
was tried), then the history load. Buttons such as "Sync now" queue their work and it starts within 5 minutes.
Each daily or hourly job is claimed once, so overlapping ticks never run it twice.

**Limit:** one Xero "Full re-read" of all history must finish within one tick (about 12 minutes). If it doesn't, run it
from a laptop install once; the daily incremental sync is small.
