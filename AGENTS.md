# Linky

Mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments. Local-first architecture using Evolu for offline storage and cross-device sync.

See @README.md for project overview.

## Commands

```bash
bun install                # Install dependencies
bun run dev                # Start Vite dev server
bun run build              # Production build (tsc -b && vite build)
bun run native:android:add # Generate the Capacitor Android project once
bun run native:apk:debug   # Build the web app, sync Capacitor, assemble debug APK
bun run native:ios:add     # Generate the Capacitor iOS project once
bun run push:dev           # Start the Bun push notification service in watch mode
bun run push:start         # Start the Bun push notification service once
bun run check-code         # Run ALL checks: typecheck → eslint --fix → prettier --write
bun run typecheck          # TypeScript type checking only
bun run eslint             # Lint + autofix all workspaces
bun run prettier           # Format + autofix all workspaces
```

IMPORTANT: Always run `bun run check-code` after making changes. It runs typecheck first, then eslint and prettier which autofix what they can. If typecheck or non-autofixable eslint errors remain, fix them manually and re-run until all checks pass.

Native Android builds require Java 17. `apps/native-shell/scripts/with-java17.sh` prefers an installed macOS JDK 17 automatically before running Capacitor/Gradle commands, and `apps/native-shell/scripts/patch-android-java.sh` rewrites Capacitor-generated Android compile options from Java 21 to Java 17 after add/sync.

## Monorepo Structure

- `apps/web-app/` - Main React app (Vite + SWC)
- `apps/native-shell/` - Capacitor native shell that consumes the built `apps/web-app/dist` bundle for Android/iOS packaging
- `apps/push/` - Bun HTTP push service for Web Push subscription auth/storage and Nostr outer-inbox relay watching
  - ships with `Dockerfile`, `docker-compose.example.yml`, and `.env.production.example` for container deployment with persistent SQLite storage under `/data`
- `packages/core/` - Core package workspace (Effect-based identity domain in `src/identity/` with branded schemas + derivation utils, shared derivation paths in `src/identity/derivationPaths.ts`, and `MasterSecretProvider` SLIP-39 layer constructors, exported via `@linky/core` and `@linky/core/identity`)
- `packages/config/` - Shared ESLint, Prettier, and TypeScript configs
- Package manager is **Bun** (not npm/yarn/pnpm)
- Workspace filter: `bun run --filter @linky/web-app <script>`

## Architecture

- **No framework router** - hash-based routing via `useRouting` hook and `parseRouteFromHash()` in `src/types/route.ts`
- Empty or unknown hashes now default to the wallet route; contacts use `#contacts` and legacy explicit `#` still opens contacts
- Navigation uses `navigateTo()` from `src/hooks/useRouting.ts` - do NOT use `window.location` directly
- **Evolu** for all persistent data - local-first SQLite with sync. Schema in `src/evolu.ts`
- Nostr chat persistence is Evolu-backed (`nostrMessage` + `nostrReaction` tables) and uses deterministic `messages-n` owner lanes for seed logins (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/4'/<index>'`); legacy `linky.local.nostrMessages.v1.<ownerId>` data is imported once per owner via `linky.messages_evolu_migrated_v1:<ownerId>`
- Inbox sync now keeps unknown-sender conversations local-only until the user explicitly adds the sender as a real contact; unknown threads use `unknown:<pubkeyHex>` chat ids, are derived from the message overlay rather than stored as Evolu contacts, and auto-load Nostr kind-0 name/photo metadata while keeping the localized unknown-name prefix in UI
- Inbox sync/chat sync only persist decrypted inner rumor content from `kind: 1059` gift wraps; nested NIP-44 ciphertext is rejected when it decrypts against the sender/tagged peer or the outer wrap pubkey so outer payload blobs are not shown as messages
- Inbox sync/chat sync also reject malformed inner `kind: 14` events that reuse the outer gift-wrap pubkey, preventing random wrapper keys from surfacing as unknown-message ciphertext threads
- Unknown-chat warning panel supports `Add contact` (creates a real contact with the best available Nostr name, while the localized `[Unknown]` / `[Neznámý]` prefix stays UI-only until the contact is saved, migrates existing unknown-thread messages to the new contact id, keeps user in the same chat), `Block` (confirms, adds pubkey to `linky.blocked_nostr_pubkeys.v1`, removes the local unknown thread immediately, and future inbox sync ignores the blocked pubkey), and `Remove chat` (confirms, removes the local unknown thread immediately, but does not block future messages from that pubkey)
- For seed logins, contacts writes are routed through deterministic Evolu `contacts-n` owner lanes (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/2'/<index>'`), with metadata pointer stored in Evolu `ownerMeta` lane (`contacts-<n>`)
- For seed logins, cashu token writes/reads are routed through deterministic Evolu `cashu-n` owner lanes (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/3'/<index>'`)
- AppShell subscribes Evolu sync for active seed lanes (`contacts-n`, `cashu-n`, `messages-n`, and `ownerMeta`) via `useOwner`, so owner pointers/data converge across tabs/devices
- Contacts/cashu owner lanes auto-rotate when owner-local write delta reaches `OWNER_ROTATION_TRIGGER_WRITE_COUNT` (currently 1000), migrate valid contacts + tokens to next lane, and enforce 1-minute per-type cooldown
- Messages owner lane auto-rotates at the same write threshold with pointer-only switch (no message copy), while UI reads active + immediate previous messages owner
- Rotations prune stale lanes locally (`n-2`) for contacts/cashu/messages, keeping one previous lane for short rollback/history
- Contacts are capped at `MAX_CONTACTS_PER_OWNER` (currently 500); add-contact UI is disabled at limit and save is blocked
- Evolu debug views (`#evolu-current-data`, `#evolu-history-data`) scope contacts/history to active owner lanes, with history retaining one previous contacts lane as backup
- Core app remains local-first/client-side; optional background notifications are handled by the separate `apps/push` Bun service
- Native packaging uses a separate Capacitor shell in `apps/native-shell/` so Android/iOS project files stay isolated from the web app source tree
- Native shells now load bundled `apps/web-app/dist` assets by default; Capacitor live reload must be enabled explicitly via `LINKY_CAP_SERVER_URL` / `CAP_SERVER_URL` before `cap sync` / `cap open`, preventing packaged APKs from pointing at `127.0.0.1`
- Browser-only identity persistence is being moved behind platform adapters in `apps/web-app/src/platform/`; the Android shell now provides a real encrypted secret-storage bridge plus native QR scan, deep-link, and notification-permission bridges via `apps/web-app/src/platform/nativeBridge.ts`, while native push registration now uses Capacitor Push Notifications + FCM token registration against `apps/push`
- Android native push delivery now uses data-only FCM payloads plus `apps/native-shell/android/app/src/main/java/fit/linky/app/LinkyFirebaseMessagingService.java`, which renders closed-app notifications locally and forwards payload extras back into `MainActivity` on tap; `google-services.json` is still required in `apps/native-shell/android/app/`
- Android shell now also exposes live system-bar inset values through `LinkyNativeWindowInsets`, and the web app consumes them via CSS vars (`--safe-area-top`, `--safe-area-bottom`) so the fixed top bar and bottom overlays clear Android status/navigation bars
- Onboarding/login uses a single 20-word **SLIP-39** share; Nostr keys are always derived from that seed at path `m/44'/1237'/0'/0/0` (manual Nostr key overrides are disabled)
- New account creation now pauses before first login on an unauthenticated profile-picker step: it derives 8 deterministic DiceBear avatar options from the freshly generated `npub`, preselects the first one in a large preview, lets the user edit the suggested name immediately, supports uploading a custom square-cropped photo as a 9th option, and only publishes kind-0 name/picture metadata on confirm (the automatic lightning-address registration path is intentionally deferred until after this step)
- Cashu deterministic wallet seed is derived from the SLIP-39 secret using **BIP-85** at path `m/83696968'/39'/0'/24'/0'` (24-word mnemonic)
- Web app seed/identity helpers in `src/utils/slip39Nostr.ts` are app-level adapters that delegate SLIP-39/BIP-85 derivation to `@linky/core/identity`
- `apps/web-app/src/App.tsx` is a thin wrapper that default-exports `app/AppShell`
- App shell structure lives under `apps/web-app/src/app/`:
  - `AppShell.tsx` is a thin renderer/auth gate that wires `AppShellContextsProvider` and route content
  - `useAppShellComposition.tsx` owns AppShell orchestration, hook composition, and route-prop bundle assembly
  - `AppShellBoundaryMap.md` defines AppShell ownership boundaries and behavior invariants for split work
  - `context/ContextSplitContract.md` defines target context lanes, typed read hooks, and composition-to-context ownership mapping for the split plan
  - `context/AppShellContexts.tsx` is the single authenticated shell context transport; it provides shell/route contexts and typed consumer hooks (`useAppShellCore`, `useAppShellActions`, `useAppShellRouteContext`)
  - `hooks/` contains app domain hooks (`useRelayDomain`, `useMintDomain`, `useContactsDomain`, `useMessagesDomain`, `usePaymentsDomain`, `useCashuDomain`, `useProfileAuthDomain`, `useGuideScannerDomain`) plus app-shell extraction hooks (`useAppDataTransfer`, `useContactsNostrPrefetchEffects`, `useMainSwipePageEffects`, `useProfileNpubCashEffects`, `useScannedTextHandler`, `useFeedbackContact`, `useOwnerScopedStorage`, `usePaidOverlayState`, `useRouteDerivedShellState`)
  - `hooks/useEvoluContactsOwnerRotation.ts` owns deterministic contacts/messages owner derivation, manual contacts rotation (copy-forward), manual messages rotation (pointer-only), and owner pointer persistence
  - `hooks/composition/` contains sub-composition slices for shell orchestration concerns (`useProfileAuthComposition`, `useProfilePeopleComposition`, `usePaymentMoneyComposition`, `useRoutingViewComposition`, `useSystemSettingsComposition`)
  - `hooks/contacts/` contains contact-editor and contact-list view helpers (`useContactEditor`, `useVisibleContacts`)
  - `hooks/layout/` contains extracted shell layout/menu/swipe state helpers (`useMainMenuState`, `useMainSwipeNavigation`)
  - `hooks/profile/` contains extracted profile editor and profile metadata sync flows (`useProfileEditor`, `useProfileMetadataSyncEffect`)
  - `hooks/messages/` contains extracted message/inbox effects (`useNostrPendingFlush`, `useSendChatMessage`, `useEditChatMessage`, `useSendReaction`, `useInboxNotificationsSync`, `useChatMessageEffects`)
  - `hooks/messages/chatNostrProtocol.ts` contains shared reply/edit/reaction Nostr parsing helpers used by sync/send flows
  - `hooks/payments/` contains extracted payment orchestration (`usePayContactWithCashuMessage`)
  - Lightning pay scan supports lightning addresses plus LNURL-pay bech32 / `lnurlp://` / HTTPS targets; unknown recipients open the same amount-entry UI as contact pay, but without avatar/name until matched to a saved contact
  - `hooks/cashu/` contains extracted cashu helpers (`useSaveCashuFromText`, `useCashuTokenChecks`, `useRestoreMissingTokens`, `useNpubCashClaim`)
  - `hooks/topup/` contains extracted topup quote/reset effects (`useTopupInvoiceQuoteEffects`)
  - `hooks/mint/` contains mint-info store/helpers (`useMintInfoStore`, `mintInfoHelpers`)
  - `routes/AppRouteContent.tsx` handles route-kind page rendering
  - `routes/MainSwipeContent.tsx` handles contacts/wallet swipe UI
- `routes/useSystemRouteProps.ts` builds shared system/settings route prop groups
- `routes/props/` contains grouped route-prop builders (`buildPeopleRouteProps`, `buildMoneyRouteProps`, `buildMainSwipeRouteProps`)
- `lib/` contains shared app helpers (Nostr pool, token text parsing, topbar config)
- `types/appTypes.ts` contains app-local shared types
- `apps/push/src/` is split by concern: `http.ts` (Bun API, including `/native/subscribe` + `/native/unsubscribe` for Android FCM tokens), `ownership.ts` (signed challenge verification), `storage.ts` (SQLite persistence for web subscriptions, native tokens, pubkeys, challenges, seen outer event ids), `relayWatcher.ts` (relay subscription for outer `kind: 1059` events with catch-up vs live delivery gating), and `push.ts` (Web Push + Firebase Admin delivery with invalid subscription/token cleanup)
- Push service proof events use `kind: 27235` with short-lived per-pubkey challenge nonces; `/subscribe` and `/unsubscribe` both require valid proofs per affected pubkey, full unsubscribe only happens when the last proven pubkey is removed, the server never decrypts NIP-17 payloads, and it only emits generic notifications for outer `kind: 1059` events tagged `["linky","push"]`, so sender self-copies / reactions / edits can sync over relays without triggering push

## Code Conventions

- TypeScript strict mode with `exactOptionalPropertyTypes`
- **NEVER use `as` or `any` to cast types** - validate with a runtime type guard instead of casting
- Branded ID types from Evolu (`ContactId`, `CashuTokenId`, `MintId`, etc.) - don't use plain strings
- Components use `interface` for props, not `type`
- LocalStorage keys use `linky.` prefix (e.g., `linky.nostr_nsec`, `linky.lang`)
- Use types from libraries (e.g., Evolu, Cashu, Nostr) instead of redefining them - look up the library's exported types first
- Prefer sparse Evolu mutation payloads: omit optional fields when empty instead of writing explicit `null` (especially `cashuToken` optional columns like `rawToken`, `mint`, `unit`, `amount`, `error`)
- Owner rotation and contact limits use shared constants in `src/utils/constants.ts` (`OWNER_ROTATION_TRIGGER_WRITE_COUNT`, `OWNER_ROTATION_COOLDOWN_MS`, `MAX_CONTACTS_PER_OWNER`)
- Plain CSS in `App.css` - no CSS-in-JS or utility framework

## Testing

- **Playwright** E2E tests in `apps/web-app/tests/`
- **Vitest** unit tests (jsdom environment, Worker polyfill in `vitest.setup.ts`)
- Dev server for E2E: `http://127.0.0.1:5174`

## Gotchas

- Evolu requires a Worker polyfill in test environments
- In this workspace/Bun setup, `bunx --cwd apps/web-app playwright test tests` can resolve incorrectly; run `cd apps/web-app && bunx playwright test tests` instead
- SQLite WASM files served from `public/sqlite-wasm/` with `cache-control: no-store` in dev
- On web, the `nsec` private key is still mirrored under `linky.nostr_nsec`; native shells are expected to provide secure secret storage via the platform bridge and secrets must never be logged or exposed
- Android native shells currently back identity secrets with `EncryptedSharedPreferences`, use ZXing-based native QR scanning instead of `getUserMedia` when available, expose Android notification permission to the web app, and register Android FCM push tokens through Capacitor Push Notifications; native builds need `apps/native-shell/android/app/google-services.json`, and the push server needs `PUSH_FIREBASE_SERVICE_ACCOUNT_JSON` for delivery
- Android native shells also register `nostr://` and `cashu://` custom URI schemes and forward incoming URLs through `LinkyNativeDeepLinks`; the current handler accepts contact `npub` links plus Cashu token links, reuses the scanned-text add/import flows, opens the saved contact detail, and imports tokens into the wallet
- Android native shells also accept NFC NDEF tags for the same flows: `ACTION_NDEF_DISCOVERED` URI records with `nostr://` / `cashu://` and `text/plain` NDEF records whose payload starts with those schemes are normalized in `MainActivity` and forwarded through the same deep-link bridge
- Android native shells also expose NFC writing through `LinkyNativeNfc`; token detail writes `cashu://cashu...` and profile writes `nostr://npub...` as NDEF URI records, with web-app UI hidden when the native bridge is unavailable
- Cashu tokens written to NFC remain listed as greyed `externalized` rows, are excluded from available balance and outgoing payments, and token check re-accepts them into a fresh spendable token; token detail also offers Share for the same `cashu://cashu...` deeplink used by NFC writes
- Native scan/notification injected bridge methods must be invoked as bridge methods (`bridge.method()`), not detached function references, otherwise Android WebView rejects them as non-injected calls
- Vite proxies: `/api/mint-quote` for Cashu mint quotes and `/api/lnurlp` for LNURL-pay (CORS workarounds); production mirrors the mint-quote proxy in `apps/web-app/api/mint-quote.ts`
- Cashu topup invoice creation uses the `/api/mint-quote` proxy on web, but on native platforms it calls the mint `/v1/mint/quote/bolt11` endpoint directly so bundled APKs do not resolve the relative proxy path to the local app shell HTML
- PWA service worker is built from `apps/web-app/src/sw.ts` via Vite PWA `injectManifest`; changes there affect both prod and dev SW behavior
- Dev mode now keeps the registered PWA service worker alive for push testing; use `#advanced/push-debug` to inspect persistent client/SW push logs and manually reset service workers/caches when needed
- Push registration now validates the live `PushSubscription.options.applicationServerKey` against the current server VAPID public key and forces a re-subscribe on mismatch; open clients also re-register when the service worker emits `pushsubscriptionchange`
- Push registration persists a stable browser `installationId` plus the last server-registered endpoint in localStorage; subscribe calls also request cleanup of legacy subscriptions without an installation id for the same pubkey, the push server replaces stale endpoints for the same installation, and the client best-effort unregisters the previous endpoint with a signed unsubscribe proof when the browser rotates/replaces the current subscription, preventing duplicate generic notifications from old endpoints
- Cashu payments now publish actual token chat messages to the recipient without the outer push marker and emit one separate notify-only wrapped event per payment (`kind: 24133`, `["linky","payment_notice"]`) as the sole push trigger; receiver inbox sync never stores that notice in chat history, but the service worker and open-app notification paths render it as `You received money` / `Přijali jste peníze`
- The PWA service worker mirrors the active `nsec` into IndexedDB on app startup/login, clears it on logout, and for closed-app push delivery it fetches the outer `kind: 1059` event from relays, decrypts it locally in the service worker, uses `You received money` / `Přijali jste peníze` copy for Cashu token messages and notify-only payment notice events, and still shows a generic fallback notification when decrypt/validation fails; any open Linky window client still suppresses the service-worker notification in favor of in-app notification logic, while inbox sync keeps actual Cashu token chat messages silent in notification surfaces and uses the notify-only payment event for the user-visible payment alert
- Chat retention is enforced in `useMessagesDomain` (latest 500 messages/contact, 3000 global; reactions capped to 5000 and orphaned reactions are pruned)
- Wallet top-up receive quotes are cached in owner-scoped localStorage until claimed/expired, including the original invoice text, so Android/native resumes reuse the same quote instead of minting against a newly generated one; top-up mint claim must also treat Cashu `ISSUED` as claim-relevant and run `mintProofs` under the deterministic counter lock/retry flow used by other Cashu operations, otherwise paid invoices can fail silently with duplicate-output signing errors
- Push service env is documented in `apps/push/.env.example`; `PUSH_VAPID_SUBJECT`, `PUSH_VAPID_PUBLIC_KEY`, and `PUSH_VAPID_PRIVATE_KEY` must be set before `apps/push` starts
- `apps/push` CORS allowlist is configured via `PUSH_CORS_ORIGIN`; it accepts `*` or a comma-separated list of allowed web app origins
- `apps/push` relay watcher defaults now match the web app chat publish relays (`wss://relay.damus.io`, `wss://nos.lol`, `wss://relay.0xchat.com`) unless overridden via `PUSH_DEFAULT_RELAYS`
- `apps/push` relay watcher uses a 3-day catch-up `since` window to accommodate NIP-59 randomized outer `created_at`, persists seen outer event ids in SQLite, keeps a size-bounded in-memory seen-id cache for O(1) hot-path dedupe checks, suppresses notification delivery until EOSE switches the watcher into live mode, periodically refreshes the subscription to reset reconnect `since` drift, and prunes both cache-expired ids and old SQLite seen-event rows on the server cleanup interval
- Container publishing is handled by `.github/workflows/push-image.yml`, which builds `apps/push/Dockerfile` and publishes the image to GHCR

## Maintaining This File

IMPORTANT: Keep this file up to date. When you make changes that affect architecture, commands, conventions, or key files, update the relevant section here in the same commit. This file should reflect the current state of the project. Keep it brief.
