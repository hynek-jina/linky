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

## Release Versioning

Versions use the `yy.mm.xx` scheme: `yy` = release year, `mm` = release month (no leading zero), `xx` = zero-based increment of builds released that month. Example: `26.8.3` is the 4th version released in August 2026. `xx` resets to `0` at the start of each month.

## Local dev environment

- `bun run dev` starts the local service stack (`docker-compose.dev.yml`: Nostr relay :7777, Evolu relay :4001, FakeWallet mint :3338) detached, then the web app (:5173) and push service (:8787) against it; requires Docker
- `bun run dev:prod` runs the web app on :5175 against production services (no local stack needed)
- `bun run dev:services` runs just the docker stack attached (Ctrl-C stops it)
- See the "Local dev environment" section in `docs/architecture.md` for how env overrides and vite modes work

## Gotchas

- Evolu requires a Worker polyfill in test environments (jsdom + polyfill live in `vitest.setup.ts`)
- Vitest excludes `tests/**/*.spec.ts` — those are Playwright E2E suites run separately
- In this workspace/Bun setup, `bunx --cwd apps/web-app playwright test tests` can resolve incorrectly; run `cd apps/web-app && bunx playwright test tests` instead
- SQLite WASM files served from `public/sqlite-wasm/` with `cache-control: no-store` in dev
- Debug APKs install side-by-side as `fit.linky.app.debug`; native push in them requires a `fit.linky.app.debug` client in `google-services.json` (register that package in the Firebase console), otherwise the google-services plugin is skipped for debug-only builds and push is unsupported
- Play upload bundles require release signing via `apps/native-shell/android/keystore.properties` or `LINKY_UPLOAD_STORE_FILE` / `LINKY_UPLOAD_STORE_PASSWORD` / `LINKY_UPLOAD_KEY_ALIAS` / `LINKY_UPLOAD_KEY_PASSWORD`; `bun run native:aab:release` fails fast when those credentials are missing
- Dev mode now keeps the registered PWA service worker alive for push testing; use `#advanced/push-debug` to inspect persistent client/SW push logs and manually reset service workers/caches when needed
- The pinned versions in `docker/evolu-relay/package.json` must stay protocol-compatible with the web app's `@evolu/common` — check upstream `apps/relay/CHANGELOG.md` when bumping Evolu packages
- `apps/push/.env.development` and `apps/web-app/.env.development` are intentionally committed (localhost-only config; the VAPID keypair in there is dev-only, never reuse it in production)

## Maintaining This File

IMPORTANT: Keep this file up to date. When you make changes that affect conventions or operational gotchas, update the relevant section here in the same commit. Architectural decisions belong in `docs/architecture.md`, not here. Also keep `README.md` current when a change affects what it describes (features, auth model, development setup). Keep all of these files brief and current.
