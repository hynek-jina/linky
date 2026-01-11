import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "./mnemonic";

const isEvoluLoggingEnabled = (): boolean => {
  if (!import.meta.env.DEV) return false;

  // Enable only when explicitly requested, because SQL logging is very noisy.
  // Toggle in devtools: localStorage.setItem('linky_debug_evolu_sql', '1')
  try {
    return localStorage.getItem("linky_debug_evolu_sql") === "1";
  } catch {
    return false;
  }
};

export const EVOLU_SERVER_URLS: ReadonlyArray<string> = [
  "wss://free.evoluhq.com",
];

export const EVOLU_TRANSPORTS: ReadonlyArray<{
  type: "WebSocket";
  url: string;
}> = EVOLU_SERVER_URLS.map((url) => ({ type: "WebSocket", url }));

// Primary key pro Contact tabulku
const ContactId = Evolu.id("Contact");
export type ContactId = typeof ContactId.Type;

// Primary key pro CashuToken tabulku
const CashuTokenId = Evolu.id("CashuToken");
export type CashuTokenId = typeof CashuTokenId.Type;

// Primary key pro NostrIdentity tabulku
const NostrIdentityId = Evolu.id("NostrIdentity");
export type NostrIdentityId = typeof NostrIdentityId.Type;

// Primary key pro NostrMessage tabulku
const NostrMessageId = Evolu.id("NostrMessage");
export type NostrMessageId = typeof NostrMessageId.Type;

// Primary key pro PaymentEvent tabulku
const PaymentEventId = Evolu.id("PaymentEvent");
export type PaymentEventId = typeof PaymentEventId.Type;

// Primary key pro AppState tabulku (snapshoty nastavení/progresu)
const AppStateId = Evolu.id("AppState");
export type AppStateId = typeof AppStateId.Type;

// Primary key pro MintInfo tabulku (metadata o mintech)
const MintId = Evolu.id("Mint");
export type MintId = typeof MintId.Type;

// Schema pro Linky app
export const Schema = {
  contact: {
    id: ContactId,
    name: Evolu.nullOr(Evolu.NonEmptyString1000),
    npub: Evolu.nullOr(Evolu.NonEmptyString1000),
    lnAddress: Evolu.nullOr(Evolu.NonEmptyString1000),
    groupName: Evolu.nullOr(Evolu.NonEmptyString1000),
  },
  nostrIdentity: {
    id: NostrIdentityId,
    // Bech32 NIP-19 secret key, must start with "nsec".
    nsec: Evolu.NonEmptyString1000,
  },
  nostrMessage: {
    id: NostrMessageId,
    contactId: ContactId,
    // "in" | "out"
    direction: Evolu.NonEmptyString100,
    // Decrypted plaintext message.
    content: Evolu.NonEmptyString,
    // Gift-wrapped event id (kind 1059) used for de-duplication.
    wrapId: Evolu.NonEmptyString1000,
    // Inner (rumor) event id (kind 14, unsigned) if available.
    rumorId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // Sender pubkey hex (64 chars) of the inner message.
    pubkey: Evolu.NonEmptyString1000,
    // created_at (seconds) from the inner event when available.
    createdAtSec: Evolu.PositiveInt,
  },
  cashuToken: {
    id: CashuTokenId,
    // Most recent (accepted) token.
    token: Evolu.NonEmptyString,
    // Original pasted token (useful for debugging/re-accept).
    rawToken: Evolu.nullOr(Evolu.NonEmptyString),
    // Stored only if token references exactly one mint.
    mint: Evolu.nullOr(Evolu.NonEmptyString1000),
    unit: Evolu.nullOr(Evolu.NonEmptyString100),
    // Stored total amount (usually in sats) when known.
    amount: Evolu.nullOr(Evolu.PositiveInt),
    // "pending" | "accepted" | "error"
    state: Evolu.nullOr(Evolu.NonEmptyString100),
    error: Evolu.nullOr(Evolu.NonEmptyString1000),
  },

  paymentEvent: {
    id: PaymentEventId,
    // Seconds since epoch.
    createdAtSec: Evolu.PositiveInt,
    // "in" | "out"
    direction: Evolu.NonEmptyString100,
    // Amount in sats (or unit's base), when known.
    amount: Evolu.nullOr(Evolu.PositiveInt),
    // Fee reserve / fee paid, when known.
    fee: Evolu.nullOr(Evolu.PositiveInt),
    // Mint URL when known.
    mint: Evolu.nullOr(Evolu.NonEmptyString1000),
    unit: Evolu.nullOr(Evolu.NonEmptyString100),
    // "ok" | "error"
    status: Evolu.NonEmptyString100,
    error: Evolu.nullOr(Evolu.NonEmptyString1000),
    // Optional: link to a contact (e.g., pay-to-contact).
    contactId: Evolu.nullOr(ContactId),
  },

  appState: {
    id: AppStateId,
    // "1" when dismissed.
    contactsOnboardingDismissed: Evolu.nullOr(Evolu.NonEmptyString100),
    // "1" when the user has successfully paid at least once.
    contactsOnboardingHasPaid: Evolu.nullOr(Evolu.NonEmptyString100),
    // Active guide task key (e.g., "add_contact" | "topup" | "pay" | "message").
    contactsGuideTask: Evolu.nullOr(Evolu.NonEmptyString100),
    // Persisted as (stepIndex + 1) so it fits PositiveInt.
    contactsGuideStepPlusOne: Evolu.nullOr(Evolu.PositiveInt),
    // Optional: which contact the guide is bound to.
    contactsGuideTargetContactId: Evolu.nullOr(ContactId),
  },

  mintInfo: {
    // We use mint URL as a stable id (so one row per mint).
    id: MintId,
    url: Evolu.NonEmptyString1000,
    firstSeenAtSec: Evolu.PositiveInt,
    lastSeenAtSec: Evolu.PositiveInt,
    // "1" when mint claims MPP support (NUT-15). Null/"0" means unknown/false.
    supportsMpp: Evolu.nullOr(Evolu.NonEmptyString100),
    // JSON blobs (best-effort, may be truncated).
    feesJson: Evolu.nullOr(Evolu.NonEmptyString1000),
    infoJson: Evolu.nullOr(Evolu.NonEmptyString1000),
    lastCheckedAtSec: Evolu.nullOr(Evolu.PositiveInt),
  },
};

// Vytvoř Evolu instanci
const getInitialMnemonicFromStorage = (): Evolu.Mnemonic | undefined => {
  // During SSR/tests, localStorage may not exist.
  if (typeof localStorage === "undefined") return undefined;

  try {
    const stored = localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY);
    if (stored) {
      const validated = Evolu.Mnemonic.fromUnknown(stored);
      if (validated.ok) return validated.value;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const initialMnemonic = getInitialMnemonicFromStorage();
const externalAppOwner = initialMnemonic
  ? // Evolu's runtime supports 12-word mnemonics; the types are stricter than runtime.
    (Evolu.createAppOwner(
      Evolu.mnemonicToOwnerSecret(
        initialMnemonic as unknown as Evolu.Mnemonic
      ) as unknown as Evolu.OwnerSecret
    ) as Evolu.AppOwner)
  : null;

export const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("linky"),
  // Použijeme default free sync server
  transports: EVOLU_TRANSPORTS,
  enableLogging: isEvoluLoggingEnabled(),
  ...(externalAppOwner ? { externalAppOwner } : {}),
});

// Export EvoluProvider pro použití v main.tsx
export { EvoluProvider };

// Vytvoř typovaný React Hook
export const useEvolu = createUseEvolu(evolu);
