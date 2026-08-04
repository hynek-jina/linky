# Linky

Linky is a mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments.
It is local-first: data is stored in Evolu (SQLite) and syncs between devices.

The repo also contains a separate public website in `apps/site/` intended for `linky.fit`, while the product app remains a distinct deployment on `app.linky.fit`.

## Protocols and stack

- Nostr (chat, profile, auth-related flows)
- Evolu (local-first DB + sync)
- Cashu + mints (Lightning wallet flow)
- npub.cash (LN address + mint preference sync)

## Authentication model

- Login supports either:
  - `nsec`, or
  - one 20-word **SLIP-39** share
- With SLIP-39 login:
  - Nostr keypair is derived at `m/44'/1237'/0'/0/0`
  - deterministic Evolu owner lanes are derived for:
    - contacts (`contacts-n`)
    - cashu (`cashu-n`)
    - messages (`messages-n`)
    - owner metadata (`ownerMeta`)
- If user pastes custom `nsec` during a SLIP-39 session, app switches to pasted key locally without immediate Evolu restore/write; choosing Derive switches back to seed-derived key.

## Owner rotation and limits

- Contacts/cashu/messages owner lanes auto-rotate when owner-local write delta reaches:
  - `OWNER_ROTATION_TRIGGER_WRITE_COUNT = 1000`
- Per-type rotation cooldown:
  - `OWNER_ROTATION_COOLDOWN_MS = 60000` (1 minute)
- Contacts and valid token data migrate forward; messages are pointer-rotated (no message copy).
- App reads active + previous message owner for continuity.
- Stale owners are pruned locally (`n-2`) after rotation.
- Contact cap:
  - `MAX_CONTACTS_PER_OWNER = 500`

## Features

- Contacts: add/edit/delete, QR scan/share, grouping
- Messages: encrypted private chat (gift-wrap/NIP-17 flows)
- Wallet: Cashu token ingest, restore, validation, spend
- Payments:
  - Lightning invoice and LN address payment
  - contact payment via Cashu message flow
- Push: optional Bun push service in `apps/push/` for generic Web Push notifications on new outer inbox `kind: 1059` events
- Debug pages for Evolu current/history data and owner/rotation diagnostics

## Development

Requirements: Bun; Docker for the local dev service stack

For Android native builds: Java 17

### Local dev vs prod services

- `bun run dev` — full local environment: starts `docker-compose.dev.yml` (local Nostr relay :7777, Evolu sync relay :4001, Cashu Nutshell **FakeWallet** mint :3338 that auto-settles invoices with fake sats), then runs the web app (:5173) and push service (:8787) against it via the committed `.env.development` files. npub.cash flows are disabled locally (#219); the mint has no real Lightning backend (#220).
- `bun run dev:prod` — web app only, on :5175, against production services. The separate port keeps browser storage isolated from local-dev sessions.
- `bun run dev:services` — just the docker stack, attached.

### Dev inspector

While the dev server runs, the dev inspector shows everything the app does over Nostr, Cashu, and Evolu. It is dev-only and compiled out of production builds.

**Watching live:**

1. Start the app (`bun run dev` or `bun run dev:prod`).
2. Open `http://localhost:5173/inspector.html` (`:5175` for `dev:prod`) in a window next to the app — not as a route inside the app.
3. Use the app; events appear in real time:
   - **nostr** — every publish (with per-relay ok/failed results), query, subscription, and incoming event
   - **cashu** — every mint operation (quotes, mint, melt, send, receive, restore, proof-state checks) with arguments, result/error, and duration
   - **evolu** — every `insert`/`update`/`upsert` with table and payload, plus a `history.changed` tick when sync applies changes from another device

Toolbar: channel chips and direction/text filters narrow the timeline; click a row for the full JSON payload (copyable); **Pause** freezes the view while still buffering; **Clear** resets the collector; the timeline auto-follows the newest event until you scroll up (**Follow ↓** jumps back). When more than one app tab reports to the same dev server, an **App** selector appears in the filter bar — every tab gets a stable per-tab id, and rows show which app they came from.

**Reading programmatically** (for scripts and agents):

```bash
# poll as JSON; lastSeq in the response is the cursor for the next call
# optional filters: channel=nostr|cashu|evolu, client=<per-tab app id>
curl "http://localhost:5173/__inspector/events?since=0&limit=500&channel=cashu"

# or tail the append-only file (one JSON event per line, reset on dev-server start)
tail -f apps/web-app/.inspector/events-5173.ndjson

# live SSE stream / reset between test scenarios
curl -N "http://localhost:5173/__inspector/stream"
curl -X POST "http://localhost:5173/__inspector/clear"
```

To disable capture in one browser: `localStorage.setItem("linky.inspector_disabled", "1")` and reload. Implementation details are in the "Dev inspector" section of `docs/architecture.md`.

Android shell currently adds:

- encrypted native secret storage for identity data
- native QR scanning in the Capacitor shell
- native Android notification permission + FCM token bridge

Native push delivery now works end-to-end when:

- `apps/native-shell/android/app/google-services.json` is present for the Android shell build
- `apps/push` is configured with `PUSH_FIREBASE_SERVICE_ACCOUNT_JSON`

```bash
bun install
bun run dev
bun run site:dev
bun run push:dev
bun run native:android:add
bun run native:apk:debug
bun run native:apk:release
```

Build:

```bash
bun run build
bun run site:build
```

Android native shell debug APK:

```bash
bun run native:android:add
bun run native:apk:debug
```

Android signed release APK:

```bash
bun run native:apk:release
```

Latest built debug APK ends up at:

```bash
apps/native-shell/android/app/build/outputs/apk/debug/app-debug.apk
```

Public download URL for the latest GitHub Release APK:

```bash
https://github.com/hynek-jina/linky/releases/latest/download/linky.apk
```

Start the push service once:

```bash
bun run push:start
```

### Code quality

Always run the full check pipeline after changes:

```bash
bun run check-code
```

This runs:

1. `typecheck`
2. `eslint --fix`
3. `prettier --write`

Workspace-scoped commands (web app only):

```bash
bun run --filter @linky/web-app typecheck
bun run --filter @linky/web-app eslint
bun run --filter @linky/web-app prettier
```

Workspace-scoped commands (public site only):

```bash
bun run --filter @linky/site dev
bun run --filter @linky/site build
bun run --filter @linky/site preview
```

Workspace-scoped commands (native shell):

```bash
bun run --filter @linky/native-shell android:sync
bun run --filter @linky/native-shell android:open
bun run --filter @linky/native-shell android:apk:debug
```

Push service workspace commands:

```bash
bun run --filter @linky/push typecheck
bun run --filter @linky/push start
```

Push service container artifacts live in `apps/push/`:

- `Dockerfile` builds a production Bun image
- `docker-compose.example.yml` shows a persistent SQLite `/data` volume for prod-style deployment
- `.env.production.example` lists the runtime env vars expected by that compose setup

## License

Linky is released under the Zero-Clause BSD license (`0BSD`). See
[`LICENSE`](./LICENSE).
