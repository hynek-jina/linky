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

Requirements: Node.js and pnpm; Bun (runtime for the push service); Docker for the local dev service stack

For Android native builds: Java 17

### Local dev vs prod services

- `pnpm run dev` — full local environment: starts `docker-compose.dev.yml` (local Nostr relay :7777, Evolu sync relay :4001, Cashu Nutshell **FakeWallet** mint :3338 that auto-settles invoices with fake sats), then runs the web app (:5173) and push service (:8787) against it via the committed `.env.development` files. npub.cash flows are disabled locally (#219); the mint has no real Lightning backend (#220).
- `pnpm run dev:prod` — web app only, on :5175, against production services. The separate port keeps browser storage isolated from local-dev sessions.
- `pnpm run dev:services` — just the docker stack, attached.

Android shell currently adds:

- encrypted native secret storage for identity data
- native QR scanning in the Capacitor shell
- native Android notification permission + FCM token bridge

Native push delivery now works end-to-end when:

- `apps/native-shell/android/app/google-services.json` is present for the Android shell build
- `apps/push` is configured with `PUSH_FIREBASE_SERVICE_ACCOUNT_JSON`

```bash
pnpm install
pnpm run dev
pnpm run site:dev
pnpm run push:dev
pnpm run native:android:add
pnpm run native:apk:debug
pnpm run native:apk:release
```

Build:

```bash
pnpm run build
pnpm run site:build
```

Android native shell debug APK:

```bash
pnpm run native:android:add
pnpm run native:apk:debug
```

Android signed release APK:

```bash
pnpm run native:apk:release
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
pnpm run push:start
```

### Tests

Unit tests (Vitest) across all workspaces:

```bash
pnpm run test
```

End-to-end tests (Playwright) live in `apps/web-app/tests/*.spec.ts` and are split into two
projects. `prod-services` is the original suite and runs against production relays and mints:

```bash
cd apps/web-app && pnpm exec playwright test --project=prod-services
```

`local-stack` runs the proxy-payment flow — three accounts on one machine, talking over the local
Nostr relay and paying each other with the local Cashu mint. It needs the docker stack up first,
because the app is served from it as a production build on :5176:

```bash
docker compose -f docker-compose.dev.yml --profile e2e up -d --build --wait
cd apps/web-app && pnpm exec playwright test --project=local-stack
```

Re-run the `up --build` after changing app source; the endpoints are baked into the image.

To watch or debug a run:

```bash
pnpm exec playwright test --project=local-stack --ui                 # step through it
pnpm exec playwright test --project=local-stack --headed             # three live browsers
pnpm exec playwright show-trace test-results/*local-stack/trace.zip  # after the fact
```

Every run records a trace containing all three accounts, and the console output of each app is
printed prefixed with its account label (`[A]`, `[B]`, `[C]`). The run takes ~20s, so `--ui` and the
trace viewer are far more useful than watching it live.

In CI, `local-stack` gates every release: it runs on each push to main (Vercel Deployment Checks
holds the production promotion until it passes) and as a required job in both Android release
workflows.

### Code quality

Always run the full check pipeline after changes:

```bash
pnpm run check-code
```

This runs:

1. `typecheck`
2. `eslint --fix`
3. `prettier --write`

Workspace-scoped commands (web app only):

```bash
pnpm run --filter @linky/web-app typecheck
pnpm run --filter @linky/web-app eslint
pnpm run --filter @linky/web-app prettier
```

Workspace-scoped commands (public site only):

```bash
pnpm run --filter @linky/site dev
pnpm run --filter @linky/site build
pnpm run --filter @linky/site preview
```

Workspace-scoped commands (native shell):

```bash
pnpm run --filter @linky/native-shell android:sync
pnpm run --filter @linky/native-shell android:open
pnpm run --filter @linky/native-shell android:apk:debug
```

Push service workspace commands:

```bash
pnpm --filter @linky/push typecheck
pnpm --filter @linky/push start
```

Push service container artifacts live in `apps/push/`:

- `Dockerfile` builds a production Bun image
- `docker-compose.example.yml` shows a persistent SQLite `/data` volume for prod-style deployment
- `.env.production.example` lists the runtime env vars expected by that compose setup

## License

Linky is released under the Zero-Clause BSD license (`0BSD`). See
[`LICENSE`](./LICENSE).
