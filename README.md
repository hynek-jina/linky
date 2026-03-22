# Linky

> ⚠️ Hobby tool without guarantees. Use at your own risk.

Linky is a mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments.
It is local-first: data is stored in Evolu (SQLite) and syncs between devices.

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

Requirements: Bun

For Android native builds: Java 17

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
bun run push:dev
bun run native:android:add
bun run native:apk:debug
```

Build:

```bash
bun run build
```

Android native shell debug APK:

```bash
bun run native:android:add
bun run native:apk:debug
```

Latest built debug APK ends up at:

```bash
apps/native-shell/android/app/build/outputs/apk/debug/app-debug.apk
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
