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
    - Keys (seed): copy the current mnemonic and paste another mnemonic from the clipboard.
    - Nostr keys: derive keys from seed, copy/paste keys.
    - Nostr relays: view/add/remove relays.
    - Mints: shows the current default mint.

## Keys (seed) and data

The app uses a BIP39 mnemonic (12 words) as the identity of the data owner.

- “Copy current” copies the current seed to the clipboard (Settings → Advanced → Keys).
- “Paste” reads a seed from the clipboard and switches the app to a different owner.
  This effectively wipes/replaces the current local dataset in the app (that’s why paste requires a second click to confirm).

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
