# FA Analytics

Analytics app for Fulfilment Australia: operations from a full Thomax copy (order lookup, receiving, SLA, trends),
cost to serve (TDABC and Full absorption), leakage, revenue protection, improvements & savings, reports, KPI and
finance, plus read-only APIs for the other FA apps. Decisions and scope: [`docs/BRIEF.md`](docs/BRIEF.md) (single source of truth).
Clickable demo with made-up data: `docs/demo/index.html`.

**Stack:** Next.js (TypeScript) · PostgreSQL + Prisma 7 · pg-boss · same foundation as the FA Accounts Hub
(sign-in with 2FA, users, company, branding, layout).

**Rules:** Xero, the WMS, Front and Dyspach are **read-only** (the only exception: report emails sent through Front).
Keys live only in `.env`, never in the repo. Costs, margins and pay are internal. No made-up numbers: until a source is
connected, a page says "no data yet".

## Status

| Chunk | What | State |
|---|---|---|
| 1 | Foundation from the Accounts Hub: sign-in + 2FA, users, company, branding, analytics menu, Xero connection (read-only, incl. reports and AU Payroll), Front send channel | ✅ |
| 2 | Settings and logs: rules, sites, clients, suppliers, staff & allocation matrix, services & minutes, cost pools, Xero account and WMS code mapping; Logs on every value; CSV import | ✅ |
| 3 | Data sources: WMS file imports (Thomax, 3PLWMS, Logiwa) with column mapping, overlap and duplicate checks; Xero read (accounts, contacts, sales lines since 2021, monthly P&L, AU Payroll); Front tickets per client; nightly jobs. The full Thomax copy came later (row 8) | ✅ |
| 4 | Cost engine (TDABC / Full absorption, unused capacity by resource, cost per order B2C / B2B) + Cost & margin pages with every number opening its calculation; client rates until CLM | ✅ |
| 5 | Leakage (under-billing per service via Xero item codes, weekly minimums, under-pricing, rate checks with Dyspach / WMS exports, log + import), rate workbench (the review calendar and stages live in the CLM), tasks verified on resolve, notifications after syncs | ✅ |
| 6 | Reports (screen = PDF, Front email: dry run / draft / auto, schedules, pre-send brake), Contacts & recipients, Finance (P&L, cash & debt, working capital, concentration, bank pack with approval; Xero balance sheet + bills read), KPI (targets in Rules, site filter, scorecard), Improvements & savings (idea → initiative, proposed calculation and plan, steps → tasks, roadmap) | ✅ |
| 7 | Main Overview dashboard (incl. provisional break-even), API connections (connected systems, keys we give out, /api/v1), tests, hosting notes (docs/HOSTING.md, docs/API.md) | ✅ |
| 8 | Thomax copy: every table and field from 2021 through the read-only Query API (same as Power BI), history at night, nightly top-up, owners confirm keys and fields to leave out; Order lookup for admins | ✅ |
| 9 | Local install without Docker: docs/INSTALL-LOCAL.md, Windows start / update / backup scripts (encrypted backups to OneDrive and the NAS), docs/HOSTING.md (laptop or office Mac Mini) | ✅ |
| 10 | Cost model fixes: office split, space factor, Logiwa credits in $, ticket scoring, four roles like the Accounts Hub; every dollar spread in Full absorption | ✅ |
| 11 | Revenue protection page (avoided / recovered / lost cases); rate workbench moved under Cost & margin | ✅ |
| 12 | Operations: Receiving, SLA, Trends & forecast, Setup (Returns coming soon) | ✅ |
| 13 | APIs for the HR app's Workforce Planning (`/api/v1/workload/daily`, `/api/v1/inbound`), overtime from Xero Payroll, "Suggest with Claude" for WMS file columns (column names and value shapes only), notifications placeholder; same look as the Accounts Hub | ✅ |

**Known limits:** Returns, ticket SLA (needs Front) and invoicing SLA (needs the Accounts Hub) show "coming soon" /
"not connected"; CMC packing uses a typed share per client; break-even treats every step as fixed; Thomax, Xero payroll
and Front were tested with sample data only — first real runs need checking.

## Local setup (Windows work laptop — no Docker)

> For running it to **use** (UAT and daily), follow **docs/INSTALL-LOCAL.md** (build + start, auto-start, updates,
> encrypted backups). The steps below are for development (`npm run dev`).

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
