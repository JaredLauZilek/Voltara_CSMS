# Phase 3 — what to test as an operator

Written for the person running Voltara's charging business, not for engineers.
Everything below works with **no charger and no car**: a simulator plays the
charger. Budget 30–40 minutes for the full pass.

## Setup (once)

1. Open the admin app (the forwarded port 5173 in the codespace, or wherever it is deployed) and sign in as `jared@voltara.com.my`. In dev it signs you in automatically.
2. Keep a terminal open in the repo root for the simulator:
   `pnpm sim:session --kwh 7.4 --minutes 30 --idle-min 5`
   (No `--` before the options — pnpm would swallow them.) Each run is one complete session on charger **HQ Bay 1 — Virtual** (`VCP-DEMO-001`) with the RFID tag `VLT-TAG-0001`: it "charges" 7.4 kWh over 30 minutes and then sits idle 5 minutes. Change the numbers freely.

## 1. Tariffs — set a price

**Billing → Tariffs.**

- There is a seeded **Standard** tariff: RM 1.20/kWh, idle RM 1/min after 15 min, assigned to the whole operator. The **Tax rates** card shows SST at 0%.
- Click **+ New Tariff**. Try each pricing shape: _Per kWh_, _Per kWh + idle fee_, _Per minute_, _Peak / off-peak_, _Session fee + per kWh_, _Free_. As you type, the **Price preview** recalculates — e.g. 18 kWh over 60 min at 15:30. Change the start time to cross the peak boundary and watch the split.
- **Custom (OCPI)** shows the raw structure for shapes the presets don't cover (kWh tiers, weekend rates). It refuses invalid JSON.
- Set **Tax** and **"Prices above are"** (inclusive vs exclusive) and watch the tax line change in the preview.
- Save → you land on the tariff page. **Assignments** tab → **+ Assign**: choose _Whole operator / Site / Charger / Connector_ and _Everyone / Ad-hoc / a driver group_. Read the precedence note under the form.
- **New version** → change the price → publish. **Version history** keeps every version; nothing is ever overwritten.

What to check: the preview is exactly what the driver will pay; publishing a new version does not change any session that already started (see §4).

## 2. Driver groups — whitelists with their own price

**Billing → Driver groups → + New Group** (e.g. "Vantage residents", kind _Residents_). Open it and add a member: by **ID tag** (pick `VLT-TAG-0001`) or by **Billing account**.

Then on a tariff, assign it with audience **A driver group**. From now on that tag pays the group price; everyone else pays the ad-hoc/default price on the same charger.

## 3. Billing accounts — who gets billed

**Billing → Billing accounts → + New Account.**

- _Individual_: a resident. _Corporate_: a company with pooled invoicing and optional caps. _Site host_: the JMB or landlord — pick the site; open the account again and add a **revenue share agreement** (host share %, platform fee, electricity basis).
- Corporate and site-host accounts have the MyInvois fields (legal name, SSM no., TIN, SST no., address); these print on invoices.
- **Operations → ID tags** → open `VLT-TAG-0001` → **Bills to** → choose the account. Sessions with that tag now invoice that account.

## 4. Run a session and see it priced

Run the simulator (setup step 2). Within a second or two:

- **Network → Sessions** → the session shows **Priced RM …** with a link to its charging record.
- **Billing → Charging records** → the row shows energy, duration, idle, total, and _Uninvoiced_. Open it: itemised charges, the tariff that applied (name, version, why it matched), and the charging periods. **Export CSV** on the list gives the spreadsheet a JMB asked for.
- Now publish a new version of the tariff, run the simulator again, and compare: the old record keeps its price, the new one uses the new price.
- Try a session with `--idle-min 30` under the Standard tariff: 15 minutes are free, 15 minutes are billed at RM 1/min.

## 5. Documents

- On a charging record, click **Receipt** → a numbered receipt (`R-YYYYMM-0001`) opens, laid out for A4. **Print / Save as PDF** uses the browser; **Export lines (CSV)** for the numbers.
- **Billing → Documents → Run invoices**: pick the account (or _all_) and the month → one **draft** invoice per account with uninvoiced sessions, one line per session, tax summary, due date. Open it, check it, **Issue**. Issued documents are frozen; **Void** releases the sessions to be invoiced again.
- **Run settlement**: pick a site with a revenue-share agreement and the month → a settlement statement showing gross revenue, the host's share, electricity, platform fee and the amount owed either way.

## 6. Reports

**Billing → Reports**: revenue, energy, sessions and idle by site, driver group and charger for a period; **Export CSV**. All numbers come from the charging records, so they always agree with the documents.

Note: simulated sessions show a small _replayed_ marker because the simulator backdates its timestamps to fit a 30-minute session into a few seconds — real chargers only get that marker when they reconnect after an outage.

## 7. Things that should NOT work (and don't)

- A viewer cannot create tariffs, accounts or invoices (sign in as a viewer to see the buttons disappear).
- A tariff version, a charging record, or an issued document cannot be edited — corrections are new versions, credit records, or credit notes.
- Deleting a tariff that has versions is refused; **Archive** it instead.
- A session started with no tariff assigned still produces a record, marked _No tariff applied_, which no invoice run will pick up.

## What is not in Phase 3

Taking the money (Stripe, cards, FPX, wallets) is Phase 5. MyInvois submission is captured but not sent. PDF is via the browser's print dialog; a server-rendered PDF can replace it without changing any data.
