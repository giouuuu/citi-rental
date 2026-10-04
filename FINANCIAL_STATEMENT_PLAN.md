# Financial statement plan (BIR-oriented)

Goal: the accountant opens one screen, reads the numbers straight onto the BIR return, and
hand-computes nothing. This document is the plan for what the statement contains and what the
schema needs to support it. **Nothing here is built yet.**

> **Not tax advice.** I am not an accountant. Rates, thresholds, form numbers and documentary
> rules in this document must be confirmed by the engagement accountant against current BIR
> issuances before anything is filed. Philippine tax rules have moved repeatedly in recent
> years (see §7). The application's job is to produce **traceable, exportable, drill-down-able
> figures** — never to file, and never to be the final authority on a tax position.

---

## 1. Why a generic profit-and-loss is not enough

A generic P&L (revenue − expenses = profit) does not reduce the accountant's work, because the
BIR returns do not ask for "revenue" and "expenses". They ask for specific lines, on specific
bases, with specific substantiation. The statement has to be **return-shaped**, not
business-shaped.

Three concrete consequences:

1. **Two different bases are in play at once.** VAT and percentage tax on services are imposed
   on *gross receipts actually or constructively received* (NIRC §108) — a cash basis. Income
   tax runs on the taxpayer's consistently applied accounting method. So the same period has a
   cash number *and* an accrual number, and conflating them produces a figure that is wrong for
   both returns. The existing `/analytics` "collected" metric is already cash-dated by
   `payments.confirmed_at`, which means **it is already the correct base for VAT / percentage
   tax.** That is a genuine head start, not a coincidence to undo.

2. **Expense categories must be BIR lines, not our own names.** "Car stuff" is not deductible;
   *Repairs and maintenance* is. The categories have to map 1:1 onto the Schedule of Itemized
   Deductions so the accountant transcribes rather than reclassifies.

3. **A deduction with a defect is not a deduction.** BIR disallows an expense with no valid
   invoice, and disallows an expense on which required withholding was not made and remitted.
   An app that silently totals those into "expenses" produces a profit figure that collapses on
   audit. The statement therefore needs an **exceptions block** (§5).

---

## 2. Three gaps that block any BIR-ready statement today

| Gap | Current state | Why it blocks the statement |
|---|---|---|
| **No VAT decomposition** | `payments.amount` is one gross number; `quoted_total = daily_rate × days` | If VAT-registered, revenue is `amount ÷ 1.12` and output VAT is `amount × 12/112`. Today those cannot be separated, so neither the income statement nor 2550Q can be produced. |
| **No fixed-asset register** | `vehicles` has `year` but no acquisition cost, acquisition date, useful life, or salvage value | **Depreciation is the single largest deduction for a rental fleet** and is the number accountants most often compute by hand in a spreadsheet. Without acquisition cost it cannot be computed at all. |
| **No expense ledger, no withholding records** | Nothing exists | No expense side; no tracking of 2307s received (creditable against income tax) or EWT the business owes. |

Note also: `rental_inspections.fuel_charge_amount` and `damage_charge_amount` are charges billed
**to the customer** — they are revenue, not the shop's fuel and repair costs. The real fuel and
repair spend is nowhere in the system.

---

## 3. The statement: five blocks

### Block A — Gross receipts (the tax base)

Per period (month / quarter / year, Manila-local, matching the existing analytics windows):

- Gross receipts collected — cash basis, dated by `payments.confirmed_at`
- Less: refunds issued
- Split by VAT treatment: VAT-able / VAT-exempt / zero-rated
- **Net of VAT** revenue and **output VAT**, shown separately
- Penalties and damage recoveries — listed on their own line, *not* folded into rental income,
  because their VAT treatment is a judgment call the accountant should make explicitly
- Rental income by source (website vs front desk) — already available, useful for management
- **Accrued but uncollected** (receivable) shown separately — the existing `outstanding_balance`
  metric. This gives the accrual view for income tax without disturbing the cash tax base.

### Block B — Cost of services and operating expenses, mapped to BIR itemized-deduction lines

Live lines for a car-rental fleet:

| BIR deduction line | What lands here |
|---|---|
| **Depreciation** | Fleet vehicles (largest line — see Block C) |
| **Fuel and oil** | Fuel for the fleet |
| **Repairs and maintenance** | Servicing, parts, tires, bodywork (BIR distinguishes labor vs labor+materials) |
| **Insurance** | CTPL and comprehensive per vehicle |
| **Taxes and licenses** | LTO registration and renewal, mayor's/business permit, DTI renewal |
| **Salaries, wages and allowances** | Drivers, front desk |
| **SSS / PhilHealth / Pag-IBIG** | Employer contributions |
| **Rental** | Garage, parking, office |
| **Light and water**, **Communication** | Utilities, internet, mobile |
| **Professional fees** | Accountant, legal |
| **Advertising and promotions** | Marketing spend |
| **Transportation and travel** | Delivery/retrieval of units, staff travel |
| **Interest** | Fleet financing, if units are on loan |
| **Supplies**, **Security services**, **Miscellaneous** | Remainder |

Each expense row carries: date, amount, BIR category, vehicle (optional — enables per-unit
profitability), supplier + TIN, document type and number, input VAT amount, and whether
withholding applied.

### Block C — Depreciation schedule (the biggest automation win)

A per-vehicle fixed-asset register with: acquisition cost, acquisition date, useful life,
salvage value, method (straight-line as default; BIR also permits declining balance and
sum-of-years-digits under §34(F)), accumulated depreciation, and net book value. The app then
generates the monthly/annual depreciation entry per unit, and the schedule the accountant
attaches to the return.

**One rule worth encoding explicitly, with a comment citing it:** RR 12-2012 restricts the
deductibility of vehicle depreciation (a value threshold per vehicle, and one vehicle per
official or employee) — **but it carves out taxpayers engaged in transport operations or the
lease of transportation equipment.** That is precisely this business, so the fleet should be
fully depreciable. This is worth building in deliberately, because an accountant who applies the
general rule without the carve-out will understate the deduction. *Confirm the current text and
thresholds of this issuance before relying on it.*

### Block D — Tax position worksheet (what actually saves the accountant's time)

This is the block that turns the statement from a report into a filing aid.

- **If VAT-registered:** output VAT − creditable input VAT = net VAT payable → **2550Q**
  (quarterly; the monthly 2550M was discontinued under TRAIN)
- **If non-VAT:** gross receipts × percentage-tax rate → **2551Q**
- **Creditable withholding tax**: total EWT withheld by corporate clients per the **2307s**
  received, which credits against income tax → **1701Q / 1701A / 1701**
- **EWT the business owes**: amounts it must withhold on its own payments (e.g. garage rent,
  professional fees) → **0619E / 1601EQ**
- **Election comparison**: income tax computed side by side under (a) 8% flat on gross receipts,
  (b) graduated with Optional Standard Deduction, (c) graduated with itemized deductions — so
  the election is a visible number instead of a guess
- **Summary-list data** in SLSP shape (sales and purchases), if VAT-registered

Every figure links back to the source rows that produced it. An accountant who cannot drill into
a number will recompute it by hand, which defeats the purpose.

### Block E — Exceptions and compliance guardrails

Highest value per line of code, and the part most financial dashboards omit:

- Expenses with **no valid invoice / official receipt** → deduction at risk of disallowance
- Expenses where **withholding was required but not made or not remitted** → BIR disallows the
  deduction entirely, not just the withholding
- **Input VAT claimed against a non-VAT-registered supplier** → not creditable
- Supplier **TIN missing** where the document requires it
- Vehicles in the fleet with **no acquisition cost recorded** → silently missing depreciation

This converts the feature from "shows a profit number" into "prevents a disallowed deduction."

---

## 4. Schema sketch

New tables, all following the project's existing policy shape:

- `expense_categories` — seeded, each row mapped to its BIR deduction line
- `expenses` — date, amount net of VAT, input VAT, category, optional `vehicle_id`, supplier,
  supplier TIN, document type/number, withholding flag + amount, attachment
- `fixed_assets` + `depreciation_entries` — the register and its generated periodic entries;
  vehicles link to a fixed-asset row
- `withholding_certificates` — 2307s received from corporate clients, linked to the rentals or
  payments they cover
- `tax_settings` — VAT-registered or not, entity type, income-tax election, TIN, RDO, fiscal
  year, percentage-tax rate in force

Changes to existing tables:

- `payments`: add VAT decomposition (net of VAT, output VAT, VAT treatment)
- `vehicles`: link to `fixed_assets`
- New RPC `analytics_profit_and_loss(p_from, p_to)` alongside the four existing analytics RPCs,
  plus per-vehicle net margin — the number that tells you which unit to sell

New surface: a `/finance` route (owner-only, tighter than the owner/admin gate on `/analytics`,
since this is the whole company's books).

---

## 5. Suggested build order

1. `tax_settings` + VAT decomposition on `payments` — nothing downstream is correct without it
2. `expenses` + `expense_categories` with BIR mapping, and the entry UI
3. `fixed_assets` + depreciation schedule, backfilled with real acquisition costs
4. `analytics_profit_and_loss` RPC + the `/finance` statement
5. `withholding_certificates` (2307 tracking) + the tax position worksheet
6. Exceptions block
7. Export: CSV/XLSX per schedule, print-friendly statement

Steps 1–4 produce a usable statement. Steps 5–6 are what make it genuinely hands-off for BIR.

---

## 6. Open questions that change the design

These are not derivable from the code and materially change what gets built:

1. **VAT-registered, or non-VAT?** Decides whether revenue is decomposed at 12% and whether the
   worksheet targets 2550Q or 2551Q. The ₱3,000,000 gross annual receipts threshold governs.
2. **Sole proprietorship or corporation?** DTI registration implies sole proprietorship → the
   1701 family. A corporation uses the 1702 family and has no 8%/OSD election.
3. **Income tax election: 8% flat, graduated + OSD, or graduated + itemized?** This is the big
   one. Under 8% or OSD, detailed expense tracking is for *management insight*, not for the
   return — which lowers the priority of Blocks B/C/E considerably. Only itemized makes them
   load-bearing for filing.
4. **Do corporate clients withhold 5% EWT and issue 2307s?** If yes, tracking them is high
   value (uncredited 2307s are money left with the BIR). If it's all walk-in retail, skip it.

---

## 7. Why every rate and form in this document needs confirming

Philippine tax rules have moved repeatedly, which is exactly why the app should store rates in
`tax_settings` rather than hardcode them:

- Percentage tax was temporarily reduced, then reverted, under CREATE
- The EOPT Act (RA 11976) replaced the "Official Receipt" with the **Invoice** as the primary
  document for services, and repealed the annual registration fee
- Input VAT amortization on large capital-goods purchases was phased out
- VAT filing moved from monthly + quarterly to quarterly only
- CAS registration requirements have shifted from a Permit to Use toward an Acknowledgement
  Certificate

**Also for the accountant to decide:** if this application becomes the official books of
accounts, or issues serially numbered invoices, that carries a BIR registration dimension
(CAS registration, or Authority to Print for printed invoices). That is a question for the
accountant and the RDO, not something to assume — and it may be a reason to keep this as a
*reporting aid feeding registered books* rather than as the books themselves.
