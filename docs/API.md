# FA Analytics — API for other apps

Base address: `<APP_URL>/api/v1` (e.g. `https://analytics.fulfilmentaustralia.com.au/api/v1`).
Keys are made in **API connections → Keys we give out** (admins and the owner). A key is shown once; only its first
16 characters are kept. Each key has scopes and an expiry, and can be revoked at any time.

```
Authorization: Bearer fa_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Errors are JSON `{ "error": "..." }`: 401 = no / unknown / revoked / expired key, 403 = the key lacks the scope,
400 = a parameter is wrong (`field` says which).

| Method | Path | Scope | Returns |
|---|---|---|---|
| GET | `/me` | — | key name, prefix, scopes, expiry |
| GET | `/volumes?month=YYYY-MM` | `volumes:read` | orders, units, units / order, SKUs / order per client (default: last complete month) |
| GET | `/kpi?site=all\|smi\|par` | `kpi:read` | 12 months per KPI, target, status (`green` / `amber` / `red` / `none` / `needs-data`) |
| GET | `/leakage?status=open\|recovered\|all` | `leakage:read` | findings with their working (internal) |
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
