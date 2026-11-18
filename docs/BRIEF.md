# FA Analytics app — brief (single source of truth)

**Owner:** Asal Artikbaeva (Revenue Protection / Business Analyst, Fulfilment Australia — 3PL, Smithfield and Parramatta)
**Status:** built (green light 23/10/2026; all 7 chunks done 24/10/2026) — in GitHub AUA4995/FA-Analytics, waiting for Asal's test. Hosting: Docker (background jobs need a long-running server) — docs/HOSTING.md for Marcus; API for other apps — docs/API.md.
**Clickable demo:** https://claude.ai/artifact/6881NafvCCHKqaB1FigRV3 — **v3 published 23/10/2026 (all decisions up to the v3 round); waiting for Asal's review.** All figures in the demo are made up (client names are real, their rates/volumes/costs are not).
**Last updated:** 23/10/2026 — this file is rewritten whenever decisions change; removed features are deleted, not kept.

---

## 1. Goal
1. Know what each client really costs us, per service, and what one order costs the company on average.
2. Catch leakage per client per month: **under-billing** (CLM rate × WMS volume vs Xero billed) and **under-pricing** (rate below cost).
3. Rate reviews with CLM (cost, margin, volumes → new rates → schedule of rates).
4. Track improvements and savings (cost no longer spent), separately from leakage (revenue not collected), and run them as projects.
5. Reports (weekly / monthly / quarterly), KPIs, break-even, bank/finance reporting, forecasts — branded PDFs by email.

## 2. Plan and working style
- **Demo first** (made-up data) → Asal confirms → build the real app and connect all APIs at once (CLM ready, Accounts Hub live by then).
- Small checkable chunks; short progress updates with time left; Windows laptop, simple PowerShell steps (`npm.cmd`), one line at a time; never ask for a full secret.
- When discussing: Asal dictates by voice in several messages — **wait until she says she has finished**; don't fire pop-up questions mid-dictation. Write explanations in the chat itself (text placed between tool calls is not visible to her); after a long message, summarise point by point what was understood.
- Australian English, DD/MM/YYYY, AUD 2 decimals. Reply in the language Asal uses (Russian or English).

## 3. Rules
1. **One owner per data type.** Other apps read a copy, never edit someone else's data.
2. **Star, not a web:** Analytics is the centre for numbers.
3. **Apps talk only through APIs with keys**, read-only by default, never through each other's database.
4. **Never write to outside systems** (Xero, Dyspach, WMS, Front). Comparisons show match / don't match; a person decides; "Update" changes only our app; fixes elsewhere are tasks done by hand. (Exception: sending report emails / drafts / reminders through Front.)
5. **Never invent numbers.** Unreadable = "unknown, check source". Assumptions are labelled "estimate" until measured.
6. Costs, margins, buy rates and pay are internal. Clients get only Client-safe reports; lenders/advisers only External finance reports (§10).
7. **Nothing new is added automatically** from a sync: the app suggests, a person accepts / edits / rejects (§13).

## 4. Tech and look
- Next.js (App Router) + TypeScript, Prisma, PostgreSQL. Own repo, own DB. Hosted by Marcus on Vercel Pro (GitHub → auto-deploy). Keys only in env vars.
- Same look as the Accounts Hub (`claude/FA_Accounts_Hub_BUILD_BRIEF.md` §2.7, §12.0): navy #010028, blue #1F54EE, white; stacked logo; left menu pin / auto-hide icon rail; white top bar; page sub-menus; Inter font.
- **Every line is clickable everywhere** → details panel on the right, short and to the point (no lectures):
  - **how it is calculated** (formula with the real values);
  - **which settings it uses** — shown as editable fields; editing in the panel = editing the same setting in Settings (synced), everything recalculates;
  - **where the data comes from** (system, table/report, period, link);
  - **Logs** button next to every editable value (§12);
  - history over time where relevant.
- **Stacked panels:** a line inside a panel opens a new panel on top; "← Back" / "Close this panel" / Esc closes only the top one; "Close all" or clicking the dark area on the left closes all.
- **★ Period picker** at the top of every menu: quick picks (week, month, quarter, year, 5 years / all history) + calendar "from – to"; compare with previous period or same period last year; the whole page recalculates. Costs are monthly: for part-month ranges, volumes are exact and unit costs come from the month (labelled).
- **★ Forecast toggle** next to the period picker where it makes sense (orders, revenue, costs, margin, break-even, cash): dashed continuation with a low–high band; seasonal method on WMS history from 2021 (orders × revenue per order); every forecast is saved and later shown "forecast vs actual". Not shown for leakage/tasks.
- **★ Notifications** icon in the top bar (§13).

## 5. Menu
Main: Overview · Operations · Cost & margin · Leakage · Revenue protection · Improvements & savings · Reports · KPI · Finance · Tasks. Bottom: Data sources · API connections · Settings. (Rate review left the menu on 16/11/2026: its calendar and stages live in the CLM; the workbench is under Cost & margin.)

**Overview principle (★ every menu's Overview, same as the main dashboard):** a short summary of that topic — a few cards, 1–2 charts, top 5 items, no repeating the sub-menu tables. **Clicking a card opens its detail in place on the same page (card turns dark); clicking it again shows everything.** Every line and card is clickable, filterable and opens details.

**Layout:** with the left menu collapsed, the page is aligned left (no centring gap).

- **Overview (main dashboard):** five toggle cards — Services margin · Leakage found · Priced below cost · Orders · **Break-even** (Mark's key ask). Click a card → it turns dark and only its detail block shows; click again → all. Detail blocks: margin 12-month trend + margin by client; open leakage; below-cost lines; orders 12 months + week vs week; break-even chart + calculation. Always shown: **Needs attention** (open leakage, renewals ≤60 days, tasks 7+ days) and **Renewals and reviews**.
- **★ Cost & margin** (merges the old "Cost to serve" and "Cost model"):
  - **Base cost** — what the company spends to serve one order / one unit, same for all clients.
    - Three cards: **TDABC · cost per order** (B2C and B2B lines) · **Full absorption · cost per order** (B2C and B2B) · **Unused capacity** (% and $ a month). Click a card → dark, only that variant; click again → both variants side by side. Each variant has a one-line description (TDABC = for client rates and rate reviews; Full absorption = for break-even, bank and real profit).
    - Cost per unit for every service, in both variants; each line opens its calculation with editable settings.
    - Tiles: Pools · Labour · Minutes · Overheads (later: History).
  - **Cost to serve** — what a specific client costs, depending on how complex they are: cost, billed, margin per client; drivers vs average (SKUs per order, B2B/B2C, returns, tickets, storage); lines below cost → rate review; staff working on the client with their % (editable, "Add staff member"). TDABC / Full absorption switch applies. Cards: margin % all clients · clients under 15% floor · cost per order range (cheapest–dearest client) · $ a month on below-cost lines.
- **Leakage:** Overview · Under-billing · Under-pricing · Rate checks · Leakage log. ★ Overview cards: **Found · Recovered · Open · Rate mismatches · Recovery rate %** (with average days to recover = found date → billed in Xero). Recovered detail: client, what, $, Xero invoice, date, who, days to recover; recovered money ≈ 100% to profit (work already done and paid for). Open detail: age, owner, next step. Default view: found vs recovered by month, by type and status, top 5 open.
- **★ Improvements & savings:** Overview · Ideas · Initiatives (§9a).
- **Operations** (§9c): Order lookup · Receiving · SLA · Returns (coming soon) · Trends & forecast · Setup.
- **Revenue protection** (§9f): cases where FA stopped or failed to stop a loss — avoided, recovered, lost.
- **Rate workbench** sits under **Cost & margin** (§8). **Reports** (§9). **KPI:** Overview · Operations · People · Finance · Warehouse · Quality & clients (§9).
- **★ Finance** (bank / lender reporting, §9b). **Tasks:** Open · Snoozed · Done (§13).
- **API connections:** Connected to · Keys we give out. **Settings:** Company · Users · Contacts & recipients · Login & security · Branding · Rules · Clients · Suppliers · Staff & allocation · mapping tables (§14).

## 6. Method
**Two costing views (★):**
- **TDABC · practical capacity** (Kaplan & Anderson): clients get only the minutes and space actually used, priced at practical capacity; idle time and empty space are not loaded onto clients but reported as **Unused capacity**.
- **Full absorption (fully loaded):** all company costs for the period spread over clients, including idle time and empty space.
- Unused capacity = Full absorption − TDABC. Shown **by resource** (floor staff per site, CSR, space per site, machines CMC / Sure Sort), not by activity — the same people do several activities.

**Rules:**
- **Labour cost = gross + super (12%) + payroll tax + workers comp.** PAYG is inside gross. Agency / labour-hire bills (supplier bills in Xero) are added to the floor labour pool of their site (★ provisional C).
- **★ Two kinds of utilisation, per site, editable in Settings → Rules and in the details panels (synced, logged):**
  - **Labour utilisation** (share of paid time available for activities). Start: floor 85%, CSR 80% — estimates (Kaplan & Anderson practical-capacity rule of thumb 80–85%); later measured = WMS activity minutes ÷ paid minutes.
  - **Space utilisation** (pallet positions used ÷ total; floor-stacked pallets count as used). Asal: Parramatta ~100%, Smithfield 90%+.
- **★ Separate cost pools per site (provisional B):** own cost per minute, rent, equipment. Parramatta is owned (no rent in Xero) → notional market rent (or actual ownership costs) so its clients aren't understated. Shared costs (admin, software, office) split by orders.
- **Cost per minute** = pool cost ÷ practical minutes. **Standard minutes** per activity, editable, marked Estimate / WMS / Time study. WMS pack times understated → time study.
- **Overheads by driver:** rent → pallet-weeks (D: maybe by space type — open); equipment → pallet moves; automation → orders that actually go through the machine (F — open); software → orders; packaging materials → orders packed (H: actual per client — open); admin → per labour minute (G: or by revenue — open).
- **★ Packing split into two services:** **Manual packing** (labour + materials) and **Automated packing (CMC CartonWrap)** = machine costs (lease/service/carton) **+ pre-pack labour** (now: item in bubble bag + packing slip stuck on so the CMC scans it; before ~09/2026: bubble wrap per bottle, cardboard tray, paper strapping, slip under the strap). Flow wrap may come later → list of packing methods must be extendable.
- **★ Process-change markers:** dated events on Base cost history (e.g. "CMC pre-pack switched to bubble bags, ~09/2026 — bubble bags from China arrived by container") so jumps are explained; the before/after saving is tracked in Improvements & savings.
- **★ B2B / B2C:** order with more than **20 units** (units, not SKUs) = B2B — threshold editable in Settings and in the B2B/B2C details panel (synced). Possibly also "or WMS order type = B2B" — decide with real data.
- **★ Staff allocation to clients:** people work across clients. Floor staff % comes from the WMS automatically (who picked/packed which client's orders); manual % for staff WMS doesn't see (CSR, supervisors, forklift) or as an override. Each cell shows its source (WMS / manual). Total per person ≤ 100%.
- Postage/carrier margin excluded. Account management = Front tickets × minutes (E: minutes by ticket type — open).
- **Break-even (FA-wide):** fixed costs ÷ contribution per order (revenue per order − variable cost per order: packaging + casual share). Fixed/variable split set in Settings (staff type and supplier fixed/variable flags), to confirm with Mark.

**History (★):** assumptions log + frozen monthly snapshots (month = base, locked at Xero month close; quarter/year from months; weekly reports use weekly volumes with last closed month's unit costs); recalculating a closed period creates a new version, never overwrites.

## 7. Checks
- **Under-billing:** tolerance $5 (editable); weekly minimum $300 after any levy period; Xero billed wins when Xero and WMS differ.
- **Under-pricing:** below cost = red; below margin floor (15%, editable) = amber.
- **Rate checks:** CLM vs Dyspach vs WMS → match / don't match; a person decides which is right.
- **Leakage statuses:** Open · Task created · Explained · Recovered. Leakage log replaces FA_Leakage_Log.xlsx (import).

## 8. Rate review — calendar and stages in the CLM; workbench in Analytics
> **Decision 16/11/2026:** the review calendar and the stages board belong to the CLM. Analytics keeps only the
> **workbench** (Cost & margin → Rate workbench: costs, margins, proposed rates and their effect). Stage, owner and due
> date are not edited in Analytics. The text below about the calendar and stages describes the CLM side.
- **Review types:** Annual CPI increase (contract anniversary) · Carrier rate pass-through (e.g. AusPost July increase → Dyspach SELL) · Contract renewal · Ad-hoc / below-cost review (started by the app when a line goes below cost).
- **Calendar:** clients × next 12 months, a coloured dot per review type; dates come **from CLM** (coming soon; demo dates). Click → details + "Open in Workbench".
- **In progress:** board of open reviews by stage: Preparing → Analysis → Proposal → Client negotiation → Signed → Rates in WMS & Dyspach → Checked on first invoice. Card = client, type, owner, due date; stage changeable in the panel. Source: CLM (coming soon).
- **Workbench:** per client per billable service: current rate, cost (TDABC), margin %, 3-month avg volume. New rates or "raise lines below target margin" → +$/month, +$/year. Cards (new margin, current margin, change, account management) are clickable with the calculation. "Send schedule of rates to CLM" → amendment draft, rates only — **marked Coming soon** until the CLM link is built.

## 9. Reports and KPI
- **Reports:** each saved report is its own sub-menu item; "+ New report" (name, template, period, type, client, schedule). **"Include forecast" switch on every report**: when on, the forecast is shown, included in the PDF and saved with the schedule.
  - **Client workload · weekly:** filter cards **Total orders · Single-SKU · B2C · B2B** (B2B = more than the Settings threshold, default 20 units, synced); a card click filters all three tables: **Orders by number of SKUs** (1, 2, … 10 separately, then 10+) · **Orders by number of units** (1, 2, 3, 4–5, 6–10, 11–20, 21–50, 50+) · **Compared with previous week**. Numbers big, % small underneath (client total orders big, % share of total below). Client row → panel.
  - **Client trends · monthly:** vs last month and same month last year; growing / declining / steady per client with 6-month sparkline; new / lost clients; mix shift (B2B share, single-SKU share, units per order, CMC share); weekday pattern and peak days; returns rate.
  - **Quarterly review:** QoQ and YoY per client; forecast for next quarter with range; capacity outlook per site vs practical capacity.
  - **Year in review:** orders 24 months (+ next-year forecast); clients start → end, won / lost; **client churn rate** (lost ÷ clients at start of year) and **revenue churn** (lost clients' last-12-month revenue ÷ total); **churn details** (client, last order, orders/month before leaving, revenue lost, reason from Front/CLM); new clients; seasonality heatmap.
  - **Client volumes:** client filter (all = Internal; one client = Client-safe, can go to that client): orders, units, cartons/pallets in, pallet-weeks, returns.
  - **Revenue protection for Mark:** recovered, leakage, below-cost, savings, margin vs baseline, cash collected faster shown separately (not profit).
  - Asal's old workload report (upload) may still adjust layouts.
- **★ KPI (redesigned):** tiles with a status colour stripe (green on target · amber within 3–10% · red off target), value, target, 12-month sparkline, change vs last month. **Site filter** Smithfield / Parramatta / both sites. **Overview:** cards On target · Close · Off target · Score (click = those KPIs in place); scorecard green/amber/red per group (click → group); **What's red** list. Click a KPI → panel: 12-month chart vs target line, split by site and by client, formula and source. Targets editable in Settings → Rules.
- **KPI groups:** Operations (orders/day, dispatched before cut-off, dock-to-stock, returns in 48 h) · People (picks/hour, orders per labour hour, labour cost per order, overtime) · Finance (margin, cost & revenue per order, leakage, debtor days, credit notes %) · Warehouse (pallet positions used per site, revenue per position, slow stock 90+ days) · Quality & clients (mis-pick rate, damage, stock accuracy, tickets per 100 orders, top-5 share, client growth/churn).

## 9a. ★ Improvements & savings
- **Purpose:** savings = cost no longer spent (not leakage). Examples: CMC pre-pack change, supplier price changes, direct sourcing (bubble bags from China), space, rostering, automation payback.
- **Idea vs initiative = the same item at different stages** (one record, moves with its history, nothing retyped):
  - **Idea** — proposed, not approved or started; **estimated** saving only; can be parked or rejected. Statuses: Idea · Parked · Rejected.
  - **Initiative** — approved and being done or done; **measured** before/after; runs to **Verified** (saving confirmed by 1–3 months of real data). Statuses: Approved · In progress · Done · Verified.
  - "Approve" moves an idea into Initiatives and opens its project (below).
- **Sub-menus (order):** **Overview** · **Ideas** · **Initiatives**. Inside Ideas and Initiatives: category filter; many items per category; categories can be added.
- **Ideas** have a **review deadline** and a **reviewer**, and a horizon (short / long term). **Initiatives** have a **priority / queue** (1 = do first) and are listed in that order.
- **Overview:** cards Savings delivered · Initiatives in progress (late count) · Ideas waiting for review · Verified (click = detail in place). Default view:
  - **This week** strip: idea reviews and project steps due this week.
  - **Timeline (calendar roadmap):** ideas = diamond at review deadline; initiatives = bars with progress; today line; zoom Week / Month / Quarter / Year; category filter; click a row → zooms into that item's steps (← All items).
  - **Short-term plan:** next 3 months as calendars; days with a review (amber) or step due (blue), click a day → item.
  - **Long-term plan:** 12 months by quarter, ideas and initiatives in each quarter.
- **Each item:** baseline (before, measured) → after (measured from Base cost / Xero) → saving × volume = $/month, $/year; type **Hard saving** / **Cost avoidance** / **Soft (capacity freed)** (CIPS practice); owner, dates, logs.
- **"+ New idea" — guided form, then Claude (no code release):**
  1. Name and short description.
  2. **Category** (dropdown): Workflow · Suppliers · Space · Labour · Equipment & automation.
  3. **Sub-category** (depends on category), e.g. Workflow → Receiving · Storage · Picking · Packing · Returns · Dispatch · CSR · Admin · Accounts · General.
  4. **Detail** where it exists, e.g. Packing → Manual / Automated (CMC) / later Flow wrap.
  5. **What changes** (multi-select): process & time · supplier & price · materials · equipment · space · people & rosters.
  6. Claude proposes the calculation from building blocks matching the choices (minutes before/after × volume × cost per minute · unit price before/after × quantity from that supplier's Xero bills · materials per order before/after × orders · space before/after × cost per position · investment and payback) and the mapping (service, clients, site, Xero supplier/account, start date) → preview on current figures → Asal edits/confirms → saved and logged. Only ideas needing data the app doesn't have require a code change.
  - Examples: *CMC prepping optimisation* = Workflow → Packing → Automated; changes: process + materials + supplier → pre-pack minutes, materials per order (bubble wrap + tray + paper strap → bubble bag), bubble bag price from Xero. *Manual packing, cheaper supplier* = Workflow → Packing → Manual; changes: supplier → unit price × quantity from that supplier's bills.
- **Initiative = project** (kept simple — not a full project-management tool):
  - **Steps:** Claude proposes a standard plan for the category, e.g. packing change: measure before → order / new supply → trial → training → roll-out → embed & check → measure after & recalculate → report.
  - **Editable project timeline:** each step's name, start and due dates, owner and status are edited in the panel; steps can be added, removed and moved up/down; "Show on timeline" opens the roadmap zoomed into the project. Every change logged.
  - **People:** Claude suggests participants from Settings → Staff by category and position (e.g. Packing · Automated → operations manager, warehouse managers, Smithfield packers); Asal edits — e.g. drop Paul for a small change and use Neil and Max (warehouse managers), pick only some packers, add anyone.
  - **Owner per step** + status (not started / in progress / done / late). Steps become Tasks for their owners; reminders a few days before the due date and when late (in-app or email via Front, internal people only); comments and updates on the project timeline.
  - Staff without an app login (e.g. packers) are listed as participants; only people with a login get tasks and reminders (warehouse confirmations could come later via Marcus's app).
  - The "measure after" step triggers the saving recalculation; when 1–3 months of data confirm it, the initiative becomes **Verified**. Everything editable and logged.

## 9b. ★ Finance (bank and lender reporting)
- **Overview:** 5 cards with 12-month sparklines and change vs last year — Revenue · Gross margin % · EBITDA margin % · Cash at bank · DSCR (click = detail in place: 24-month chart, accounts, cash flow, DSCR calculation). Default: **combo chart** revenue bars + EBITDA % line, 24 months (+6-month forecast with the toggle); **P&L waterfall** for the month (revenue → cost of services → overheads → EBITDA → depreciation & interest → net profit); **bank health gauges** DSCR (minimum 1.25×), debt/EBITDA (<2.5× comfortable), current ratio (>1.2 healthy).
- **P&L:** by month (last 6) + last 12 months + year before + YoY; switch "% of revenue"; rows expand to Xero accounts (each account → 12-month chart); financial years table below.
- **Cash & debt:** cash flow waterfall for the month (opening → EBITDA, working capital, capex, tax, loan principal, interest → closing); DSCR trend with the 1.25× line; gauges; debt schedule (facility, balance, rate, repayment, end date, security).
- **Working capital:** debtor and creditor days trend (target line); aged receivables and payables (current, 1–30, 31–60, 61–90, 90+); overdue clients (read-only; chasing stays in the Accounts Hub).
- **Clients** (concentration, names hidden by default) · **Bank pack**.
- Typical bank pack (confirm with the actual bank): P&L, balance sheet, cash flow (2–3 years + YTD); revenue growth, gross margin, EBITDA; debt service (DSCR, interest cover, debt/EBITDA); working capital; client concentration and contract terms; 12–24 month forecast with assumptions; tax and obligations (BAS, super, payroll tax); assets/security and covenants.
- Built from Xero (full read access) + WMS order history. Forecast seasonal on full history.
- **Report type External finance:** company totals only; no client rates/margins, no pay by person; **client names hidden by default** ("Client A, B, C"), can be shown manually; must reconcile to Xero and lodged figures; forecasts labelled; **approval (Mark or the accountant) before sending**.

## 9c. ★ Operations (built 17/11/2026)
> **What is built:** a full read-only copy of Thomax (all tables and fields from 2021, through the Query API — the same as
> Power BI; history loads at night) and the **Operations** menu: **Order lookup** (admins; the order/receipt/stock trail
> across tables) · **Receiving** (expected vs arrived vs received by client and type; waiting longer than the target now)
> · **SLA** (same-day dispatch with the 14:00 cut-off and B2B +2 working days; receiving within 48 h; by client) ·
> **Returns** (coming soon) · **Trends & forecast** (orders per week per client; next 7 days = same-weekday average,
> holidays skipped) · **Setup** (which Thomax fields mean client / created / done …, the SLA rules and NSW holidays).
> **Dropped:** the morning plan 06:00 and afternoon check 13:00 — Marcus already sends those reports from Thomax.
> Ticket SLA needs Front, invoicing SLA the Accounts Hub — shown as "not connected" until then.
> The HR app's Workforce Planning reads `/api/v1/workload/daily` and `/api/v1/inbound` (docs/API.md).
> The planning notes below are kept for history.

### Earlier plan (superseded where it differs from the box above)
- **Source:** Thomax Query API (Logiwa later), read-only. Fields still to confirm (see §15) before the demo.
- **Site filter on every WMS / SLA page:** All · Smithfield · Parramatta (company-wide or per warehouse).
- **Sub-menus:** Overview · Morning plan 06:00 · Afternoon check 13:00 · Receiving · Returns (coming soon) · SLA.
  - **Overview:** cards Ready to pick · Expected by 14:00 · Shipped today · At risk of SLA · Inbound expected.
  - **Morning plan (snapshot 06:00):** open orders with stock available to pick at 06:00, by client (orders, lines, SKUs, units; single / multi-SKU, B2B); not ready (no stock, hold, embargo) shown separately; forecast of orders still to arrive by 14:00 (same weekday, last 4–8 weeks + events), shown as a range and labelled forecast; Pick / Pack workload.
  - **Afternoon check (snapshot 13:00, start of lunch):** what must still ship today under the SLA vs done, by stage (Pick / Pack / Dispatch) and client; at-risk list; receiving due today.
  - **Receiving:** expected receipts from the WMS (ASN) **and** from Front emails (when the client emailed but no ASN yet), merged, source shown; by client and receipt type (unit / outer / pallet / container — palletised or not), ETA, SKUs, units, status (expected → arrived → receiving → received → discrepancy); row → lines per SKU; "Waiting for packing list from client" with the Front ticket, date asked and days waiting; "Remind" makes a Front draft (never sends); a task after N days.
  - **Returns:** coming soon (from Front later).
  - **SLA:** one page, no separate tabs.
    - **Top: target chips** — Pick & pack: in by 14:00 → same day, B2B 48 h · Ticket first response: **4 working hours (Mon–Fri 09:00–17:00, CSR hours)** · Receiving · Invoicing · Client payment. Click a chip → pop-up to edit; same value as Settings → Rules (synced, logged).
    - **Under the chips: filters** for the whole page and the panels — period (day / week / month / quarter / year / custom range, vs previous period) · clients (all / one / several) · site (All / Smithfield / Parramatta).
    - **Cards, our side and the client's side:** Pick & pack (% shipped on time) · Receiving (% received on time; client: % with packing list / ASN in advance) · Tickets (% answered within 4 working h, time to resolve; client: how fast they answer our requests) · Invoicing (% invoices issued on time; client: % paid by due date, days late).
    - **Card → panel:** trend for the period, by client, list of breaches with links (order, Front ticket, Xero invoice), formula and target; the same filters at the top of the panel.
    - **Below the cards:** scorecard table, clients × areas, green / amber / red.
    - **Receiving SLA:** stock received into the system **within 48 hours of delivery** to the warehouse; containers need advance notice (period per the FA Receiving Guidelines — to confirm from the latest version). Full rules from the Receiving Guidelines PDF (latest seen: sent by Marcus 20/10/2026; Asal says a newer update exists).
    - **Sources:** tickets — Front (already connected; Front already has SLA rules "Reply goal" / "Resolution goal" with warning / breach tags — reuse them where they match); pick & pack and receiving — Thomax API (+ Front emails for notices); **invoicing and client payments — from the Accounts Hub**: David's billing calendar (when each client is invoiced) and each client's payment terms are in the Hub's settings, read through a **read-only API key the Hub gives to Analytics** (the Hub needs a "keys we give out" section and these endpoints; Analytics never changes anything in the Hub). Payment dates — Xero.
- **Snapshots** at 06:00 and 13:00 are stored (plan vs actual); "Refresh now" in the day. Times configurable.
- **Delivery:** on the page **and** by email (Front, internal recipients, PDF + short summary), email switchable off in settings.
- **Front events:** extracted in Analytics, in the existing Front connection (which already reads emails for client admin complexity) — one more element: deliveries, embargoes, sales, launches, pickups. Workforce Planning in Marcus's HR platform reads them through the Analytics API.

## 9f. Revenue protection (built 17/11/2026)
- Cases where someone stopped a loss (avoided), got money back (recovered), or the loss happened (lost, not prevented):
  what happened, $ it would have cost, $ it cost, status and evidence. Amounts not yet known are marked TBC and are
  not counted. **No staff names** — corrective action reports (CARs) live in the HR app.

## 9d. Notifications panel (coming soon — to discuss)
- A separate notifications menu / panel (top or bottom of the app): urgent things Analytics notices, e.g. something serious read from the Accounts Hub. **Not designed yet — discuss with Asal before building.** The demo shows a "coming soon" placeholder so it isn't forgotten. (Today's "New since the last sync" list on Tasks stays as it is.)

## 9e. One login for all FA apps (planned — after the apps are live)
- **Idea:** one sign-in for Accounts Hub, Analytics, CLM (and Marcus's HR if he adds it), a home page with tiles (only the apps a person may use; one app → straight in), and a horizontal app switcher at the top; each app keeps its own vertical menu.
- **Apps stay separate** (own database, own deploys, bridges through API keys). The shared login only proves **who** you are; **what** you may do is decided inside each app by its own owner (Asal is Primary Owner of Hub / Analytics / CLM; Marcus is Primary Owner of HR, Asal a manager there). Tiles are shown only if that app says the person has access.
- **Own login, not Microsoft 365** (the Microsoft sign-in on 3PLWMS was slow and annoying for the team). Same flow as today: password + authenticator code, "trust this device" so it's once a day. Sensitive apps may ask for the code again (to decide).
- **Who manages the shared login** (it can block a person in all apps at once, e.g. on leaving): to decide — Asal and Marcus both, logged. Owner keeps an emergency direct sign-in to each app.
- Order: launch the apps first; then a tiles home page; then the shared login, apps moving to it one by one. HR joins via the standard (OpenID Connect) — a small change on Marcus's side.

## 10. Email / PDF sending
- "Email / PDF" on every report topic: Send PDF now · Preview · Schedule (on/off; Dry run → Draft in Front → Send automatically). Multi-page branded PDF; Claude summary at the top (marked AI) only from the figures included.
- Sent via **Front** (FA Accounts mailbox). **Recipients only from Settings → Contacts & recipients** (dropdown).
- **Report types:** **Internal** · **Client-safe** (one client; volumes, orders, SKUs, SLA, returns only) · **External finance** (§9b).
- **★ Costing variant choice on export:** TDABC · Full absorption · both. The unselected variant is **completely absent** from the file (no card, chart, Unused capacity line or mention in Claude's text — Claude only receives the selected data). Saved with scheduled reports.
- **Brakes:** recipients re-checked against lists; Internal → Internal only; Client-safe → that client's contacts only; External finance → Lenders & advisers only, after approval; PDF scanned before every send for costs, margins, other clients' names and unselected-variant figures → blocked + task; first client send always a draft; external sends logged.

## 11. Data sources (category tiles = tabs)
- **WMS · volumes:** Thomax (dotWMS) Query API now — contract ends **31/05/2027**, ~1 month to export → pull full history from 2021 now, a few months per night, kept as read-only archive · 3PLWMS (Tarek's) manual file uploads, checked for duplicates/overlap · Logiwa API key when live. Joined by mapping tables.
- **Accounting · Xero:** direct, read-only, everything (accounting, reports, payroll, chart of accounts, assets, **attachments**). Nightly; closed months locked.
- **Client service · Front:** read-only emails, tickets, **attachments**; FA Accounts / Support / Sales only.
- **Contracts & rates:** CLM (master) · Dyspach rate export (API not confirmed).
- **AI · Claude:** reads original supplier invoices on Xero bills (older bills → original found in Front) and Front attachments; writes report summaries; proposes calculations, project steps and participants for new improvement ideas. Confidence + link per value; person confirms low confidence. Own key, call log, budget US$30/month.

## 12. API connections and Logs
- **Connected to:** every system with status, last sync, data period, test / change key; **Ended connections** keep data as archive (Thomax after 31/05/2027).
- **Keys we give out:** read-only by default, scoped, expiry, shown once, revoke; pay by person never through a key.
- **★ Logs on every editable value** (not one dump in Settings): small "Logs" button next to the field → who, when, old → new, why. Changes through an API record **which key/app** made them (and the user name if that app sends it).

## 13. ★ Notifications and follow-up tasks
- After each sync (Thomax, Logiwa, Xero, Front, Dyspach export) the app lists what's new — new staff member, client, supplier — as notifications. Each is a link → "Add to Analytics" window pre-filled from the source; Asal completes it (e.g. staff: site, position, clients and %).
- Saving is **not blocked**. Instead the app creates **linked follow-up tasks** for every missing step, e.g.: staff in Logiwa but not in **Xero Payroll** → "Set up in Xero Payroll" (no pay/hours = no cost); client in Dyspach but not in **Xero** → "Create Xero contact"; client in Thomax/Logiwa but not in Dyspach and Xero → two tasks. Each task has an "Open" link (new tab) to where it is set up.
- **Resolve = verified by API:** on Resolve the app checks the system. Found → closed ("confirmed by API" in the log). Not found → message "check failed: … not found", task snoozed 24 h; re-checked at the next sync and closed automatically if found; back to active after 24 h if not. Dyspach (no API yet): closed manually as "confirmed by hand" or via an uploaded export.
- Tasks also come from leakage, rate checks, the client brake and improvement project steps.

## 14. Settings
- **Company**, **Branding** (logos dark/light, colours, reset), **Login & security** (only people on the Internal list; 8-hour session then password + 2FA; forgot-password email link 30 min; 5 wrong attempts → 15 min lock), **Users** (Asal = Owner, cannot be changed or removed; invite by email link; roles and other users — Asal adds later).
- **Contacts & recipients:** **Internal** (trusted domains + approved people, e.g. Mark's personal email, Khalid's DTS email; only the owner edits) · **Clients** (contacts get Client-safe reports about their own company only) · **★ Lenders & advisers** (bank, external accountant, auditor, broker — External finance reports only, after approval) · **Suggestions** from Xero and Front. Unknown address = blocked.
- **Rules:** margin floor 15%, tolerance $5, weekly minimum $300, ★ labour and space utilisation per site, ★ B2B threshold (20 units), ★ notional rent for Parramatta, payroll tax / workers comp rates, fixed vs variable cost split, KPI targets.
- **★ Clients:** status (active / inactive / one-off services), site(s), type B2C / B2B / mixed, IDs in each system (Xero, Dyspach Customer ID = WMS tenant ID, Thomax, 3PLWMS, Logiwa, Front domains), CLM contract link, weekly minimum and levy period, packing method (manual / CMC share), report contacts.
- **★ Suppliers (analytics view):** cost pool (labour hire, rent, equipment, automation, packaging, software, admin…) and site; **fixed or variable**; FA cost or passed through to a client (rebilled — excluded from cost; from the Accounts Hub classification via API or a simple flag here); expected monthly amount; Xero contact ID.
- **★ Staff & allocation:** name, site, position / pool (floor, CSR, supervisor, admin), type **permanent / casual / agency**, Xero Payroll ID, codes in each of the 3 WMS, start/end dates. **Allocation matrix:** staff = rows, clients = columns, % in each cell; filters Parramatta / Smithfield narrow both clients and staff; source per cell (WMS / manual). Opened from Settings or from a Cost to serve details panel ("Add staff member" → matrix → "New staff member").
- Mapping tables: Xero account → cost pool; WMS client IDs and old charge codes → 44 standard codes.

## 15. Open questions / next
- **Still to discuss (cost rules):** D rent by space type · E ticket minutes by type · F automation only on orders through the machine · G admin per labour minute vs per revenue · H actual packaging per client. Provisional (can change): A unused capacity separate (TDABC), B separate site pools + notional rent for Parramatta, C agency labour in floor pool (does FA use labour hire?).
- Cost to serve cards — confirm the four.
- Break-even: fixed vs variable split and casual share with Mark; orders, revenue or both. **Built provisionally:** cost of services = variable, overheads + interest = fixed (last 3 months of the Xero P&L), shown in revenue and orders.
- Asal's old client workload report (upload) → may adjust report layouts.
- CLM link for proposed rates and "Send schedule of rates" (the calendar and stages are the CLM's own).
- Thomax cluster code + first test query; retention and full export at exit (support@thomax.com).
- Xero granular scope names; Asal's payroll access. Dyspach API (ask Varun). DTS email domain.
- **To enter in the app once live:** debt schedule (Finance → Cash & debt), KPI targets (Settings → Rules; most start empty), internal domains and report recipients (Settings → Contacts & recipients), staff positions (for suggested project people).
- **KPIs waiting for data:** dispatch before cut-off, dock-to-stock, returns 48 h, slow stock, stock accuracy (Thomax API); mis-pick and damage (a Front tag or claims log — which?).
- **Bank pack:** confirm the bank's actual list; tax and obligations (BAS, super, payroll tax) are manual for now.
- FA service catalogue (FA_Charge_Code_Catalogue_v1.xlsx) and real cost pools from Xero. Time study for pack, receiving, returns, CMC pre-pack.
