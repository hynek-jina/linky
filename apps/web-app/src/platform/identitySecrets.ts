import { INITIAL_MNEMONIC_STORAGE_KEY } from "../mnemonic";
import {
  CASHU_BIP85_MNEMONIC_STORAGE_KEY,
  NOSTR_IDENTITY_SOURCE_STORAGE_KEY,
  NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  NOSTR_SLIP39_SEED_STORAGE_KEY,
} from "../utils/constants";
import {
  clearStoredPushNsec,
  setStoredPushNsec,
} from "../utils/pushNsecStorage";
import {
  readStoredSecret,
  removeStoredSecret,
  writeStoredSecret,
} from "./secretStorage";

interface PersistIdentitySecretsParams {
  appMnemonic: string;
  cashuMnemonic: string;
  identitySource: "custom" | "derived";
  nsec: string;
  slip39Seed: string;
  switchedAtSec: number | null;
}

export const readStoredNostrNsec = async (): Promise<string | null> => {
  return readStoredSecret(NOSTR_NSEC_STORAGE_KEY);
};

export const readStoredSlip39Seed = async (): Promise<string | null> => {
  return readStoredSecret(NOSTR_SLIP39_SEED_STORAGE_KEY);
};

export const readStoredCashuMnemonic = async (): Promise<string | null> => {
  return readStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY);
};

export const writeStoredCashuMnemonic = async (
  cashuMnemonic: string,
): Promise<void> => {
  await writeStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY, cashuMnemonic);
};

export const persistIdentitySecrets = async ({
  appMnemonic,
  cashuMnemonic,
  identitySource,
  nsec,
  slip39Seed,
  switchedAtSec,
}: PersistIdentitySecretsParams): Promise<void> => {
  await Promise.all([
    writeStoredSecret(NOSTR_NSEC_STORAGE_KEY, nsec),
    writeStoredSecret(NOSTR_SLIP39_SEED_STORAGE_KEY, slip39Seed),
    writeStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY, cashuMnemonic),
    writeStoredSecret(INITIAL_MNEMONIC_STORAGE_KEY, appMnemonic),
  ]);

  try {
    localStorage.setItem(NOSTR_IDENTITY_SOURCE_STORAGE_KEY, identitySource);
    if (switchedAtSec && switchedAtSec > 0) {
      localStorage.setItem(
        NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY,
        String(switchedAtSec),
      );
    } else {
      localStorage.removeItem(NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY);
    }
  } catch {
    // ignore storage unavailability
  }

  await setStoredPushNsec(nsec);
};

export const clearIdentitySecrets = async (): Promise<void> => {
  await Promise.all([
    removeStoredSecret(NOSTR_NSEC_STORAGE_KEY),
    removeStoredSecret(NOSTR_SLIP39_SEED_STORAGE_KEY),
    removeStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY),
    removeStoredSecret(INITIAL_MNEMONIC_STORAGE_KEY),
  ]);

  try {
    localStorage.removeItem(NOSTR_IDENTITY_SOURCE_STORAGE_KEY);
    localStorage.removeItem(NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY);
  } catch {
    // ignore storage unavailability
  }

  await clearStoredPushNsec();
};
