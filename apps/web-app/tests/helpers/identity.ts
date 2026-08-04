import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { Page } from "@playwright/test";
import { generateSecretKey, nip19 } from "nostr-tools";
import {
  createSlip39Seed,
  deriveCashuBip85MnemonicFromSlip39,
  deriveEvoluOwnerMnemonicFromSlip39,
  deriveNostrKeysFromSlip39,
} from "../../src/utils/slip39Nostr";

export interface SeedIdentity {
  cashuMnemonic: string;
  evoluMnemonic: string;
  npub: string;
  nsec: string;
  share: string;
}

/**
 * Derive a complete, self-consistent seed-login identity.
 *
 * All four secrets must come from the SAME share and match what production
 * writes, for two independent reasons:
 *
 *  1. `isSeedLogin` is driven by `linky.nostr_slip39_seed`
 *     (useProfileAuthDomain.ts:204-222). Without it every Evolu owner lane
 *     collapses to a single `appOwnerId` and `metaOwnerId` becomes null
 *     (useEvoluContactsOwnerRotation.ts:2053-2132) — a storage architecture no
 *     real user has, in which the cross-lane cashu soft-delete bug is
 *     unreachable by construction.
 *  2. If the stored nsec does not equal the one derived from the share, the
 *     mismatch effect at useProfileAuthDomain.ts:545-585 calls
 *     setIdentityFromNsecAndReload(), which reloads the page and destroys the
 *     test's in-memory state.
 *
 * `linky.initialMnemonic` is the "meta" owner lane mnemonic because that is
 * exactly what onboarding does (useProfileAuthDomain.ts:324-341 ->
 * persistIdentitySecrets -> identitySecrets.ts:108), giving
 * `appOwnerId === metaOwnerId`.
 */
export const createSeedIdentity = async (): Promise<SeedIdentity> => {
  const share = await createSlip39Seed();
  if (!share) throw new Error("createSlip39Seed() returned null");

  const [keys, evoluMnemonic, cashuMnemonic] = await Promise.all([
    deriveNostrKeysFromSlip39(share),
    deriveEvoluOwnerMnemonicFromSlip39(share, "meta", 0),
    deriveCashuBip85MnemonicFromSlip39(share),
  ]);

  if (!keys) throw new Error("deriveNostrKeysFromSlip39() returned null");
  if (!evoluMnemonic) {
    throw new Error("deriveEvoluOwnerMnemonicFromSlip39() returned null");
  }
  if (!cashuMnemonic) {
    throw new Error("deriveCashuBip85MnemonicFromSlip39() returned null");
  }

  return {
    cashuMnemonic,
    evoluMnemonic,
    npub: keys.npub,
    nsec: keys.nsec,
    share,
  };
};

/** Seed a full seed-login identity before the app boots. */
export const setSeedLoginStorage = async (
  page: Page,
  identity: SeedIdentity,
): Promise<void> => {
  await page.addInitScript(
    ([share, nsec, evoluMnemonic, cashuMnemonic]) => {
      try {
        localStorage.setItem("linky.nostr_slip39_seed", share);
        localStorage.setItem("linky.nostr_nsec", nsec);
        localStorage.setItem("linky.initialMnemonic", evoluMnemonic);
        localStorage.setItem("linky.cashu_bip85_mnemonic", cashuMnemonic);
        // linky.nostr_identity_source.v1 is intentionally omitted; it defaults
        // to "derived", which is what a seed login should be.
      } catch {
        // ignore
      }
    },
    [
      identity.share,
      identity.nsec,
      identity.evoluMnemonic,
      identity.cashuMnemonic,
    ] as const,
  );
};

/**
 * Seed a throwaway logged-in identity from a random nsec.
 *
 * Deliberately NOT a seed login: `linky.nostr_slip39_seed` is absent, so
 * `isSeedLogin` stays false and the deterministic Evolu owner lanes are not
 * used. That is fine for tests that only need "an authenticated app", and it
 * keeps them fast. Anything that exercises owner lanes, or the cashu row/lane
 * resolution built on them, must use setSeedLoginStorage instead.
 */
export const setRandomIdentityStorage = async (page: Page): Promise<void> => {
  const nsec = nip19.nsecEncode(generateSecretKey());
  const mnemonic = generateMnemonic(wordlist, 128);

  await page.addInitScript(
    ([nextNsec, nextMnemonic]) => {
      try {
        localStorage.setItem("linky.nostr_nsec", nextNsec);
        localStorage.setItem("linky.initialMnemonic", nextMnemonic);
        localStorage.setItem("linky.pay_with_cashu", "1");
      } catch {
        // ignore
      }
    },
    [nsec, mnemonic] as const,
  );
};
