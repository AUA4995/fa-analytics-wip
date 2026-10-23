# FA Analytics

Analytics app for Fulfilment Australia: cost to serve, leakage, improvements & savings, rate review, reports, KPI and finance.

**Status:** clickable demo with made-up data. The real app (Next.js + Prisma + PostgreSQL, hosted on Vercel) is built only after Asal's green light.

- `demo/index.html` — the clickable demo (single file, open in a browser). All figures are made up.
- `demo/src/` — source parts the demo was assembled from (reference only).
- `docs/BRIEF.md` — the single source of truth for decisions. Rewritten on every change.

Rules: read-only to Xero, Dyspatch, WMS and Front (except report emails via Front). Keys only in environment variables, never in the repo. Costs, margins and pay are internal.
