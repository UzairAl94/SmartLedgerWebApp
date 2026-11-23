#!/usr/bin/env python3
"""Prove that a Smart Ledger import moved every account by exactly the expected amount.

Reads snapshots produced by the skill:
  --before       /api/balances response before the import
  --after        /api/balances response after the import
  --settings     /api/settings response
  --accounts     /api/accounts response
  --transactions rows written by this run (one batch file, or a file with all of them)

Optional:
  --expected     the approved payload ({"transactions":[...]}) to check field-by-field

Exit code 0 = PASS, 1 = mismatch, 2 = bad input.
"""

import argparse
import json
import sys

DEFAULT_RATES = {"PKR": 1.0, "USD": 278.5, "AED": 75.83, "MYR": 62.0}
FROZEN_TOLERANCE = 0.005
LEGACY_PER_ROW_TOLERANCE = 0.0101
LEGACY_BASE_TOLERANCE = 0.01


def load(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def rows_of(payload, key):
    if isinstance(payload, list):
        return payload
    return payload.get(key) or []


def settings_of(payload):
    if isinstance(payload, dict) and "settings" in payload:
        return payload["settings"] or {}
    return payload or {}


def rates_for(settings):
    rates = dict(DEFAULT_RATES)
    if settings.get("useCustomRates") and isinstance(settings.get("customRates"), dict):
        for code, value in settings["customRates"].items():
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if number > 0:
                rates[str(code).upper()] = number
    return rates


def make_converter(rates):
    def convert(amount, source, target):
        if source == target:
            return float(amount)
        source_rate = rates.get(str(source).upper())
        target_rate = rates.get(str(target).upper())
        if not source_rate or not target_rate:
            raise SystemExit(f"Unknown currency in rates: {source} -> {target}")
        return float(amount) * source_rate / target_rate

    return convert


def money(value):
    return f"{value:,.2f}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--settings", required=True)
    parser.add_argument("--accounts", required=True)
    parser.add_argument("--transactions", required=True)
    parser.add_argument("--expected")
    parser.add_argument("--tolerance", type=float)
    args = parser.parse_args()

    before = load(args.before)
    after = load(args.after)
    settings = settings_of(load(args.settings))
    accounts = rows_of(load(args.accounts), "accounts")
    transactions = rows_of(load(args.transactions), "transactions")

    convert = make_converter(rates_for(settings))
    account_by_id = {account["id"]: account for account in accounts}

    before_rows = {row["id"]: row for row in rows_of(before, "accounts")}
    after_rows = {row["id"]: row for row in rows_of(after, "accounts")}

    deltas = {}
    counts = {}
    frozen = {}

    def add_delta(account_id, amount, is_frozen):
        deltas[account_id] = deltas.get(account_id, 0.0) + amount
        counts[account_id] = counts.get(account_id, 0) + 1
        frozen[account_id] = frozen.get(account_id, True) and is_frozen

    for tx in transactions:
        source = account_by_id.get(tx.get("accountId"))
        if source is None:
            raise SystemExit(f"Transaction {tx.get('id')} references unknown account {tx.get('accountId')}")

        frozen_amount = tx.get("accountAmount")
        has_frozen_amount = frozen_amount is not None
        amount = float(frozen_amount) if has_frozen_amount else convert(tx["amount"], tx["currency"], source["currency"])

        fee = 0.0
        if tx.get("fee"):
            frozen_fee = tx.get("accountFee")
            fee = float(frozen_fee) if frozen_fee is not None else convert(tx["fee"], tx["currency"], source["currency"])

        delta = (amount - fee) if tx.get("type") == "Income" else -(amount + fee)
        add_delta(source["id"], delta, has_frozen_amount)

        if tx.get("type") == "Transfer" and tx.get("toAccountId"):
            destination = account_by_id.get(tx["toAccountId"])
            if destination is None:
                raise SystemExit(f"Transaction {tx.get('id')} references unknown destination {tx.get('toAccountId')}")
            frozen_to = tx.get("toAccountAmount")
            to_amount = float(frozen_to) if frozen_to is not None else convert(tx["amount"], tx["currency"], destination["currency"])
            add_delta(destination["id"], to_amount, frozen_to is not None)

    if set(before_rows) != set(after_rows):
        print("FAIL: the account set changed during the import.")
        print("  before:", sorted(before_rows))
        print("  after :", sorted(after_rows))
        return 1

    header = f"{'Account':<20} {'Cur':<4} {'Before':>14} {'After':>14} {'Δ actual':>14} {'Δ expected':>14} {'Diff':>9}  Result"
    print(header)
    print("-" * len(header))

    failures = 0
    touched_ids = set(deltas)
    for account in accounts:
        account_id = account["id"]
        row_before = before_rows.get(account_id)
        row_after = after_rows.get(account_id)
        if row_before is None or row_after is None:
            continue

        currency = row_after.get("currency") or account.get("currency") or "?"
        before_balance = float(row_before.get("balance") or 0)
        after_balance = float(row_after.get("balance") or 0)
        actual = after_balance - before_balance
        expected = deltas.get(account_id, 0.0)
        diff = actual - expected

        rows_count = counts.get(account_id, 0)
        if args.tolerance is not None:
            tolerance = args.tolerance
        elif account_id in touched_ids and frozen.get(account_id):
            tolerance = FROZEN_TOLERANCE
        elif account_id in touched_ids:
            tolerance = LEGACY_PER_ROW_TOLERANCE * max(1, rows_count) + LEGACY_BASE_TOLERANCE
        else:
            tolerance = FROZEN_TOLERANCE

        if abs(diff) <= tolerance:
            result = "PASS" if account_id in touched_ids else "PASS (untouched)"
        elif account_id not in touched_ids:
            result = "FAIL (untouched account moved)"
            failures += 1
        else:
            result = "FAIL"
            failures += 1

        print(
            f"{str(row_after.get('name') or account.get('name'))[:20]:<20} "
            f"{str(currency):<4} {money(before_balance):>14} {money(after_balance):>14} "
            f"{money(actual):>14} {money(expected):>14} {money(diff):>9}  {result}"
        )

    if args.expected:
        failures += check_expected(load(args.expected), transactions)

    print()
    if failures:
        print(f"BALANCE CHECK FAILED ({failures} problem(s)). Do not report success; offer an undo.")
        return 1

    print(f"BALANCE CHECK PASSED for {len(transactions)} row(s) across {len(touched_ids)} account(s).")
    return 0


def check_expected(expected_payload, transactions):
    expected = rows_of(expected_payload, "transactions")
    by_external = {}
    for tx in transactions:
        key = tx.get("externalId")
        if key:
            by_external[key] = tx

    problems = 0
    for row in expected:
        external = row.get("externalId")
        if not external:
            continue
        actual = by_external.get(external)
        if actual is None:
            print(f"FAIL: approved row {external} is missing from the ledger.")
            problems += 1
            continue

        if str(actual.get("date", ""))[:10] != str(row.get("date", ""))[:10]:
            print(f"FAIL: {external} date {actual.get('date')} != approved {row.get('date')}")
            problems += 1
        if abs(float(actual.get("amount", 0)) - float(row.get("amount", 0))) > 0.005:
            print(f"FAIL: {external} amount {actual.get('amount')} != approved {row.get('amount')}")
            problems += 1
        if str(actual.get("currency", "")).upper() != str(row.get("currency", "")).upper():
            print(f"FAIL: {external} currency {actual.get('currency')} != approved {row.get('currency')}")
            problems += 1

        approved_account = str(row.get("account") or row.get("accountId") or "").casefold()
        ledger_account = str(actual.get("accountName") or actual.get("accountId") or "").casefold()
        if approved_account and approved_account != ledger_account and approved_account != str(actual.get("accountId", "")).casefold():
            print(f"FAIL: {external} account {actual.get('accountName')} != approved {row.get('account')}")
            problems += 1

        approved_category = str(row.get("category") or row.get("categoryId") or "").casefold()
        ledger_category = str(actual.get("categoryName") or actual.get("categoryId") or "").casefold()
        if approved_category and ledger_category and approved_category != ledger_category and approved_category != str(actual.get("categoryId", "")).casefold():
            print(f"FAIL: {external} category {actual.get('categoryName')} != approved {row.get('category')}")
            problems += 1

    if problems == 0 and expected:
        print(f"FIELD CHECK PASSED for {len(expected)} approved row(s).")
    return problems


if __name__ == "__main__":
    sys.exit(main())
