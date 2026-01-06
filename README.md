# Linky

> ⚠️ Hobby tool without any guarantees. Use at your own risk.

Linky is a simple mobile-first PWA for managing contacts and sending Lightning payments using Cashu tokens.
It is local-first: your data is stored locally and the app works offline.

## What it does

- Contacts
  - Stores a name, Lightning address (LNURL-pay via lightning address), and optional Nostr `npub`.
  - Optional groups with a bottom group filter.
  - Contact details include edit and delete (delete requires a second click to confirm).
- Wallet
  - Paste Cashu tokens; the app receives/splits them and stores accepted tokens.
  - Shows balance and a list of tokens (copy token / delete token).
- Payments
  - If a contact has a Lightning address and you have balance, you can create an invoice via LNURL-pay and pay it via Cashu melt.
- Settings
  - Language: Czech / English.
  - Unit toggle: switches the displayed unit label between `sat` and `₿`.
  - Advanced
    - Data: export/import contacts and Cashu tokens.
    - Nostr keys: copy your current `nsec`.
    - Log out: requires a second click to confirm.
    - Nostr relays: view/add/remove relays.
    - Mints: shows the current default mint.

## Identity and data

On first run, the app shows onboarding where you either:

- Create a new account (generates a Nostr `nsec`), or
- Paste an existing `nsec`.

The Nostr `nsec` is the primary identity. A 12-word Evolu mnemonic is derived deterministically from it and stored locally.

Logging out removes the stored `nsec` and returns you to onboarding.

## Running the project

Requirements: Node.js + npm.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Tech stack

- Vite + React + TypeScript
- Evolu (local-first database / sync)
- PWA via vite-plugin-pwa
- Cashu: @cashu/cashu-ts
- Nostr: nostr-tools
