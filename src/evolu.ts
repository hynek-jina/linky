import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";

// Primary key pro Contact tabulku
const ContactId = Evolu.id("Contact");
export type ContactId = typeof ContactId.Type;

// Schema pro Linky app
export const Schema = {
  contact: {
    id: ContactId,
    name: Evolu.NonEmptyString1000,
    npub: Evolu.NonEmptyString1000,
    // LN adresy uložíme jako JSON string
    lnAddresses: Evolu.NonEmptyString1000,
    email: Evolu.nullOr(Evolu.String1000),
    phone: Evolu.nullOr(Evolu.String1000),
  },
};

// Vytvoř Evolu instanci
export const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("linky"),
  // Použijeme default free sync server
});

// Export EvoluProvider pro použití v main.tsx
export { EvoluProvider };

// Vytvoř typovaný React Hook
export const useEvolu = createUseEvolu(evolu);
