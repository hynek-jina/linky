# Linky

> ⚠️ Hobby tool without guarantees. Use at your own risk.

Linky is a mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments.
It is local-first: data is stored in Evolu (SQLite) and syncs between devices.

## Protocols and stack

- Nostr (chat, profile, auth-related flows)
- Evolu (local-first DB + sync)
- Cashu + mints (Lightning wallet flow)
- npub.cash (LN address + mint preference sync)
- Credo promises (see [docs/credo.md](docs/credo.md))

## Authentication model

- Login supports either:
  - `nsec`, or
  - one 20-word **SLIP-39** share
- With SLIP-39 login:
  - Nostr keypair is derived at `m/44'/1237'/0'/0/0`
  - deterministic Evolu owner lanes are derived for:
    - contacts (`contacts-n`)
    - cashu/credo (`cashu-n`)
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
  - contact payment via Cashu/Credo message flow
- Debug pages for Evolu current/history data and owner/rotation diagnostics

## Development

Requirements: Bun

```bash
bun install
bun run dev
```

Build:

```bash
bun run build
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
