# Smart Ledger Local API

The Android app can host a small HTTP server on your Wi-Fi network. It exposes the ledger
for imports and analysis, and (in a future version) serves the web UI from the same server.

## Start it

1. Open **Settings → Local API**.
2. Pick a port (default `8765`) and keep **Allow access from other devices** on if the
   laptop should connect over Wi-Fi.
3. Tap **Start**. The section shows `http://<phone-ip>:8765` and an access token.
4. Tap **Copy connection details** to copy `{ "baseUrl": "...", "token": "..." }`.

Keep the app open while using the API: the server forwards requests into the app's
JavaScript layer, where the real services and SQLite live.

## Authentication

Every `/api/*` request needs the token:

```bash
curl -s http://192.168.1.23:8765/api/health \
  -H "Authorization: Bearer <token>"
```

Static files (`/`, `/assets/*`) are public; the API is not. The token grants full
read/write access — treat it as a password.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status, row counts, bound address |
| GET | `/api/version` | cheap revision for polling |
| GET | `/api/logs` | last 50 requests |
| GET/POST | `/api/accounts` | list / create |
| PATCH/DELETE | `/api/accounts/:id` | update / delete |
| GET/POST | `/api/categories` | list / create |
| DELETE | `/api/categories/:id` | delete |
| GET/POST | `/api/transactions` | list (filters) / create |
| GET/PATCH/DELETE | `/api/transactions/:id` | read / edit / delete |
| POST | `/api/import/transactions` | bulk validate + import |
| GET | `/api/imports` | list import batches |
| DELETE | `/api/imports/:batchId` | undo an import batch |
| GET/POST | `/api/budgets` | list / create |
| PATCH/DELETE | `/api/budgets/:id` | update / delete |
| GET/POST | `/api/recurring` | list / create |
| PATCH/DELETE | `/api/recurring/:id` | toggle / delete |
| GET/PATCH | `/api/settings` | preferences (PIN is refused) |
| GET | `/api/summary` | totals + breakdowns |
| GET | `/api/balances` | net worth + per-account |
| GET | `/api/export` | full ledger JSON |

### Transaction item

```json
{
  "date": "2026-11-01",
  "type": "expense",
  "amount": 1250.50,
  "currency": "PKR",
  "account": "Cash",
  "category": "Groceries",
  "note": "weekly shop",
  "externalId": "stmt-2026-11-01-001"
}
```

`account`/`category` accept names or `accountId`/`categoryId`. `currency` defaults to the
account's currency. Transfers need `toAccount` and no category.

### Bulk import

```bash
curl -s -X POST http://192.168.1.23:8765/api/import/transactions \
  -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"dryRun":true,"transactions":[...]}'
```

- `dryRun: true` validates and returns the full report without writing.
- `allowPartial: false` (default) writes nothing if any row is invalid.
- `externalId` makes retries idempotent.
- The response includes `batchId` for undo and per-row results.

## AI import skill

The `smart-ledger-import` skill (installed at `~/.agents/skills/smart-ledger-import/`)
turns uploaded statements into an approval list, then calls this API. Ask:

> "Import this statement into Smart Ledger"

and paste the connection JSON when asked. The skill lists every proposed transaction first,
waits for approval, dry-runs the batch, writes it, and offers an undo.

## Security notes

- The server binds `0.0.0.0` when LAN access is on. Anyone on the same network who has the
  token can read and change the ledger.
- Traffic is plain HTTP. Use a trusted network; do not port-forward this server.
- Requests are rejected if the app is suspended or the server is stopped.
- PIN/app-lock settings cannot be changed through the API.
