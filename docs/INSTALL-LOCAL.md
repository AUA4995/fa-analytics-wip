# FA Analytics — running it on your own computer (for testing and daily use)

Decided 02/11/2026: Analytics runs **locally**, not on Vercel or the internet. For testing (UAT) that is Asal's
Windows work laptop. Later the plan is the office Mac Mini (always on) with private remote access (Sophos VPN or
Tailscale) — see the last section. Docker is **not** needed (the work laptop can't run it).

The app is one Next.js server plus one PostgreSQL database. The nightly jobs (Xero 05:30, Front 05:45, Thomax 02:15,
Thomax history 20:00–06:00, report emails hourly) run **inside** the server, so they only run while the app is
running and the computer is awake. On a laptop that sleeps at night, press the **Sync now** buttons in the morning.

## 1. What you need (once)

- Git for Windows, Node.js 22 LTS, PostgreSQL 16 — already installed for the Accounts Hub / CLM.
- PowerShell blocks `.ps1` scripts on the work laptop, so always type `npm.cmd` / `npx.cmd`, not `npm` / `npx`.

## 2. First install (about 30 minutes)

1. Get the code (the released version is the `main` branch):
   ```powershell
   git clone https://github.com/AUA4995/FA-Analytics.git C:\Projects\fa-analytics
   cd C:\Projects\fa-analytics
   ```
2. Create the database (open **SQL Shell (psql)** as `postgres`). Its own database — never the Hub's or CLM's:
   ```sql
   CREATE USER fa_analytics WITH PASSWORD 'choose-a-long-password' CREATEDB;
   CREATE DATABASE fa_analytics OWNER fa_analytics;
   ```
3. Settings file: `copy .env.example .env`, then open `.env` in Notepad and fill in:
   - `DATABASE_URL` — the password from step 2.
   - `TOKEN_ENCRYPTION_KEY` and `AUTH_SECRET` — two different random values. Make each with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Keep them forever** (losing
     `TOKEN_ENCRYPTION_KEY` means reconnecting Xero and re-entering the Thomax password). Save a copy in the password
     manager, not in a chat.
   - Xero, Front and Claude keys — can be added later (section 4). Leave empty for now.
4. Install, create the tables, build:
   ```powershell
   npm.cmd ci
   npm.cmd run db:deploy
   npm.cmd run db:seed
   npm.cmd run build
   ```
5. Start: double-click `scripts\windows\start.cmd` (keep that window open), then open http://localhost:3002.
   The first visit goes to **/setup** to create the owner account, then two-step sign-in.

## 3. Every day

- Start: `scripts\windows\start.cmd`. Stop: close its window.
- Start automatically at log-on (optional): Task Scheduler → Create Basic Task → "When I log on" → Start a program →
  `C:\Projects\fa-analytics\scripts\windows\start.cmd`.

## 4. Connecting the data (Settings / Data sources)

Keys go into `.env` on your computer only — never into the repo or a chat. Restart the app after editing `.env`.

| What | Where to get it | Then |
|---|---|---|
| Xero | developer.xero.com → New app → Web app; redirect URI `http://localhost:3002/api/xero/callback`; put client ID + secret in `.env` | Settings → Company → Connect Xero (read-only), then Data sources → Xero → Full re-read |
| Front | a Front API token from a Front admin → `FRONT_API_TOKEN` | Settings → Company → Front → load channels |
| Claude | an Anthropic API key for Analytics → `ANTHROPIC_API_KEY` | optional (summaries, reading PDFs) |
| Thomax | the .wms login (same kind Power BI uses); no `.env` entry — typed into the app, stored encrypted | Data sources → WMS → Connect → Explore all → check and save each table → Load history |

## 5. Updating to a new release

1. Close the app window.
2. Run `scripts\windows\update.cmd` (pulls `main`, updates packages, updates the database, rebuilds).
3. Start again with `start.cmd`.

If a step fails, the script stops and nothing is started; send the message it shows.

## 6. Backups (daily, encrypted, off-site)

The data that can't be re-read from Xero / Thomax is the cost-model settings, rates, targets, improvements, revenue
protection cases, reports and logs — and, after Thomax ends on 31/05/2027, the **Thomax archive itself**.

1. Set three Windows user environment variables (Start → "Edit environment variables for your account"):
   - `FA_BACKUP_DIR` — a folder inside OneDrive (that is the off-site copy).
   - `FA_BACKUP_PASSPHRASE` — a long passphrase; keep it in the password manager (Asal + Marcus). Without it a backup
     can't be opened.
   - `PGPASSWORD` — the `fa_analytics` database password.
2. Task Scheduler → Create Basic Task → Daily (e.g. 13:00, when the laptop is on) → `scripts\windows\backup.cmd`.
3. It keeps the last 30 daily backups.

**Restore** (into an empty database):
```powershell
"C:\Program Files\Git\usr\bin\openssl.exe" enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in fa_analytics_YYYY-MM-DD_HHMM.dump.enc -out restore.dump -pass env:FA_BACKUP_PASSPHRASE
pg_restore -h localhost -U fa_analytics -d fa_analytics --clean --if-exists restore.dump
```
Try a restore into a spare database once a month, so we know the backups work.

## 7. Tests (developers only)

Integration tests **delete data**. They only run when `DATABASE_URL` points at a database whose name ends in `_test`
(e.g. `fa_analytics_test`); with the real database they are skipped. Never point tests at `fa_analytics`.

## 8. Later: the office Mac Mini

Same steps with Homebrew (`brew install node@22 postgresql@16 git`), `npm` instead of `npm.cmd`, and instead of the
`.cmd` files: keep the server running with a LaunchAgent (or `pm2`), back up with the same `pg_dump` + `openssl`
commands to OneDrive, and reach it from outside the office only through the private connection Marcus and Tarek choose
(Sophos Connect VPN or Tailscale). Change `APP_URL` and the Xero redirect URI to the Mac Mini's private address.
Never expose it to the internet.
