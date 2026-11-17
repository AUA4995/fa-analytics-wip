# FA Analytics — running it on your own computer (for testing and daily use)

Decided 02/11/2026: Analytics runs **locally**, not on Vercel or the internet. For testing (UAT) that is Asal's
Windows work laptop. Later the plan is the office Mac Mini (always on) with private remote access (Sophos VPN or
Tailscale) — see the last section. Docker is **not** needed (the work laptop can't run it).

The app is one Next.js server plus one PostgreSQL database. The nightly jobs (Xero 05:30, Front 05:45, Thomax 02:15,
Thomax history 20:05–06:00, report emails hourly) run **inside** the server, so they only run while the app is
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
   CREATE USER fa_analytics WITH PASSWORD 'choose-a-long-password';
   CREATE DATABASE fa_analytics OWNER fa_analytics;
   ```
3. Settings file: `copy .env.example .env`, then open `.env` in Notepad and fill in:
   - `DATABASE_URL` — the password from step 2. If the password has any of `@ : / # % ?` in it, it must be
     URL-encoded (e.g. `@` → `%40`), or simply choose a password with only letters and digits.
   - `APP_URL` — leave `http://localhost:3002` on the laptop.
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
   It only answers on this laptop (127.0.0.1), not to other computers on the office or home Wi-Fi.
   The first visit goes to **/setup** to create the owner account, then two-step sign-in — have an authenticator app
   (Microsoft or Google Authenticator) on your phone ready to scan the QR code.

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

Set up the backups (section 6) first — `update.cmd` refuses to update without a working backup.

1. Close the app window.
2. Run `scripts\windows\update.cmd` (pulls `main`, updates packages, updates the database, rebuilds).
3. Start again with `start.cmd`.

If a step fails, the script stops and nothing is started; send the message it shows.

## 6. Backups (daily, encrypted, one copy off-site, one on the NAS)

The data that can't be re-read from Xero / Thomax is the cost-model settings, rates, targets, improvements, revenue
protection cases, reports and logs — and, after Thomax ends on 31/05/2027, the **Thomax archive itself**.

1. Database password file (so the password isn't kept in an environment variable): press **Win + R**, type
   `%APPDATA%` and Enter; make a folder `postgresql`; in it, save from Notepad a file named `pgpass.conf` with one
   line `localhost:5432:*:fa_analytics:THE-DATABASE-PASSWORD`. In Notepad's Save dialog choose "All files", or it is
   saved as `pgpass.conf.txt`, which doesn't work.
2. Set three Windows user environment variables (Start → "Edit environment variables for your account"):
   - `FA_BACKUP_DIR` — a folder inside OneDrive (the off-site copy).
   - `FA_BACKUP_NAS_DIR` — a folder on the office NAS (the on-site copy), e.g. `\\SMITHFIELD-NAS\Backups\Analytics`.
   - `FA_BACKUP_PASSPHRASE` — a long passphrase; keep it in the password manager (Asal + Marcus). Without it a backup
     can't be opened.
3. Task Scheduler → Create Basic Task → Daily (e.g. 13:00, when the laptop is on) → `scripts\windows\backup.cmd`.
   Then the task's Properties → Settings → tick **"Run task as soon as possible after a scheduled start is missed"**
   (a day the laptop was off at 13:00 still gets a backup). Run it once by hand first and check both copies appear.
   Each run adds a line to `backup-log.txt` in the backup folder — glance at it now and then.
4. Backups older than 30 days are deleted. `update.cmd` also takes a backup before every update.

### Monthly test restore (into a spare database — never the live one)

Do this in **Command Prompt** (cmd), not PowerShell. The app can keep running; the live database isn't touched.

1. Open SQL Shell (psql) as `postgres` and run:
   `DROP DATABASE IF EXISTS fa_restore_test;` then `CREATE DATABASE fa_restore_test OWNER fa_analytics;`
2. In Command Prompt, go to the backup folder; `dir /o-d fa_analytics_*.dump.enc` lists the newest first — use its
   name in the next line:
   ```bat
   cd /d "%FA_BACKUP_DIR%"
   "C:\Program Files\Git\usr\bin\openssl.exe" enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in fa_analytics_YYYY-MM-DD_HHMMSS.dump.enc -out "%TEMP%\restore.dump" -pass env:FA_BACKUP_PASSPHRASE
   "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -h localhost -U fa_analytics -d fa_restore_test "%TEMP%\restore.dump"
   del "%TEMP%\restore.dump"
   ```
   (`del` matters: the decrypted file isn't encrypted.)
3. Check it worked: in psql, `\c fa_restore_test` then `SELECT count(*) FROM "Client";` — it should match the app.
4. Clean up: `\c postgres` (leave the test database first), then `DROP DATABASE fa_restore_test;`

### Real restore (only if the live database is lost or broken)

1. **Close the app window first.**
2. If the database is gone (new computer): in psql as `postgres`, `CREATE DATABASE fa_analytics OWNER fa_analytics;`
   — and use the **same** `.env` values (`TOKEN_ENCRYPTION_KEY`, `AUTH_SECRET`) from the password manager, or Xero
   and Thomax must be connected again and everyone sets up 2FA again.
3. Decrypt the backup as in step 2 above, then:
   `"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -h localhost -U fa_analytics -d fa_analytics --clean --if-exists "%TEMP%\restore.dump"`
   then `del "%TEMP%\restore.dump"`. This **replaces** everything in the live database with the backup — anything
   entered after that backup is lost. Ask Claude if unsure.

### If an update stops half way

`update.cmd` takes a backup first. If it stops after "updating the database" but before the build finished, run
`update.cmd` again once; if it still fails, restore the backup taken just before (real restore above) and go back to
the previous version with `git checkout <previous commit>` — ask Claude for the exact line.

## 7. Tests (developers only)

Integration tests **delete data**. They only run when `DATABASE_URL` points at a database whose name ends in `_test`
(e.g. `fa_analytics_test`); with the real database they are skipped. Never point tests at `fa_analytics`.

## 8. Later: the office Mac Mini

Same steps with Homebrew (`brew install node@22 postgresql@16 git`), `npm` instead of `npm.cmd`, and instead of the
`.cmd` files: keep the server running with a LaunchAgent (or `pm2`), back up with the same `pg_dump` + `openssl`
commands to OneDrive, and reach it from outside the office only through the private connection Marcus and Tarek choose
(Sophos Connect VPN or Tailscale). Change `APP_URL` and the Xero redirect URI to the Mac Mini's private address.
Never expose it to the internet.
