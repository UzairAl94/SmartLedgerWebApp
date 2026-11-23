---
name: smart-ledger-import
description: Import transactions into Smart Ledger from statements, receipts, CSVs, screenshots, or free-form notes, with mandatory approval and a balance proof. Use when the user says "import these transactions", "add this statement to my ledger", "record these expenses", uploads a bank statement/CSV/PDF/receipt image, or asks to verify Smart Ledger account balances.
argument-hint: "[statement file | date range | verify balances]"
---

# Smart Ledger import & balance verification

Smart Ledger is an Android app holding a local SQLite ledger, exposed over Wi-Fi through a
token-authenticated HTTP API. The app is the single source of truth: every write goes through the API.

This skill takes documents or notes and turns them into ledger rows **the user has approved**, then
**proves the account balances moved exactly as expected**.

## Non-negotiables

- **No write without explicit approval of the rendered list.** Silence is not approval.
- **Always finish an import with the balance check in Step 11.** A successful HTTP 201 is not proof.
- **Never print the access token.** Read it via Python into environment variables.
- **Never guess** a currency, account, category, date order, or transfer counterpart. Surface it as a decision.
- **Never edit or delete existing transactions** as part of an import. Only add, and undo by batch if asked.
- State the currency and the rate used whenever you quote a total.

## Modes

| The user wants | Do |
|---|---|
| Import from a document or notes | Steps 0 → 13 |
| Check that balances are right | Steps 0, 1, 11 (no writes) |
| Ask questions about their money | Steps 0, 1, 14 |
| Undo a previous import | Step 13 |

---

## Step 0 — Resolve the connection

Look up connection details in this order:

1. `./.smartledger-api.json` (gitignored project file, expected shape
   `{"baseUrl":"http://192.168.1.23:8765","token":"..."}`).
2. Environment variables `SMARTLEDGER_BASE_URL` and `SMARTLEDGER_TOKEN`.
3. Ask the user to open **Smart Ledger → Settings → Local API**, tap **Start**, then
   **Copy connection details**, and paste the JSON in chat.

If you create the file, write it with `0600` permissions and confirm the project ignores it
(`.gitignore` already contains `.smartledger-api.json` in this repo). Do not echo the token.

```bash
BASE=$(python3 -c "import json;print(json.load(open('.smartledger-api.json'))['baseUrl'].rstrip('/'))")
TOKEN=$(python3 -c "import json;print(json.load(open('.smartledger-api.json'))['token'])")
curl -sS --max-time 10 "$BASE/api/health" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Save the base URL and token to shell variables for the whole session. Never paste them into a file that
gets committed, and never show the token in a command you display to the user.

| Symptom | Meaning | Action |
|---|---|---|
| `401 {"error":{"message":"Unauthorized"}}` | Token rotated | Ask for fresh connection details |
| `504` or timeout | Phone asleep / app not responding | Ask user to bring Smart Ledger to the foreground |
| Connection refused | Server stopped or different network | Ask user to Start it and confirm same Wi-Fi |
| `{"status":"ok"}` | Ready | Continue |

Reset the scratch directory for this run and keep every JSON snapshot there:

```bash
rm -rf /tmp/sl-run && mkdir -p /tmp/sl-run
```

---

## Step 1 — Snapshot before anything

```bash
curl -sS "$BASE/api/accounts"   -H "Authorization: Bearer $TOKEN" > /tmp/sl-run/accounts.json
curl -sS "$BASE/api/categories" -H "Authorization: Bearer $TOKEN" > "/tmp/sl-run/categories.json"
curl -sS "$BASE/api/settings"   -H "Authorization: Bearer $TOKEN" > "/tmp/sl-run/settings.json"
curl -sS "$BASE/api/balances"   -H "Authorization: Bearer $TOKEN" > "/tmp/sl-run/before.json"
```

Read them. Note every account name, its currency, every category name and type, and the active
exchange rates (`settings.useCustomRates`, `settings.customRates`, base `PKR`).

If the statement covers a date window, also fetch the existing rows there — this is the duplicate baseline:

```bash
curl -sS "$BASE/api/transactions?from=YYYY-MM-01&to=YYYY-MM-31&limit=1000" \
  -H "Authorization: Bearer $TOKEN" > "/tmp/sl-run/existing.json"
```

---

## Step 2 — Read every document completely

Use the file tools for PDFs, images, CSV and text. For free-form notes or chat pasted by the user, treat it
as the document.

- Read **all** pages. If a page is unreadable, say so; do not silently skip it.
- Give every candidate row a `sourceRef` such as `statement.pdf p.2 row 7` or `chat 2026-11-20`.
- For CSV, respect the delimiter and quoted fields; do not hand-split rows.
- If the document has a header the user did not explain, ask rather than assume.

---

## Step 3 — Normalize

| Field | Rule |
|---|---|
| `date` | `YYYY-MM-DD`. If day/month order is ambiguous (all days ≤ 12), ask which convention the statement uses. |
| `amount` | Positive decimal. `(1,250.00)` → `1250.00`; handle `1.250,00`; strip currency symbols and `CR`/`DR`. |
| `currency` | Taken from the statement. Never assume the account currency. If mixed, keep each row's own. |
| `type` | Debit → `expense`, credit → `income`, except paired transfers (below). |
| `account` | Must match an existing account (case-insensitive). If ambiguous, ask. |
| `category` | Must be an existing category of the same type (Income/Expense). |
| `note` | Merchant + short descriptor. Keep it stable: it feeds the duplicate key. |
| `fee` | Use only when the statement shows a net amount plus an explicit fee. A separate fee line is its own expense row. |

**Transfers.** A debit from account A and a credit to account B on the same day for the same amount is one
`transfer` row (`account` = A, `toAccount` = B), not an income plus an expense. If the amounts differ, the
difference is a `fee`. If you cannot identify the counterpart, ask.

**Signs that something is off.** Dates outside the statement period, amounts with no merchant, a closing
balance that does not follow from the rows. Report them; do not "fix" them.

**Never shift a date to change its reporting month.** Salary arrives on different days each month, so the
ledger stores salary-to-salary cycles separately (Step 3b). If the user asks to map a transaction into next
month, explain the cycle and keep the real date.

---

## Step 3b — Pay cycles (salary periods)

Reporting periods are stored as `pay_periods`, not derived from a global day. Read them before any
period-based answer:

```bash
curl -sS "$BASE/api/periods" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Each entry has `startDate`, `endDate` (null = current/open), `source`, `isCurrent`, plus income/expense and
salary totals. Use those exact dates; "this month" means the cycle containing today.

- **Never move a transaction date** to get it into a period. The cycle is the reporting unit; the date stays real.
- **A new salary is not covered by a cycle:** ask for proposals, show them, and wait for approval before writing.

  ```bash
  curl -sS "$BASE/api/periods/proposals" -H "Authorization: Bearer $TOKEN"
  # then, after the user approves:
  curl -sS -X POST "$BASE/api/periods/apply" -H "Authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    -d '{"periods":[{"startDate":"2026-10-29","endDate":null}]}'
  ```

  Proposals come from income rows in the salary categories (Settings → Pay cycles, default: an income
  category named like "Salary"). Credits within 10 days of each other count as one pay event, so a split
  salary across Wise and Elevate Pay does not open two cycles.
- **Correct a boundary:** `PATCH /api/periods/:id` with `startDate` and/or `endDate` (`endDate: null` for the
  open current cycle). Manual edits win and are what every report uses.
- **Reports:** `GET /api/summary?period=current` or `?period=previous`, or pass the cycle's `startDate`/
  `endDate` as `from`/`to`. Always name the cycle dates in the answer (e.g. "29 Aug – 28 Sep").
- **Salary sanity check:** count salary credits in the cycle. Zero, or more than one outside the 10-day split
  window, is suspicious. Report it; never repair it by changing dates.
- **History is stable:** past cycles are stored rows. Importing rows or changing a setting does not move
  them; only an explicit edit of that cycle does.

---

## Step 4 — Reconcile the statement itself (blocks the write)

When the document states an opening balance, closing balance, totals, or a row count, prove the parse:

```
opening + total_credits − total_debits = closing
parsed_rows == stated_row_count
```

Do this in Python over the normalized rows, in the statement's own currency. If it fails:

- Re-read pages, look for a missing page, an opening-balance line counted as a row, or a duplicate.
- Report the discrepancy in the statement currency and **do not write** until the user resolves it.
- If no balances are given, say "statement totals unavailable — proceeding on row count only" and continue.

---

## Step 5 — Categorize from history, not imagination

For each distinct merchant, look at how the user categorized it before:

```bash
curl -sS "$BASE/api/transactions?q=Careem&limit=50" -H "Authorization: Bearer $TOKEN"
```

Propose the most frequent existing category. If nothing matches, propose the closest existing category and
list it in **Needs your decision**. Never create a category unless the user explicitly approves the name,
type, icon and colour.

---

## Step 6 — Duplicate detection

A row is a **likely duplicate** if either:

- its `externalId` (see Step 8) already exists, or
- `(date, amount, account)` matches an existing row within ±1 day.

Compare against `existing.json`. Show the existing row id next to the candidate. Mark it `skip` by default;
the user may override. Never silently drop a candidate — always show it.

---

## Step 7 — Render the approval list (mandatory gate)

For up to ~40 rows show a full table; beyond that show per-account/currency totals plus the full list written
to `/tmp/sl-run/approval.md` (and show the first and last 10). Every row needs:

```
| # | Source | Date | Type | Amount | Currency | Account | Category | Note | Status |
```

`Status` is one of `ok`, `skip (duplicate)`, `needs decision`.

Then include:

- **Totals** — per account and per currency; income/expense separately. Transfers are neither.
- **Statement reconciliation** — opening, credits, debits, closing, and PASS/FAIL.
- **Needs your decision** — unknown accounts/categories, ambiguous dates, missing transfer counterparts,
  currency mismatches, fees you could not attribute.
- **Duplicates** — candidate vs existing row id.

Stop here. Ask for explicit approval, e.g. "Reply **approve** to write N rows, or name the rows to skip/change."
Accept partial approval ("approve all except 7, 12"). Re-render after any change and re-confirm.

---

## Step 8 — Build the payload deterministically

One script, one file. Never inline JSON with apostrophes.

`externalId` makes retries idempotent. Prefer the statement's own reference when it has one:

```python
import hashlib, json

def external_id(row):
    if row.get("ref"):
        return ("ref:" + str(row["ref"]))[:200]
    basis = "|".join([
        row["date"], row["type"].lower(), f"{float(row['amount']):.2f}",
        row["currency"].upper(), row["account"].strip().lower(),
        " ".join((row.get("note") or "").lower().split()),
    ])
    return "sl:" + hashlib.sha1(basis.encode()).hexdigest()[:24]

payload = {
    "dryRun": True,
    "allowPartial": False,
    "source": "<document name>",
    "batchId": "stmt_<slug>_<YYYYMMDD>_p1",   # optional but recommended for undo
    "transactions": [ /* approved rows, each with externalId */ ],
}
json.dump(payload, open("/tmp/sl-run/import.json", "w"), indent=2)
print(len(payload["transactions"]), "rows")
```

Rules: `allowPartial` stays `false`. `batchId` ≤ 200 chars, `[A-Za-z0-9_-]` preferred. Max 2000 rows and
5 MB per request.

---

## Step 9 — Dry run until clean

```bash
curl -sS -X POST "$BASE/api/import/transactions" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data @/tmp/sl-run/import.json | tee /tmp/sl-run/dry.json | python3 -m json.tool
```

Show `summary`, `missing.accounts`, `missing.categories`, and every `items[]` entry that is not `valid`.
Fix and repeat until `summary.invalid == 0` and both missing lists are empty. A dry run writes nothing.

---

## Step 10 — Write in chunks, only after "approve"

Set `"dryRun": false` in the same file and keep `allowPartial: false`.

- ≤ 500 rows per request. For larger imports, split into chunks, each with its own `batchId`
  (`..._p1`, `..._p2`), and keep a chunk → batchId map.
- Stop at the first failed chunk; report exactly what was written and do not continue.
- Keep the dry-run report for the chunk in case you need to explain a failure.

```bash
python3 - <<'PY'
import json
p = json.load(open('/tmp/sl-run/import.json'))
p['dryRun'] = False
json.dump(p, open('/tmp/sl-run/import.json', 'w'), indent=2)
PY

curl -sS -X POST "$BASE/api/import/transactions" \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  --data @/tmp/sl-run/import.json | tee /tmp/sl-run/write.json | python3 -m json.tool
```

Expect `201` with `batchId`, `created`, `skipped`, `failed`, and per-row `items`.

---

## Step 11 — Verify the balances (mandatory, this is the point)

Do not summarize the import from the HTTP response alone. Prove the ledger moved correctly.

```bash
curl -sS "$BASE/api/balances" -H "Authorization: Bearer $TOKEN" > /tmp/sl-run/after.json

# All rows written in this run (repeat per chunk batchId, concatenate)
curl -sS "$BASE/api/transactions?batchId=<batchId>&limit=1000" \
  -H "Authorization: Bearer $TOKEN" > /tmp/sl-run/batch.json
```

Run the bundled checker (it implements the app's own conversion rules and prefers frozen amounts when present):

```bash
python3 ~/.agents/skills/smart-ledger-import/verify_balances.py \
  --before /tmp/sl-run/before.json \
  --after  /tmp/sl-run/after.json \
  --settings /tmp/sl-run/settings.json \
  --accounts /tmp/sl-run/accounts.json \
  --transactions /tmp/sl-run/batch.json
```

It exits `1` on any mismatch and prints a table:

```
Account        Currency   Before        After         Δ actual   Δ expected  Diff    Result
Cash           PKR        41,250.00     42,250.00     1,000.00   1,000.00    0.00    PASS
HBL Bank       PKR        512,300.00    464,300.00    -48,000.00 -48,000.00  0.00    PASS
USD Savings    USD        2,400.00      2,400.00      0.00       0.00        0.00    PASS (untouched)
```

Rules for you, the agent:

- **Expected** deltas come from the rows actually written, converted with the rates in `/api/settings`
  (PKR base; custom rates only when `useCustomRates`). The script does this; do not hand-wave it.
- **Tolerance:** 0.01 per row while rows have no frozen `accountAmount` (pre-v3), 0.005 once they do.
- Any **untouched account that moved** is a failure, even by a cent.
- On failure: stop, report the account and both numbers, and offer undo. Never adjust balances manually and
  never claim success.
- Also confirm the batch re-read matches the approved list: count, date, amount, currency, account, category.

---

## Step 12 — Report

```
Imported 23 rows from statement.pdf (batch stmt_statement_20261122_p1).
Skipped 2 duplicates.

Account        Before        After         Change      Check
Cash           41,250.00     42,250.00     +1,000.00   PASS
HBL Bank       512,300.00    464,300.00    -48,000.00  PASS
...

Statement reconciliation: opening 40,000 + credits 200,000 − debits 198,000 = 42,000 PASS
Undo: DELETE /api/imports/<batchId>
```

The app updates immediately; ask the user to confirm it looks right in the UI.

---

## Step 13 — Undo

Only after the user confirms:

```bash
curl -sS -X DELETE "$BASE/api/imports/<batchId>" -H "Authorization: Bearer $TOKEN"
```

Then repeat Step 11 with the same `before.json` and a fresh `/api/balances` to prove the revert is exact.
Undo each chunk batch separately. If the ledger already contains unrelated changes, say so before comparing.

---

## Step 14 — Read-only analysis

Never write while answering questions.

```bash
curl -sS "$BASE/api/periods" -H "Authorization: Bearer $TOKEN"
curl -sS "$BASE/api/summary?period=current&groupBy=month" -H "Authorization: Bearer $TOKEN"
curl -sS "$BASE/api/summary?from=2026-11-01&to=2026-11-30&groupBy=month" -H "Authorization: Bearer $TOKEN"
curl -sS "$BASE/api/balances?currency=PKR" -H "Authorization: Bearer $TOKEN"
curl -sS "$BASE/api/transactions?type=expense&limit=500" -H "Authorization: Bearer $TOKEN"
curl -sS "$BASE/api/export" -H "Authorization: Bearer $TOKEN" > /tmp/sl-run/export.json
```

For "this month", "last month" or "my salary cycle", resolve the stored pay cycle first and use its dates.
`?period=current` and `?period=previous` are shorthand for that. `/api/summary` excludes transfers and
reports fees separately. Always name the currency and the cycle dates.

---

## Guardrails recap

- Approval gate: explicit, after the final rendered list. No partial writes unless the user accepts them,
  and if so, say clearly which rows were skipped.
- No secrets in output, logs, files, or commit-ready paths.
- No guessing; unresolved items block the write.
- Balance proof is part of the job, not an optional extra.
- Never move a transaction date to change its reporting month; use the stored pay cycles.
- New cycles and period edits need explicit approval, just like imports.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `structure of query does not match` / `missing.accounts` | Name mismatch or missing account. Show the API's account list and remap. |
| `Category "X" is a Income category, not Expense` | Category type mismatch. Reclassify the row or pick one of the right type. |
| `date is required` | Always send `YYYY-MM-DD`. |
| `A single import is limited to 2000 rows` | Chunk to ≤500 rows. |
| `413 Request body too large` | Split the payload; receipts are not part of imports. |
| `409` from an account/category create | Duplicate name; reuse the existing one. |
| `POST /api/import/transactions` returns `400` with a report | `allowPartial` was false and a row was invalid; fix and rerun the dry run. |
| Balance check fails after a clean dry run | Re-read the batch; you may have compared against a stale `before.json`, or another write landed mid-run. |

## Maintenance

Canonical source: `skills/smart-ledger-import/` in the Smart Ledger repo. The installed copy lives at
`~/.agents/skills/smart-ledger-import/`. After editing the repo version, re-copy `SKILL.md` and
`verify_balances.py` into the installed directory.
