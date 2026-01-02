# Linky

| ⚠️ This is hobby tool without any guarantee. Use it with caution!

Linky is a simple PWA for managing Lightning (LN address) and Nostr (npub) contacts.
It is local-first: your data is stored locally and the app works offline.

## What it does

- Stores contacts with a name, a Lightning address, and an npub.
  No field is required, but at least one field must be filled in to save a contact.
- Clicking the Lightning address or the “npub” badge copies the value to the clipboard.
- Contacts can be edited and deleted (delete requires a second click to confirm).
- Settings:
  - Keys: copy the current seed and paste a seed from the clipboard.
  - Language: switch between Czech and English.

## Keys (seed) and data

The app uses a seed (mnemonic) as the identity of the data owner.

- “Copy current” copies the current seed to the clipboard.
- “Paste” reads a seed from the clipboard and switches the app to a different owner.
  This effectively wipes/replaces the current local dataset in the app (that’s why paste requires a second click to confirm).

## Running the project

Requirements: Node.js + npm.

```bash
npm install
npm run dev
```

## Tech stack

- Vite + React + TypeScript
- Evolu (local-first database / sync)
- PWA via vite-plugin-pwa
