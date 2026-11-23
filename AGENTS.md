# Smart Ledger — Project Guide

Personal finance / expense tracker. **Offline-first mobile app**: voice or manual entry → AI parsing → double-entry-ish ledger stored in on-device SQLite. No backend, no cloud, no auth — all data lives on the device.

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + TypeScript, Tailwind CSS v4 (`@theme` tokens in `index.css`) |
| Build | Vite 7, `vite-plugin-pwa` (autoUpdate PWA) |
| Mobile shell | Capacitor 8 → Android (`android/`). `appId: com.uzairalam.smartledger` |
| DB (native) | `@capacitor-community/sqlite` (real SQLite) |
| DB (web) | `localforage` wrapped in a **fake SQL engine** (regex parser) — dev/preview only |
| Charts | `recharts` · Animation | `framer-motion` · Icons | `lucide-react` · Dates | `date-fns` |
| AI parse | DeepSeek (`openai` SDK, `baseURL: api.deepseek.com`) — client-side |
| Speech-to-text | ElevenLabs `scribe_v1` (record audio → transcribe) |

## Commands

```bash
npm run dev         # vite dev server (host:true, LAN accessible)
npm run build       # tsc -b && vite build  → dist/
npm run lint        # eslint
npm run test:run    # vitest (pure logic: money, ledger math, backup crypto, validation)
npm run preview     # serve built dist
# Android: npm run build && npx cap sync android && npx cap open android
```
Vitest covers pure modules only; there is no component/E2E suite. After installing a debug APK, force-stop and relaunch once — the first launch can serve cached assets.

## Architecture

```
main.tsx → App.tsx (single-component router via activeTab state, no react-router)
   │  initializes sqliteService, subscribes to 4 services, holds all app state
   ├─ MobileLayout + BottomNav  (tabs: Home/Accounts/History/Insights/Settings + hidden Categories)
   ├─ screens/   Dashboard, Accounts, Transactions, Analytics, Settings, Categories
   ├─ components/ forms/ (Account, Category), transactions/TransactionForm, ui/BottomSheet, layout/
   ├─ hooks/     useVoiceInput (ElevenLabs record→transcribe), useSpeechRecognition (Web Speech API)
   └─ services/  (singletons, see below)
```

### Data layer (key abstraction)
`sqliteService` picks a provider at init by `Capacitor.getPlatform()`:
- **`NativeDbProvider`** — real SQLite. Schema created on connect, `PRAGMA foreign_keys=ON`. Transactions: the proxy **collects writes** and runs them via `executeSet(set, true)`; **queries execute immediately** against live DB → no read-your-own-writes inside a transaction.
- **`WebDbProvider`** — NOT real SQL. Regex-matches INSERT/UPDATE/DELETE/SELECT against localforage arrays. Only supports single `WHERE col = ?`, basic ORDER BY / LIMIT. **No transaction rollback** (just runs the callback). Treat web as a UI sandbox, not a correctness reference.

Schema lives in one place: `sqliteService.getSchemaSql()`. Tables: `accounts`, `categories`, `transactions`, `settings` (key/value JSON store).

### Service pattern
Each domain service is a singleton with an **observer pattern**: `subscribeToX(cb)` pushes listener + does initial fetch; mutations call private `fetchAndNotify()` which re-queries the *full list* and notifies all listeners. App.tsx subscribes to all four and re-renders.
- `accountService`, `categoryService`, `settingsService`, `transactionService`
- `ledgerEngine` — validates a `ParsedTransaction`, resolves account/category by case-insensitive name, delegates to `transactionService.createTransaction`. Throws `LedgerValidationError`.
- `backupService` — full JSON export (web=download, native=Filesystem+Share) / restore (wipes all tables, reinserts, `window.location.reload()`).
- `deepSeekService.parseTransaction` — NL text → strict JSON `ParsedTransaction`.
- `elevenLabsService.transcribeAudio` — Blob → text.

### Money model
- Each `Account` stores a denormalized `balance`, recomputed from `initialBalance + sum(transaction deltas)` after every write. `recalculateBalances()` is authoritative.
- One converter: `src/utils/money.ts` (`convert`, `resolveRates`, `DEFAULT_RATES`). It is the only rate table in the app; custom rates apply when `settings.useCustomRates` is on, pivoted through PKR.
- Transactions store their own `currency` **and the conversion frozen at write time**: `accountAmount`, `accountFee`, `toAccountAmount`, `baseAmount`, `baseCurrency`, `fxRate` (schema v3). Balance math uses these, so changing a rate later cannot rewrite history. Legacy rows are backfilled once during the v3 migration.
- Types: `Income | Expense | Transfer`. Transfer touches two accounts (`accountId` → `toAccountId`). Optional `fee`.
- Currencies: `PKR (base) | USD | AED | MYR`. PKR formatted as `Rs`, others via `Intl.NumberFormat`.

## Conventions

- **TypeScript everywhere.** Domain types centralized in `src/types/index.ts` — extend there.
- Tailwind utility classes inline; semantic color tokens (`bg-primary`, `text-expense`, `bg-bg-secondary`, etc.) defined in `index.css @theme` — use tokens, not raw hex.
- Mobile-first: fixed full-height layout, `env(safe-area-inset-*)`, BottomSheet for modals.
- IDs: `crypto.randomUUID()`. Dates: ISO strings.
- New persisted entity = add to `getSchemaSql()` + a service (copy an existing one) + subscribe in `App.tsx`. Mirror any new SQL shape in `WebDbProvider` or it silently no-ops on web.

## ⚠️ Gotchas / known weak spots

1. **Currency behavior is frozen per row.** `utils/money.ts` is the only converter. New transactions store their converted amounts; `recalculateBalances()` prefers those and only falls back to live rates for rows migrated before schema v3. An edit recomputes the row's frozen amounts on purpose.
2. **Web provider is a toy SQL engine.** Anything beyond simple CRUD + single-column WHERE won't work on web. Verify DB-related features on a native build.
3. **API keys live in secure storage.** `secretsService` uses the Android Keystore (localStorage on web) and migrates legacy keys out of the settings table on boot. Requests still leave the device for DeepSeek/ElevenLabs.
4. **Privacy boundary:** voice/text transactions are sent to ElevenLabs + DeepSeek. The "Local Storage Mode" banner refers to *storage*, not processing.
5. `fetchAndNotify` is public on the service singletons and is called directly by other services after batch writes.
6. Recent-transactions subscription is capped at **50** (`getRecentTransactions`). Anything needing more must call `getAllTransactions`.
7. Category delete sets `categoryId` NULL on transactions (FK `ON DELETE SET NULL`); account delete cascades + manual cleanup in `deleteAccount` for old DBs without cascade.
8. **NanoHTTPD does not parse PATCH bodies.** `ApiServerPlugin` reads the request stream itself for anything that is not POST/PUT; without that, every PATCH body arrives empty and silently no-ops.
9. **Pay cycles are stored, not derived from a setting.** `pay_periods` holds each salary-to-salary range; Insights/History/Budgets read those rows. Never shift a transaction date to change its reporting month — edit the cycle instead. Deleting/recreating cycles changes reports, so treat them as data.
10. `scripts/seedCategories.js` is a standalone script; runtime seeding is `services/db/seeder.ts` (runs once, guarded by `settings.categories_seeded`).

## Where things are
- App entry/state/routing: `src/App.tsx`
- Schema: `src/services/sqliteService.ts`
- Balance math: `src/services/transactionService.ts` + `src/services/ledgerMath.ts`
- Pay cycles: `src/services/periodService.ts` + `src/services/payPeriodMath.ts`, UI `src/screens/PayCycles.tsx`
- Currency: `src/utils/money.ts` (the only rate table)
- Security: `src/utils/crypto.ts` (PIN), `src/services/biometricService.ts`, `android/.../BiometricPlugin.java`
- Backups: `src/services/backupService.ts` + `src/services/backupVerify.ts` + `src/utils/backupCrypto.ts`
- Import skill: `skills/smart-ledger-import/` (installed at `~/.agents/skills/smart-ledger-import/`)
- AI prompt: `src/services/deepSeekService.ts`
- Design tokens: `src/index.css`
- Android project: `android/` · Capacitor config: `capacitor.config.ts`
