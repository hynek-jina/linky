# Linky

Mobile-first PWA for contacts, Nostr messaging, and Lightning/Cashu payments. Local-first architecture using Evolu for offline storage and cross-device sync.

See @README.md for project overview and @docs/credo.md for the Credo protocol spec.

## Commands

```bash
bun install                # Install dependencies
bun run dev                # Start Vite dev server
bun run build              # Production build (tsc -b && vite build)
bun run check-code         # Run ALL checks: typecheck → eslint --fix → prettier --write
bun run typecheck          # TypeScript type checking only
bun run eslint             # Lint + autofix all workspaces
bun run prettier           # Format + autofix all workspaces
```

IMPORTANT: Always run `bun run check-code` after making changes. It runs typecheck first, then eslint and prettier which autofix what they can. If typecheck or non-autofixable eslint errors remain, fix them manually and re-run until all checks pass.

## Monorepo Structure

- `apps/web-app/` - Main React app (Vite + SWC)
- `packages/config/` - Shared ESLint, Prettier, and TypeScript configs
- Package manager is **Bun** (not npm/yarn/pnpm)
- Workspace filter: `bun run --filter @linky/web-app <script>`

## Architecture

- **No framework router** - hash-based routing via `useRouting` hook and `parseRouteFromHash()` in `src/types/route.ts`
- Navigation uses `navigateTo()` from `src/hooks/useRouting.ts` - do NOT use `window.location` directly
- **Evolu** for all persistent data - local-first SQLite with sync. Schema in `src/evolu.ts`
- Nostr chat persistence is Evolu-backed (`nostrMessage` + `nostrReaction` tables) and uses deterministic `messages-n` owner lanes for seed logins (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/4'/<index>'`); legacy `linky.local.nostrMessages.v1.<ownerId>` data is imported once per owner via `linky.messages_evolu_migrated_v1:<ownerId>`
- For seed logins, contacts writes are routed through deterministic Evolu `contacts-n` owner lanes (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/2'/<index>'`), with metadata pointer stored in Evolu `ownerMeta` lane (`contacts-<n>`)
- For seed logins, cashu + credo token writes/reads are routed through deterministic Evolu `cashu-n` owner lanes (derived from SLIP-39/BIP-85 path family `m/83696968'/39'/0'/24'/3'/<index>'`)
- AppShell subscribes Evolu sync for active seed lanes (`contacts-n`, `cashu-n`, `messages-n`, and `ownerMeta`) via `useOwner`, so owner pointers/data converge across tabs/devices
- Manual contacts rotation prunes stale contact lanes locally: after moving to `contacts-n`, contacts from `contacts-(n-2)` are marked deleted (keeping the immediate previous lane available for short rollback/history)
- Manual owner rotation also migrates cashu tokens to `cashu-n` and prunes stale cashu lanes locally (`cashu-(n-2)`), keeping one previous lane available for short rollback/history
- Manual messages owner rotation updates `ownerMeta` pointer (`messages-<n>`) without copying messages into the new lane; UI reads messages/reactions from the active + immediate previous messages owner and prunes older messages lanes locally (`messages-(n-2)`)
- Evolu debug views (`#evolu-current-data`, `#evolu-history-data`) scope contacts/history to active owner lanes, with history retaining one previous contacts lane as backup
- **No backend** - pure client-side PWA with service worker caching
- Onboarding login accepts either `nsec` or a single 20-word **SLIP-39** share; when SLIP-39 is used, Nostr keys are derived at path `m/44'/1237'/0'/0/0`
- When a user manually pastes an `nsec` while a SLIP-39 seed session is present, the pasted key is persisted into Evolu `nostrIdentity` under the seed-derived `meta` owner lane before reload, so the profile switches to the pasted `nsec/npub` pair; choosing Derive in Advanced clears this custom row and switches back to the seed-derived `nsec/npub`
- Cashu deterministic wallet seed is derived from the SLIP-39 secret using **BIP-85** at path `m/83696968'/39'/0'/24'/0'` (24-word mnemonic)
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
  - `hooks/cashu/` contains extracted cashu helpers (`useSaveCashuFromText`, `useCashuTokenChecks`, `useRestoreMissingTokens`, `useNpubCashClaim`)
  - `hooks/topup/` contains extracted topup quote/reset effects (`useTopupInvoiceQuoteEffects`)
  - `hooks/mint/` contains mint-info store/helpers (`useMintInfoStore`, `mintInfoHelpers`)
  - `routes/AppRouteContent.tsx` handles route-kind page rendering
  - `routes/MainSwipeContent.tsx` handles contacts/wallet swipe UI
  - `routes/useSystemRouteProps.ts` builds shared system/settings route prop groups
  - `routes/props/` contains grouped route-prop builders (`buildPeopleRouteProps`, `buildMoneyRouteProps`, `buildMainSwipeRouteProps`)
  - `lib/` contains shared app helpers (Nostr pool, token text parsing, topbar config)
  - `types/appTypes.ts` contains app-local shared types

## Code Conventions

- TypeScript strict mode with `exactOptionalPropertyTypes`
- **NEVER use `as` or `any` to cast types** - validate with a runtime type guard instead of casting
- Branded ID types from Evolu (`ContactId`, `CashuTokenId`, `CredoTokenId`, `MintId`, etc.) - don't use plain strings
- Components use `interface` for props, not `type`
- LocalStorage keys use `linky.` prefix (e.g., `linky.nostr_nsec`, `linky.lang`)
- Use types from libraries (e.g., Evolu, Cashu, Nostr) instead of redefining them - look up the library's exported types first
- Plain CSS in `App.css` - no CSS-in-JS or utility framework

## Testing

- **Playwright** E2E tests in `apps/web-app/tests/`
- **Vitest** unit tests (jsdom environment, Worker polyfill in `vitest.setup.ts`)
- Dev server for E2E: `http://127.0.0.1:5174`

## Gotchas

- Evolu requires a Worker polyfill in test environments
- In this workspace/Bun setup, `bunx --cwd apps/web-app playwright test tests` can resolve incorrectly; run `cd apps/web-app && bunx playwright test tests` instead
- SQLite WASM files served from `public/sqlite-wasm/` with `cache-control: no-store` in dev
- The `nsec` private key is in localStorage (`linky.nostr_nsec`) - never log or expose it
- Vite proxies: `/__mint-quote` for Cashu mint quotes, `/api/lnurlp` for LNURL-pay (CORS workarounds)
- PWA service worker auto-updates - changes to `sw.ts` affect caching behavior
- Chat retention is enforced in `useMessagesDomain` (latest 500 messages/contact, 3000 global; reactions capped to 5000 and orphaned reactions are pruned)

## Maintaining This File

IMPORTANT: Keep this file up to date. When you make changes that affect architecture, commands, conventions, or key files, update the relevant section here in the same commit. This file should reflect the current state of the project. Keep it brief.
