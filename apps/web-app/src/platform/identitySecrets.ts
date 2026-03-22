import { INITIAL_MNEMONIC_STORAGE_KEY } from "../mnemonic";
import {
  CASHU_BIP85_MNEMONIC_STORAGE_KEY,
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
  nsec: string;
  slip39Seed: string;
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
  nsec,
  slip39Seed,
}: PersistIdentitySecretsParams): Promise<void> => {
  await Promise.all([
    writeStoredSecret(NOSTR_NSEC_STORAGE_KEY, nsec),
    writeStoredSecret(NOSTR_SLIP39_SEED_STORAGE_KEY, slip39Seed),
    writeStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY, cashuMnemonic),
    writeStoredSecret(INITIAL_MNEMONIC_STORAGE_KEY, appMnemonic),
  ]);

  await setStoredPushNsec(nsec);
};

export const clearIdentitySecrets = async (): Promise<void> => {
  await Promise.all([
    removeStoredSecret(NOSTR_NSEC_STORAGE_KEY),
    removeStoredSecret(NOSTR_SLIP39_SEED_STORAGE_KEY),
    removeStoredSecret(CASHU_BIP85_MNEMONIC_STORAGE_KEY),
    removeStoredSecret(INITIAL_MNEMONIC_STORAGE_KEY),
  ]);

  await clearStoredPushNsec();
};
