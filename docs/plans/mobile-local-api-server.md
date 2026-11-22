# In-App Local API Server + Approval-First Import Skill

## Goal

Let the Android app host an HTTP API on the local Wi-Fi network so that, from the laptop, we can:

1. Read the ledger (accounts, transactions, categories, budgets, recurring, summaries).
2. Bulk-add transactions from documents you attach in a chat session — after you approve the proposed list.
3. Undo a whole imported batch in one call.

The app remains the single source of truth. The API is a thin transport over the existing singleton services, so any change made over HTTP appears in the app immediately through the existing observer subscriptions.

The same server is also the **future host for a browser UI**: in the next version the phone can serve the built React bundle at `/` and the API at `/api/*`, so a laptop browser opens `http://<phone-ip>:8765` and runs the app against the phone's ledger. Phase 1 below ships the API and the static-serving foundation; Phase 2 adds the browser client. Every API/DTO/auth decision is made so Phase 2 does not require breaking changes.

## Hard constraints and decisions

- **Android only.** A browser page cannot listen on a TCP port, so the PWA/web build shows the section disabled with an explanation. No Electron/Tauri detour.
- **Native server, JS business logic.** A pure-JS HTTP server is impossible inside a Capacitor WebView. The server is a small native plugin (NanoHTTPD) that forwards each request into the WebView, where the existing TypeScript services handle it. This avoids duplicating SQLite schema, balance math, and validation in Java.
- **LAN access, mandatory token.** The server binds `0.0.0.0` (user requirement: laptop and phone on the same network) and every request needs `Authorization: Bearer <token>`. Token lives in secure storage, is shown/copied/regenerated in Settings.
- **The WebView must stay alive.** While the app is open the bridge works; if Android suspends the WebView, requests time out. Settings shows this warning. A partial wake lock is held while the server runs.
- **Parsing happens in the session, not in the app.** We build a skill that reads uploaded documents, produces an approval list, and only then calls the import API. The app never runs OCR/LLM on documents.
- **No guessing.** Missing accounts/categories are reported in the approval list; you decide whether to create them or remap. The import endpoint rejects unknown references by default.
- **Additive schema changes.** Use the versioned migration system shipped in the last change (`PRAGMA user_version`), moving to schema version 2.
- **UI-agnostic contract.** The API is a normal JSON/HTTP contract with token auth and CORS, usable from the phone, a browser served by the phone, or a separately hosted web app. No endpoint assumes the caller is the in-app JS layer.
- **Serve the built bundle from day one.** The native server already serves `assets/public` (Capacitor's copy of `dist`) at `/` with SPA fallback, while `/api/*` is bridged to JS. Phase 2 then only needs the client-side remote mode, not a server rewrite.
- **Browser secure-context limits are real.** Over plain `http://<lan-ip>` browsers disable `getUserMedia`, service workers, `crypto.randomUUID`, `crypto.subtle`, and the Clipboard API. Phase 2a is therefore a read/write-but-no-voice/camera/PWA build; full parity needs HTTPS or `adb reverse` + `http://localhost`.

---

## Architecture

```
Laptop (this session)                         Phone (Android)
┌──────────────────────┐   LAN HTTP         ┌─────────────────────────────────────────┐
│ curl / skill         │ ─────────────────▶ │ NanoHTTPD (ApiServerPlugin.java)        │
│ Authorization: Bearer│                    │  · token check · CORS · body limit      │
│ http://<ip>:8765/... │                    │  · notifyListeners("request", payload)  │
└──────────────────────┘                    │            │                            │
        ▲                                   │            ▼                            │
        │  HTTP response                    │  WebView JS: apiServer/router.ts        │
        └───────────────────────────────────│   handlers → existing services          │
                                            │   accounts / transactions / budgets …   │
                                            │            │                            │
                                            │            ▼                            │
                                            │  sqliteService (native SQLite)          │
                                            └─────────────────────────────────────────┘
```

Routing inside the native server:
- `/api/*` → auth check → JS bridge (the request/response cycle below).
- `/assets/*`, `/manifest.json`, icons, `sw.js`, etc. → served straight from the APK's `assets/public` with correct MIME types and cache headers.
- Any other path without a file extension → `index.html` (SPA fallback).
- Static files are **not** authenticated (the bundle is not sensitive); every `/api/*` call is.

Request/response bridge:

1. NanoHTTPD worker thread gets a request, validates auth, and creates `requestId`.
2. It stores a `CompletableFuture<Response>` in a `ConcurrentHashMap`, then posts `{requestId, method, url, headers, body}` to JS on the UI thread.
3. The JS router processes the request through the existing services and calls `ApiServer.respond({requestId, status, body})`.
4. The native future completes and NanoHTTPD writes the response.
5. Timeout (30 s) → `504`; if the callback fails → `503`.

Requests are serialized in JS with a promise queue so two concurrent writes can never race balance recalculation.

---

## API surface

Base URL: `http://<phone-lan-ip>:8765`. All routes require the bearer token.

### Meta
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | status, version, row counts, bound address |
| GET | `/api/version` | tiny `{rev, counts, maxUpdatedAt}` payload for cheap 5 s polling by the browser UI |
| GET | `/api` | endpoint catalog + request/response examples |
| GET | `/api/logs` | last 50 requests (method, path, status, duration) |

All responses are JSON with `Cache-Control: no-store`. CORS is open (`Access-Control-Allow-Origin: *`, `Authorization` allowed) so a separately hosted web client can use the same API; there are no cookies, so `*` is safe. Browser callers store the token themselves and send `Authorization: Bearer …` on every request.

`/api/version` computes a cheap revision from row counts plus the newest transaction id/date and the current settings hash. The browser UI polls it and only refetches when `rev` changes. (Native/in-app changes are not instrumented, so polling is the sync mechanism — no SSE/WebSocket in v1 because the bridge is request/response.)

### Accounts / categories
| Method | Path | Notes |
|---|---|---|
| GET | `/api/accounts` | list |
| POST | `/api/accounts` | `{name, type, currency, initialBalance?, color?, icon?}` |
| PATCH | `/api/accounts/:id` | whitelist name/type/color/icon; currency + initialBalance only when no transactions |
| DELETE | `/api/accounts/:id` | cascades transactions, receipts, and recurring rules |
| GET | `/api/categories` | list |
| POST | `/api/categories` | `{name, type, icon?, color?}` |
| DELETE | `/api/categories/:id` | transactions' `categoryId` becomes null |

### Transactions
| Method | Path | Notes |
|---|---|---|
| GET | `/api/transactions` | filters: `from`, `to`, `accountId`, `categoryId`, `type`, `q`, `batchId`, `limit` (default 100, max 1000), `offset`, `order` |
| GET | `/api/transactions/:id` | single |
| POST | `/api/transactions` | single create (same item shape as import) |
| PATCH | `/api/transactions/:id` | edit; fetch current row then call `updateTransaction` |
| DELETE | `/api/transactions/:id` | delete + receipt cleanup |

Transaction item shape (used by POST, PATCH, and each import row):

```json
{
  "date": "2026-11-01",
  "type": "expense",
  "amount": 1250.50,
  "currency": "PKR",
  "account": "Cash",
  "category": "Groceries",
  "toAccount": null,
  "fee": 0,
  "note": "weekly shop",
  "hidden": false,
  "externalId": "stmt-2026-11-01-001"
}
```

Rules: `account` or `accountId` accepted (exactly one); `category` required for Income/Expense; `toAccount` required for Transfer and must differ from the source; `amount > 0`; `date` accepts `YYYY-MM-DD` (stored as `YYYY-MM-DDT12:00:00.000Z`) or a full ISO timestamp; `currency` defaults to the account's currency.

### Import (the main workflow)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/import/transactions` | `{dryRun?, allowPartial?, source?, batchId?, transactions[]}` |
| GET | `/api/imports` | batches grouped by `importBatchId` with counts and date span |
| DELETE | `/api/imports/:batchId` | undo: delete every transaction in the batch, recalc once |

Validation-first behavior:

- The endpoint validates **every** row before writing.
- `dryRun: true` returns the full report and writes nothing.
- With `dryRun: false` and `allowPartial: false` (default), **nothing is written** if any row is invalid. You get `400` plus the report.
- `allowPartial: true` writes the valid rows and reports the failures.

Dry-run / error report shape:

```json
{
  "dryRun": true,
  "summary": { "total": 12, "valid": 10, "missingReferences": 2, "duplicates": 0 },
  "missing": { "accounts": ["HBL"], "categories": ["Groceries"] },
  "items": [
    { "index": 0, "status": "valid", "resolved": { "accountId": "...", "accountName": "Cash", "categoryName": "Groceries" } },
    { "index": 1, "status": "missing-account", "error": "Account \"HBL\" not found" }
  ]
}
```

Successful write shape:

```json
{
  "batchId": "2026-11-22T18:30:00.000Z_5f2c...",
  "created": 10,
  "skipped": 0,
  "failed": 0,
  "items": [{ "index": 0, "status": "created", "id": "..." }]
}
```

### Budgets / recurring
| Method | Path | Notes |
|---|---|---|
| GET | `/api/budgets` | list |
| POST | `/api/budgets` | `{category, amount, currency?, period?}` |
| PATCH | `/api/budgets/:id` | `{amount?, currency?}` |
| DELETE | `/api/budgets/:id` | |
| GET | `/api/recurring` | list |
| POST | `/api/recurring` | same fields as the Recurring form |
| PATCH | `/api/recurring/:id` | `{active?: 0|1}` |
| DELETE | `/api/recurring/:id` | |

### Read / analysis
| Method | Path | Notes |
|---|---|---|
| GET | `/api/summary` | `?from&to&currency&groupBy=month\|category\|account` |
| GET | `/api/balances` | `?currency` — net worth + per-account converted balances |
| GET | `/api/settings` | `appPin` redacted as `hasPin`; API token never returned |
| PATCH | `/api/settings` | whitelist: mainCurrency, monthStartDay, useCustomRates, customRates, theme, notificationsEnabled, autoBackupEnabled, backupFrequency, backupTime. Never `appPin`/`appLockEnabled`. |
| GET | `/api/export` | full ledger JSON (same shape as backup `data.json`, no receipts) |

`/api/summary` response:

```json
{
  "range": { "from": "2026-11-01", "to": "2026-11-30" },
  "currency": "PKR",
  "totals": { "income": 0, "expense": 0, "net": 0, "fees": 0, "count": 0 },
  "byCategory": [{ "categoryId": "...", "name": "Groceries", "type": "Expense", "total": 0, "count": 0 }],
  "byAccount": [{ "accountId": "...", "name": "Cash", "income": 0, "expense": 0, "net": 0 }],
  "byPeriod": [{ "period": "2026-11", "income": 0, "expense": 0, "net": 0 }]
}
```

Analysis reads use `getAllTransactions()` and filter/aggregate in JS (the DB layer's SQL subset is limited, and the ledger is small). Use `convertCurrency` with the user's custom rates so API numbers match the UI.

---

## Data model changes (schema v2)

Add to `Transaction` in `src/types/index.ts`:

```ts
externalId?: string;    // caller-supplied idempotency key (statement row id)
importBatchId?: string; // groups rows created by one import; enables undo
```

`sqliteService.ts`:
- Add both columns to the `transactions` block in `getSchemaSql()`.
- Bump `LATEST_SCHEMA_VERSION` to `2`.
- Add `if (version < 2)` using the existing `ensureColumn()` helper, plus:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(externalId);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  ```
  (The web provider ignores index statements with a warning; harmless.)
- `createTransaction` INSERT gains the two columns (14 placeholders).
- `updateTransaction` leaves the columns untouched, so edits preserve them.
- Backup/restore (`backupService.ts`) includes them in the insert list.

Dedupe: a batch pre-loads all existing `externalId`s into a `Set`; a row with an already-seen `externalId` is `skipped: duplicate`. `externalId` is optional — if absent, only identical ids within the same request are deduped.

---

## New service methods

`src/services/transactionService.ts`:
- `getTransactionById(id)`
- `findByExternalId(externalId)` — uses `WHERE externalId = ?` (supported on both providers)
- `createTransactionsBatch(txs: Omit<Transaction,'id'>[]): Promise<string[]>` — one `sqliteService.transaction`, N inserts, one `recalculateBalances()`. Skips per-row incremental balance math because recalc is authoritative.
- `deleteTransactionsBatch(txs: Transaction[]): Promise<void>` — one transaction, N deletes, receipt cleanup, one recalc.

`src/services/analyticsService.ts` (new, pure functions, no observers):
- `summarize({ transactions, accounts, categories, settings, from, to, currency, groupBy })`
- `computeBalances({ accounts, settings, currency })`

These stay API-agnostic so the UI can adopt them later instead of its duplicated math.

---

## Native plugin

New file: `android/app/src/main/java/com/uzairalam/smartledger/ApiServerPlugin.java`

- `@CapacitorPlugin(name = "ApiServer") extends Plugin`
- `@PluginMethod start(call)`: reads `port` (default 8765), `token`, `allowLan`; starts NanoHTTPD on `0.0.0.0` or `127.0.0.1`; acquires a partial wake lock; returns `{port, addresses}` (site-local IPv4s from `NetworkInterface`).
- `@PluginMethod stop(call)`: stops server, releases wake lock, fails outstanding futures with 503.
- `@PluginMethod respond(call)`: completes the pending future for `requestId`.
- `@PluginMethod getStatus(call)`: `{running, port, host, addresses, requestCount}`.
- `serve(IHTTPSession)`: validates `Authorization: Bearer <token>` (constant-time compare), handles `OPTIONS` preflight, enforces a 5 MB body cap, builds the payload, calls `notifyListeners("request", payload)` on the UI thread, waits on the future up to 30 s, and returns the response with `Content-Type: application/json`, `Cache-Control: no-store`, and permissive CORS headers.
- `serve(IHTTPSession)` also branches on the path: `/api/...` uses the bridge above; anything else is handled by `serveStaticFile()`.
- `serveStaticFile()`: reads from `getContext().getAssets().open("public/" + path)` (Capacitor copies `dist/` there on `cap sync`); sets MIME types (`.html`, `.js`, `.css`, `.json`, `.png`, `.svg`, `.woff2`, `.wasm`); `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, `no-cache` for `index.html`; falls back to `index.html` for extensionless paths (SPA routes).
- When serving `index.html`, inject a small bootstrap before `</head>`:
  ```html
  <script>window.__SMARTLEDGER_REMOTE__ = { baseUrl: "", tokenRequired: true };</script>
  ```
  The app reads this on boot to select the remote backend (Phase 2). Missing file → plain `404` with a short "Run npm run build && npx cap sync android" hint.

Registration: `MainActivity.java` → `registerPlugin(ApiServerPlugin.class);` before `super.onCreate(...)`, matching the SQLite plugin.

Build changes:
- `android/app/build.gradle`: `implementation "org.nanohttpd:nanohttpd:2.3.1"`
- `AndroidManifest.xml`: `<uses-permission android:name="android.permission.WAKE_LOCK" />`
- Run `npx cap sync android` afterwards (this also fixes the currently missing camera/local-notifications/secure-storage plugin registrations).

---

## JS server layer

New directory `src/services/apiServer/`:

| File | Responsibility |
|---|---|
| `plugin.ts` | `registerPlugin<ApiServerPlugin>('ApiServer', { web: () => import('./pluginWeb')… })`, request/response types |
| `pluginWeb.ts` | web stub: start/stop reject with "Available in the Android app only" |
| `index.ts` | lifecycle (`init`, `start`, `stop`, `getState`, `subscribe`), request listener, serialized promise queue, ring-buffer log, token helpers |
| `router.ts` | route table (method + regex), parse URL/query/body, dispatch, `ApiError` → status mapping |
| `handlers.ts` | all endpoint handlers; resolves names→ids, calls services, builds DTOs |
| `validate.ts` | coercion for type/date/amount/currency, item validation, missing-reference collection |
| `types.ts` | request/response DTOs |

`index.ts` sketch:

```ts
const listeners: RequestListener[] = [];

ApiServer.addListener('request', (req) => {
  enqueue(async () => {
    const started = performance.now();
    try {
      const { status, body } = await route(req);
      await ApiServer.respond({ requestId: req.requestId, status, body: JSON.stringify(body) });
      log(req, status, performance.now() - started);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      log(req, status, performance.now() - started);
      await ApiServer.respond({ requestId: req.requestId, status, body: JSON.stringify(errorBody(e)) });
    }
  });
});
```

Initialization: call `apiServer.init()` from an `App.tsx` effect so the listener is registered once after mount. Requests that arrive before DB init still work because every service call awaits `sqliteService.initialize()`.

Token: extend `SECRET_KEYS` with `apiToken`. On first start, generate 32 random bytes (hex) via `crypto.getRandomValues`, store through `secretsService`. Regenerate from Settings; if the server is running, restart it with the new token.

Settings additions in `src/types/index.ts` + `settingsService.ts` defaults:
```ts
apiServerPort: 8765,
apiServerAllowLan: true,
```

---

## Settings UI

New section `Local API` between Automatic Backup and Data Management in `src/screens/Settings.tsx`:

- **Start / Stop server** button, with running/stopped status and error text.
- **Port** input (1024–65535) and **Allow access from other devices on Wi-Fi** toggle.
- **Connection URL**: every detected LAN IPv4, e.g. `http://192.168.1.23:8765`.
- **Access token**: masked by default, reveal/copy/regenerate.
- **Copy connection details** → `{"baseUrl":"http://192.168.1.23:8765","token":"…"}` for pasting into the session.
- **Open in browser** → opens `http://<ip>:<port>` (Phase 2 UI; optionally carries the token in the URL fragment).
- **Recent requests** (last 5: method, path, status, ms).
- Warning text: "Keep the app open while using the API. Traffic on your Wi-Fi is not encrypted; keep the token private."
- On web: the section renders disabled with "Available in the Android app only."

Use existing Tailwind tokens and the same toggle/section markup already used in Settings.

---

## Import skill

New global skill: `~/.agents/skills/smart-ledger-import/SKILL.md` (frontmatter: name, description, argument-hint). It is available in every session.

Flow encoded in the skill:

1. **Resolve connection.** Read `./.smartledger-api.json` (`{baseUrl, token}`) if present; otherwise ask you to tap **Copy connection details** in Settings and paste it. Write the file (gitignored). Verify with `GET /api/health`.
2. **Load context.** Fetch `/api/accounts`, `/api/categories`, `/api/settings`, and a recent `/api/summary` window. Never invent accounts or categories.
3. **Read the documents** you attach (PDF/image/statement) using the agent's file-reading tools. Extract candidate rows: date, type, amount, currency, account, category, note. Mark anything ambiguous as "needs confirmation".
4. **Show the approval list** — a numbered table of every proposed transaction, plus a **Needs your decision** section for unknown accounts/categories, missing currencies, and possible duplicates (same date+amount+account). Wait for explicit approval.
5. **Resolve issues.** Only after you say so, create missing accounts/categories via `POST /api/accounts` / `POST /api/categories`, or remap rows.
6. **Dry run.** `POST /api/import/transactions` with `dryRun: true`; show the validation report; fix anything it flags.
7. **Write.** `POST /api/import/transactions` with `dryRun: false`, `allowPartial: false`, `source: "<document name>"`. Never write without approval.
8. **Verify and report.** Read back the batch (`GET /api/transactions?batchId=…` or `GET /api/imports`), report the created count and batch id, and remind you to check the app (it updates live).
9. **Undo.** Offer `DELETE /api/imports/:batchId` if anything is wrong.
10. **Analysis mode.** For "how much did I spend on X", use `/api/summary`, `/api/balances`, and filtered `/api/transactions`; answer from real data only.

Safety rules in the skill: treat the token as a secret (never print it), never import unapproved rows, never guess a missing account/category, and surface `401`/`409`/timeouts plainly.

`.gitignore`: add `.smartledger-api.json`.

---

## Implementation order

1. **Schema + types**: add `externalId`/`importBatchId`, bump to v2, update `createTransaction`, backup/restore.
2. **Batch service methods**: `createTransactionsBatch`, `deleteTransactionsBatch`, `findByExternalId`, `getTransactionById`.
3. **Native plugin**: Java server (API bridge + static `assets/public` serving + SPA fallback + injected remote flag) + MainActivity registration + gradle/manifest changes; `npx cap sync android`.
4. **JS layer**: plugin wrapper, queue, router, validation, handlers (accounts → categories → transactions → import → budgets/recurring → settings → analysis).
5. **Settings UI**: section, token management, connection details, "Open in browser", request log.
6. **Skill**: write `SKILL.md` and the `.gitignore` entry.
7. **Docs**: short README section describing start/stop, URL, token, browser UI, and the skill.
8. **Phase 2 (separate follow-up)**: `LedgerBackend` abstraction, `HttpBackend`, `RemoteGate`, capability gating, `/api/version` polling, optional TLS.

---

## Verification

**Build**
- `npm run build` (tsc + Vite) passes.
- `npx cap sync android` completes; `android/app/src/main/assets/capacitor.plugins.json` includes the previously missing plugins.
- `./gradlew assembleDebug` (or Android Studio) builds and installs.

**API smoke tests from the laptop** (replace IP/token):
```bash
BASE=http://192.168.1.23:8765
TOKEN=...
curl -s $BASE/api/health -H "Authorization: Bearer $TOKEN"
curl -s $BASE/api/accounts -H "Authorization: Bearer $TOKEN"
curl -s -X POST $BASE/api/import/transactions -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"dryRun":true,"transactions":[...]}'
curl -s -X POST $BASE/api/import/transactions -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' --data @batch.json
curl -s $BASE/api/summary?from=2026-11-01\&to=2026-11-30 -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE $BASE/api/imports/<batchId> -H "Authorization: Bearer $TOKEN"
```

**Static bundle checks (Phase 2 foundation)**
```bash
curl -sI  $BASE/                      # 200, text/html, no-cache
curl -s   $BASE/ | grep __SMARTLEDGER_REMOTE__   # injected bootstrap present
curl -sI  $BASE/assets/<hashed>.js    # 200, text/javascript, immutable cache
curl -sI  $BASE/history               # 200, text/html (SPA fallback)
curl -s   $BASE/api/health            # 401 without token, 200 with token
```

**Behavior checks**
- Missing token → `401`; wrong token → `401`; unknown route → `404`; bad payload → `400` with field errors.
- A dry run writes nothing (balances unchanged).
- A rejected bulk import (unknown reference) writes nothing.
- A successful import appears in Home/History instantly and balances match Insights.
- Undo restores the previous balances.
- Server survives multiple sequential requests; a second concurrent request queues behind the first.
- Stopping the server releases the port and refuses new connections.
- App backgrounded/screen locked → request times out gracefully with a clear error (documented limitation).

**Security checks**
- `GET /api/settings` never returns `appPin` or the API token.
- `PATCH /api/settings` rejects `appPin`/`appLockEnabled`.
- Logs never include request bodies or the token.
- Server only listens on `0.0.0.0` when "Allow access from other devices" is on.

---

## Phase 2 — browser UI served by the phone (next version)

Phase 1 deliberately ships the server-side half: `/api/*` plus static serving of `dist/`. Phase 2 makes the React bundle run in remote mode. Nothing in the API changes.

### Mode detection and boot

The native server injects `window.__SMARTLEDGER_REMOTE__ = { baseUrl: "", tokenRequired: true }` into the served `index.html`. On boot:

- `isRemoteWeb()` = `Capacitor.getPlatform() === 'web' && !!window.__SMARTLEDGER_REMOTE__`.
- The in-app/PWA web build (dev server, hosted PWA) keeps using the existing `WebDbProvider`; only the bundle served by the phone switches to the remote backend.

### Auth in the browser

- A `RemoteGate` screen asks for the access token when none is stored.
- Store it in `sessionStorage` by default (`localStorage` optional "remember this device").
- Validate with `GET /api/health`; on `401` clear the token and show the gate again.
- Convenience: Settings → **Open in browser** builds `http://<ip>:8765/#token=<token>`; the app reads the fragment, stores it, then clears it with `history.replaceState` so it does not stay in the address bar/history. The login screen remains the default.

### Backend abstraction

The components currently import service singletons directly, so remote mode needs a seam at that layer, not in the screens.

1. Define `src/services/backend/types.ts`: `LedgerBackend` with accounts/categories/transactions/budgets/recurring/settings/analytics methods.
2. `LocalBackend` delegates to the existing services (no behavior change on device).
3. `HttpBackend` uses a small `apiClient.ts`: `fetch(baseUrl + '/api/...')`, `Authorization: Bearer`, JSON, 401 handling, and request cancellation.
4. Refactor the singleton internals to call the active backend. Keep the singleton signatures so components do not change.
5. Remote observers: `subscribeToX` registers the listener and starts a 5 s `/api/version` poll; on a changed `rev`, refetch and notify. Mutations await the API then immediately refetch. No SSE/WebSocket in v1.

Staging recommendation:
- **2a** — read-only remote UI: Dashboard, History, Accounts, Insights, balances/summary. This needs only GET endpoints and is low risk.
- **2b** — write parity: transaction/account/category/budget forms, import, settings.
- **2c** — optional full parity (voice, receipts, notifications, PWA) behind HTTPS.

### Capability gating (important)

Plain `http://<lan-ip>` is **not a secure context**, so the browser build must hide/disable:

| Feature | Why | Remote behavior |
|---|---|---|
| Voice input (`getUserMedia`) | secure context only | hide the Voice button |
| Receipt camera/upload (`@capacitor/camera`, Filesystem) | native plugins absent | hide attach/preview |
| Local notifications | native plugin absent | hide the toggle |
| PWA install / service worker | secure context only | skip SW registration in remote mode |
| App lock / PIN | phone-only security | skip the lock screen; API token is the gate |
| `crypto.randomUUID()` | secure context only | use a `crypto.getRandomValues` fallback, or let the server generate ids |
| Clipboard API | secure context only | selectable text fallback |

Add `src/utils/platform.ts` exposing `isRemoteWeb()` and a `capabilities` object; gate the UI on it.

### Full parity needs HTTPS (or localhost)

- `adb reverse tcp:8765 tcp:8765` + `http://localhost:8765` is treated as a secure context, so voice/PWA/clipboard work — but requires USB.
- For LAN, add optional TLS in the native plugin (self-signed cert generated on first start, served over HTTPS; user trusts it once). This also matters for a **separately hosted** HTTPS web app: browsers block an HTTPS page calling an `http://` API (mixed content). Plan TLS before shipping any hosted UI.

### Serving/build workflow

- `npm run build && npx cap sync android` puts `dist/` into `assets/public`; rebuild/install the APK to update the browser UI.
- Show the bundle version in Settings so it is obvious when the served UI is stale.
- Phase 2 does not add offline caching, multi-user, or background sync.

---

## Known limitations / follow-ups

- Cleartext HTTP over the LAN; the bearer token is the only protection. Add TLS with a pinned self-signed certificate later if the threat model changes.
- The server is tied to the app process and the WebView being alive; no foreground service in v1.
- Very large imports (thousands of rows) are limited by the 5 MB body cap and SQLite bridge throughput; batch inserts keep it workable.
- The API is versioned informally (`/api`); add `/api/v1` if external clients appear.
- If the LAN is blocked (AP isolation), fall back to `adb reverse tcp:8765 tcp:8765` and use `http://127.0.0.1:8765` (enable the "Allow LAN" toggle off to bind loopback only).
- Browser UI over plain HTTP loses voice, camera/receipts, PWA/service-worker install, the Clipboard API, `crypto.randomUUID`, and `crypto.subtle`. These are OS/browser restrictions, not bugs; full parity needs HTTPS or `http://localhost` via `adb reverse`.
- A separately hosted HTTPS web app cannot call the HTTP API (mixed-content blocking). Add TLS to the phone server before hosting the UI anywhere else.
- Static assets are served without auth by design; only the `/api/*` surface is token-protected. The bundle contains no secrets.
- Phase 2 assumes one reader at a time and 5 s polling; it does not add multi-user sessions, offline caching, or push.
