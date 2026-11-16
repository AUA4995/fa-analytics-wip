# FA Analytics — hosting notes (for Marcus)

> **Current decision (02/11/2026, confirmed 11/11/2026):** Analytics runs locally — Asal's laptop for testing, then
> the office Mac Mini behind a private connection (Sophos VPN or Tailscale). Not on Vercel, not on the internet.
> Step-by-step: **docs/INSTALL-LOCAL.md**. The Docker notes below stay as an option for a server later.

Same pattern as the Accounts Hub: one Next.js app + one PostgreSQL database, deployed from GitHub
(`AUA4995/FA-Analytics`, branch `main`). Its **own database** — not the Hub's.

## Why Docker (a long-running server), not Vercel

The app runs background jobs inside the server process (pg-boss, stored in the same database):

| Job | When (Sydney time) | What |
|---|---|---|
| `xero-sync` | 05:30 daily | read-only Xero read (accounts, contacts, sales, bills, P&L, balance sheet, AU Payroll), then leakage detection, notifications, task re-checks |
| `front-tickets` | 05:45 daily | Front ticket counts per client |
| `report-tick` | every hour at :05 | scheduled report emails that are due; late project steps raised |
| `thomax-nightly` | 02:15 daily | Thomax copy: master tables in full + the last N days of every other table |
| `thomax-history` | 20:05, then step by step until 06:00 | Thomax history load, month by month, until it reaches today |

Serverless hosting (Vercel) stops the process between requests, so these would never run. Use Docker on the FA
server / a VM (or any host that keeps one container running). **Run exactly one container** — two would both send
the scheduled reports. (`JOBS_DISABLED=1` turns the jobs off on any extra instance.)

## 1. Database

PostgreSQL 16 (15+ is fine). Create a database and user, e.g.

```sql
CREATE USER fa_analytics WITH PASSWORD '…';
CREATE DATABASE fa_analytics OWNER fa_analytics;
```

Migrations run automatically when the container starts (`prisma migrate deploy`). Nightly backups (`pg_dump`) as for
the Hub; the data that can't be re-read from Xero / WMS is the cost-model settings, rates, debt schedule, KPI targets,
improvements, reports, recipients and logs.

## 2. Environment variables

Copy `.env.example` → `.env` on the server (never commit it). Required:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://fa_analytics:…@host:5432/fa_analytics?schema=public` |
| `APP_URL` | public address, e.g. `https://analytics.fulfilmentaustralia.com.au` (used in email links and the Xero redirect) |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes base64 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Encrypts Xero tokens. Keep it forever (changing it = reconnect Xero) |
| `AUTH_SECRET` | another random 32+ characters. Changing it = everyone sets up 2FA again |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | a **separate Xero app for Analytics** (developer.xero.com), read-only scopes |
| `XERO_REDIRECT_URI` | `<APP_URL>/api/xero/callback` — must match the Xero app exactly |
| `FRONT_API_TOKEN` | Front API token (sends report emails / drafts, counts tickets) |
| `ANTHROPIC_API_KEY` | optional — empty = AI summaries off |
| `JOBS_DISABLED` | optional, `1` only on extra instances |

Asal checks keys by their first/last characters only; nobody should paste full secrets into chats or tickets.

## 3. Build and run

```bash
git clone https://github.com/AUA4995/FA-Analytics.git && cd FA-Analytics
docker build -t fa-analytics .
docker run -d --name fa-analytics --restart unless-stopped --env-file .env -p 3002:3000 fa-analytics
```

Put it behind the same HTTPS reverse proxy as the Hub (Caddy / nginx / IIS) on its own host name. Health check:
`GET /api/health` → `{"ok":true,"db":"up"}` (also used by Docker's HEALTHCHECK).

**Update:** `git pull && docker build -t fa-analytics . && docker rm -f fa-analytics && docker run …` (same command).
Migrations apply on start.

## 4. First start

1. Open `APP_URL` → **/setup** creates the owner (only while there are no users) → two-step sign-in.
2. Settings → Company: connect Xero (read-only), set the Front send channel. Then Data sources → Xero → *Full re-read*
   (24 months; takes a few minutes).
3. Settings → Contacts & recipients: internal domains and who may receive reports.

Lost owner access: `npm run owner:recover` on a machine with the repo and the server's `.env` — it emails the owner a
reset link through Front, nothing else.

## 5. Other apps

Other apps (CLM, Accounts Hub, Marcus's app) read from Analytics with keys made in **API connections → Keys we give
out** — see `docs/API.md`. `/api/v1/*` needs a key, not a sign-in.

## 6. What the app writes outside itself

Only report emails and drafts through Front. Xero, Dyspatch, WMS and Front data are read-only.
