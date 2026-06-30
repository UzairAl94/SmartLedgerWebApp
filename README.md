# Smart Ledger

Offline-first personal finance tracker. Record transactions by **voice or manual entry**, let AI parse them into structured ledger entries, and keep everything in **on-device SQLite** — no backend, no cloud, no sign-in. Runs as an installable PWA and as a native Android app via Capacitor.

## Features

- 🎙️ **Voice entry** — speak a transaction; ElevenLabs transcribes, DeepSeek parses it into amount / type / account / category.
- ✍️ **Manual entry** — full form for income, expense, and transfers (with optional fees).
- 🏦 **Accounts** — Bank / Cash / Investment, each with its own currency and live balance.
- 🏷️ **Categories** — seeded income/expense sets, fully customizable.
- 💱 **Multi-currency** — PKR (base), USD, AED, MYR, with custom exchange rates.
- 📊 **Analytics** — spending breakdowns and trends (recharts).
- 💾 **Backup & restore** — export/import all data as JSON.
- 📱 **Mobile-first PWA + Android** build.

## Tech stack

| Layer | Tech |
|-------|------|
| UI | React 19, TypeScript, Tailwind CSS v4 |
| Build | Vite 7, `vite-plugin-pwa` |
| Mobile | Capacitor 8 (Android) |
| Storage | `@capacitor-community/sqlite` (native) · `localforage` (web) |
| Voice | ElevenLabs (speech-to-text) + DeepSeek (parsing) |
| Charts / UI | recharts, framer-motion, lucide-react, date-fns |

## Getting started

```bash
npm install
npm run dev        # Vite dev server (LAN-accessible)
```

### Build

```bash
npm run build      # type-check + production build → dist/
npm run preview    # serve the built app
npm run lint       # eslint
```

### Android

```bash
npm run build
npx cap sync android
npx cap open android   # open in Android Studio
```

## Configuration

Voice features need API keys. Set them in **Settings** in-app, or seed at first run via env:

```bash
VITE_DEEPSEEK_API_KEY=...      # transaction parsing
VITE_ELEVEN_LABS_API_KEY=...   # speech-to-text
```

> Note: data is stored locally, but voice/text entries are sent to ElevenLabs and DeepSeek for processing.

## Project layout

```
src/
  App.tsx           App entry, state, tab routing
  screens/          Dashboard, Accounts, Transactions, Analytics, Settings, Categories
  components/        forms, transaction form, layout, UI primitives
  hooks/            useVoiceInput, useSpeechRecognition
  services/         account/category/transaction/settings services, ledgerEngine,
                    backup, deepSeek, elevenLabs, db/ (SQLite + web providers)
  types/            shared domain types
android/            Capacitor Android project
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture details and contributor notes.
