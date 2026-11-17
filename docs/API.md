# FA Analytics — API for other apps

Base address: `<APP_URL>/api/v1` — Analytics runs inside the office network only (e.g. `http://<mac-mini-address>:3002/api/v1`),
so the calling app must be on the same machine or the private connection. On a laptop install (`start.cmd`) the app
listens on 127.0.0.1 only, so only apps on that same computer can call it; on the Mac Mini it listens on the office
network / tunnel.
Keys are made in **API connections → Keys we give out** (admins and the owner). A key is shown once; only its first
16 characters are kept. Each key has scopes and an expiry, and can be revoked at any time.

```
Authorization: Bearer fa_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Errors are JSON `{ "error": "...", "detail": "..." }` (`detail` only when there is more to say): 401 = no / unknown /
revoked / expired key, 403 = the key lacks the scope, 400 = a parameter is wrong (the message says which), 409 = not
set up yet in Analytics (`detail` says what to set), 429 = more than 120 calls a minute with one key (wait for
`Retry-After` seconds; also after 30 calls with a wrong key from one address in 15 minutes).

| Method | Path | Scope | Returns |
|---|---|---|---|
| GET | `/me` | — | key name, prefix, scopes, expiry |
| GET | `/volumes?month=YYYY-MM` | `volumes:read` | orders, units, units / order, SKUs / order per client (default: last complete month) |
| GET | `/workload/daily?from=YYYY-MM-DD&to=YYYY-MM-DD[&site=smi\|par]` | `operations:read` | orders created per client per day from the Thomax copy (≤ 93 days per call; 409 until Operations → Setup is done). Days with no orders for a client are left out (= 0). |
| GET | `/inbound?from=YYYY-MM-DD&to=YYYY-MM-DD[&site=smi\|par]` | `operations:read` | expected deliveries (ASN) and receipts with arrived / received times (Sydney wall-clock, no zone). At most 50,000 per list (`maxRowsPerList`); more → `"truncated": true`, ask for fewer days. |
| GET | `/kpi?site=all\|smi\|par` | `kpi:read` | 12 months per KPI, target, status (`green` / `amber` / `red` / `none` / `needs-data`) |
| GET | `/leakage?status=open\|recovered\|all` | `leakage:read` | findings with their working (internal) — the Accounts Hub reads missed billing here (decision 11/11/2026) |
| GET | `/costs?month=YYYY-MM` | `costs:read` | base cost per order (TDABC and Full absorption), unused capacity, cost and margin per client (internal) |
| GET | `/finance` | `finance:read` | company P&L by month (last 24), bank ratios, cash (internal; no pay by person) |
| GET | `/improvements` | `improve:read` | ideas and initiatives, savings, steps |
| POST | `/tasks` | `tasks:write` | creates a follow-up task (201 `{ id }`) |

`POST /tasks` body:

```json
{ "title": "Check new rates in Dyspach", "detail": "Signed 24/10", "owner": "Asal Artikbaeva", "due": "2026-11-01",
  "link": "https://clm.example/contract/123", "clientId": "…", "by": "person in your app", "externalId": "contract-123-rates" }
```

`externalId` makes the call safe to repeat: while a task with the same id is open, no second one is made. The task shows
the key's name as "Where", and Logs record the key's name (plus `by`).

Rules: read-only except `tasks:write`; nothing here writes to Xero, Front, Dyspach or the WMS; pay by person is never
returned. Every call updates the key's "last used" and call count.

Planned, not built yet (need data Analytics doesn't have): open orders by SKU (`/workload/open`, after the Thomax order-line
fields are confirmed) and measured minutes per order (`/norms`, after timed activities are mapped).

**Site filter** (`site=`): if the site has no WMS warehouse codes yet, or the Warehouse field isn't chosen in
Operations → Setup for a list the route returns, the answer is 409 — never all sites' numbers labelled as one site.
Leave `site` out to get all sites.
