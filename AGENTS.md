# Linky

Mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments. Local-first architecture using Evolu for offline storage and cross-device sync.

See @README.md for project overview.

Package manager is **Bun** (not npm/yarn/pnpm); scripts are defined in the root `package.json`. Workspace filter: `bun run --filter @linky/web-app <script>`.

IMPORTANT: Always run `bun run check-code` after making changes. It runs typecheck first, then eslint and prettier which autofix what they can. If typecheck or non-autofixable eslint errors remain, fix them manually and re-run until all checks pass.

Native Android builds require Java 17. `apps/native-shell/scripts/with-java17.sh` prefers an installed macOS JDK 17 automatically before running Capacitor/Gradle commands, and `apps/native-shell/scripts/patch-android-java.sh` rewrites Capacitor-generated Android compile options from Java 21 to Java 17 after add/sync.

## Architecture

Architectural decisions and behavioral constraints are documented in `docs/architecture.md`. Read the relevant sections there before changing app structure, data flow, persistence, or protocols.

IMPORTANT: When you make or change an architectural decision, document it in `docs/architecture.md` in the same commit — not in this file. This file only holds commands, conventions, testing, and operational gotchas.

## Code Conventions

- TypeScript strict mode with `exactOptionalPropertyTypes`
- **NEVER use `as` or `any` to cast types** - validate with a runtime type guard instead of casting
- Branded ID types from Evolu (`ContactId`, `CashuTokenId`, `MintId`, etc.) - don't use plain strings
- Components use `interface` for props, not `type`
- LocalStorage keys use `linky.` prefix (e.g., `linky.nostr_nsec`, `linky.lang`)
- Use types from libraries (e.g., Evolu, Cashu, Nostr) instead of redefining them - look up the library's exported types first
- Prefer sparse Evolu mutation payloads: omit optional fields when empty instead of writing explicit `null` (especially `cashuToken` optional columns like `rawToken`, `mint`, `unit`, `amount`, `error`)
- Plain CSS in `App.css` - no CSS-in-JS or utility framework

## Gotchas

- Evolu requires a Worker polyfill in test environments (jsdom + polyfill live in `vitest.setup.ts`)
- Vitest excludes `tests/**/*.spec.ts` — those are Playwright E2E suites run separately
- In this workspace/Bun setup, `bunx --cwd apps/web-app playwright test tests` can resolve incorrectly; run `cd apps/web-app && bunx playwright test tests` instead
- SQLite WASM files served from `public/sqlite-wasm/` with `cache-control: no-store` in dev
- Play upload bundles require release signing via `apps/native-shell/android/keystore.properties` or `LINKY_UPLOAD_STORE_FILE` / `LINKY_UPLOAD_STORE_PASSWORD` / `LINKY_UPLOAD_KEY_ALIAS` / `LINKY_UPLOAD_KEY_PASSWORD`; `bun run native:aab:release` fails fast when those credentials are missing
- Dev mode now keeps the registered PWA service worker alive for push testing; use `#advanced/push-debug` to inspect persistent client/SW push logs and manually reset service workers/caches when needed

## Maintaining This File

IMPORTANT: Keep this file up to date. When you make changes that affect conventions or operational gotchas, update the relevant section here in the same commit. Architectural decisions belong in `docs/architecture.md`, not here. Also keep `README.md` current when a change affects what it describes (features, auth model, development setup). Keep all of these files brief and current.
