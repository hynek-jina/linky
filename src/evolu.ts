import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import {
  generate12WordMnemonic,
  INITIAL_MNEMONIC_STORAGE_KEY,
} from "./mnemonic";

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
};

// Vytvoř Evolu instanci
const getOrCreateInitialMnemonic = (): Evolu.Mnemonic | undefined => {
  // During SSR/tests, localStorage may not exist.
  if (typeof localStorage === "undefined") return undefined;

  try {
    const stored = localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY);
    if (stored) {
      const validated = Evolu.Mnemonic.fromUnknown(stored);
      if (validated.ok) return validated.value;
    }

    const mnemonic = generate12WordMnemonic() as unknown as Evolu.Mnemonic;
    localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
    return mnemonic;
  } catch {
    return undefined;
  }
};

const initialMnemonic = getOrCreateInitialMnemonic();
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
  ...(externalAppOwner ? { externalAppOwner } : {}),
});

// Export EvoluProvider pro použití v main.tsx
export { EvoluProvider };

// Vytvoř typovaný React Hook
export const useEvolu = createUseEvolu(evolu);
