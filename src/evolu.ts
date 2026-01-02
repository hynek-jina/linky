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

// Schema pro Linky app
export const Schema = {
  contact: {
    id: ContactId,
    name: Evolu.nullOr(Evolu.NonEmptyString1000),
    npub: Evolu.nullOr(Evolu.NonEmptyString1000),
    lnAddress: Evolu.nullOr(Evolu.NonEmptyString1000),
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
