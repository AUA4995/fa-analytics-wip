# FA Analytics

Analytics app for Fulfilment Australia: cost to serve (TDABC and Full absorption), leakage, improvements & savings,
rate reviews, reports, KPI and finance. Decisions and scope: [`docs/BRIEF.md`](docs/BRIEF.md) (single source of truth).
Clickable demo with made-up data: `docs/demo/index.html`.

**Stack:** Next.js (TypeScript) · PostgreSQL + Prisma 7 · pg-boss · same foundation as the FA Accounts Hub
(sign-in with 2FA, users, company, branding, layout).

**Rules:** Xero, the WMS, Front and Dyspatch are **read-only** (the only exception: report emails sent through Front).
Keys live only in `.env`, never in the repo. Costs, margins and pay are internal. No made-up numbers: until a source is
connected, a page says "no data yet".

## Status

| Chunk | What | State |
|---|---|---|
| 1 | Foundation from the Accounts Hub: sign-in + 2FA, users, company, branding, analytics menu, Xero connection (read-only, incl. reports and AU Payroll), Front send channel | ✅ |
| 2 | Settings and logs: rules, sites, clients, suppliers, staff & allocation matrix, services & minutes, cost pools, Xero account and WMS code mapping; Logs on every value; CSV import | ✅ |
| 3 | Data sources: WMS file imports (Thomax, 3PLWMS, Logiwa) with column mapping, overlap and duplicate checks; Xero read (accounts, contacts, sales lines since 2021, monthly P&L, AU Payroll); Front tickets per client; nightly jobs. Thomax API waits for Thomax's API details | ✅ |
| 4 | Cost engine (TDABC / Full absorption, unused capacity by resource, cost per order B2C / B2B) + Cost & margin pages with every number opening its calculation; client rates until CLM | ✅ |
| 5 | Leakage (under-billing per service via Xero item codes, weekly minimums, under-pricing, rate checks with Dyspatch / WMS exports, log + import), rate review (calendar, stages, workbench), tasks verified on resolve, notifications after syncs | ✅ |
| 6 | Improvements, reports (PDF + Front email, forecast), KPI, Finance, Contacts & recipients | — |
| 7 | API keys we give out, tests, hosting notes | — |

## Local setup (Windows work laptop — no Docker)

Prerequisites: Node 22+, PostgreSQL 16 (already installed for the Accounts Hub), Git.

> PowerShell blocks `.ps1` scripts on this laptop, so use `npm.cmd` / `npx.cmd` instead of `npm` / `npx`.

```powershell
git clone https://github.com/AUA4995/FA-analytics.git C:\Projects\fa-analytics
cd C:\Projects\fa-analytics
copy .env.example .env         # then edit .env — at minimum DATABASE_URL, TOKEN_ENCRYPTION_KEY, AUTH_SECRET
npm.cmd install
```

Create the database (in `psql` as the postgres superuser) — separate from the Accounts Hub's database:

```sql
CREATE USER fa_analytics WITH PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE fa_analytics OWNER fa_analytics;
```

Then:

```powershell
npm.cmd run db:deploy          # creates the tables
npm.cmd run db:seed            # company defaults
npm.cmd run dev                # http://localhost:3002 (the Accounts Hub keeps 3001)
```

The first visit goes to **/setup** to create the owner account (only possible while no users exist), then two-step sign-in.

**Xero:** create a separate Xero app for Analytics (developer.xero.com → New app, Web app), redirect URI
`http://localhost:3002/api/xero/callback`, put its client ID and secret in `.env`, restart, then Settings → Company →
**Connect Xero (read-only)**. It asks only for read permissions (accounting, reports, AU Payroll).

**Front:** `FRONT_API_TOKEN` in `.env`, then Settings → Company → Front · sending emails → Load channels → pick FA Accounts.

## Tests

```powershell
npm.cmd test                   # unit tests; integration tests run too when DATABASE_URL points at a test database
```
