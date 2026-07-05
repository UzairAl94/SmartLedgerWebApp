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
npm run dev       # vite dev server (host:true, LAN accessible)
npm run build     # tsc -b && vite build  → dist/
npm run lint      # eslint
npm run preview   # serve built dist
# Android: npm run build && npx cap sync android && npx cap open android
```
No test framework configured.

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
- Each `Account` stores a denormalized `balance`, updated on every tx create/edit/delete. `transactionService` does manual revert-then-reapply on edit/delete to keep balances consistent.
- Transactions store their own `currency`; balance updates convert into the account's currency via `convertCurrency` (`utils/format.ts`).
- Types: `Income | Expense | Transfer`. Transfer touches two accounts (`accountId` → `toAccountId`). Optional `fee`.
- Currencies: `PKR (base) | USD | AED | MYR`. PKR formatted as `Rs`, others via `Intl.NumberFormat`.

## Conventions

- **TypeScript everywhere.** Domain types centralized in `src/types/index.ts` — extend there.
- Tailwind utility classes inline; semantic color tokens (`bg-primary`, `text-expense`, `bg-bg-secondary`, etc.) defined in `index.css @theme` — use tokens, not raw hex.
- Mobile-first: fixed full-height layout, `env(safe-area-inset-*)`, BottomSheet for modals.
- IDs: `crypto.randomUUID()`. Dates: ISO strings.
- New persisted entity = add to `getSchemaSql()` + a service (copy an existing one) + subscribe in `App.tsx`. Mirror any new SQL shape in `WebDbProvider` or it silently no-ops on web.

## ⚠️ Gotchas / known weak spots

1. **Two currency-conversion implementations.** `utils/format.ts convertCurrency` (hardcoded rates) is what `transactionService` actually uses for balance math — it does **not** receive the user's `customRates`, so custom rates in Settings don't affect stored balances. `currencyService.ts` is a separate settings-aware converter used elsewhere. Hardcoded rates are also duplicated/inconsistent across `format.ts`, `currencyService.ts`, and `settingsService` defaults.
2. **Web provider is a toy SQL engine.** Anything beyond simple CRUD + single-column WHERE won't work on web. Verify DB-related features on a native build.
3. **API keys are plaintext.** Stored in the `settings` table and sent from the client (`dangerouslyAllowBrowser: true`). Seeded from `VITE_DEEPSEEK_API_KEY` / `VITE_ELEVEN_LABS_API_KEY` env at first run.
4. **Privacy boundary:** voice/text transactions are sent to ElevenLabs + DeepSeek. The "Local Storage Mode" banner refers to *storage*, not processing.
5. `transactionService.fetchAndNotify` is public; `accountService.fetchAndNotify` is private and poked via `(accountService as any)` — leaky.
6. Recent-transactions subscription is capped at **50** (`getRecentTransactions`). Anything needing more must call `getAllTransactions`.
7. Category delete sets `categoryId` NULL on transactions (FK `ON DELETE SET NULL`); account delete cascades + manual cleanup in `deleteAccount` for old DBs without cascade.
8. `scripts/seedCategories.js` is a standalone script; runtime seeding is `services/db/seeder.ts` (runs once, guarded by `settings.categories_seeded`).

## Where things are
- App entry/state/routing: `src/App.tsx`
- Schema: `src/services/sqliteService.ts`
- Balance math: `src/services/transactionService.ts` + `src/utils/format.ts`
- AI prompt: `src/services/deepSeekService.ts`
- Design tokens: `src/index.css`
- Android project: `android/` · Capacitor config: `capacitor.config.ts`
