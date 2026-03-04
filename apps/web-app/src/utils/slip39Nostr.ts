import {
  createSlip39Share,
  deriveCashuMnemonicFromMasterSecret,
  deriveOwnerMnemonicFromMasterSecret,
  encodeNostrNpub,
  encodeNostrNsec,
  IdentityProvider,
  looksLikeSlip39Share,
  MasterSecretProvider,
  parseOwnerLaneIndex,
  parseSlip39Share,
  recoverMasterSecretFromSlip39Share,
} from "@linky/core/identity";
import { Effect, Layer } from "effect";

interface DerivedNostrKeys {
  npub: string;
  nsec: string;
}

const parseShare = async (rawText: string) => {
  return Effect.runPromise(parseSlip39Share(rawText));
};

export const looksLikeSlip39Seed = (rawText: string): boolean =>
  looksLikeSlip39Share(rawText);

export const deriveNostrKeysFromSlip39 = async (
  rawText: string,
): Promise<DerivedNostrKeys | null> => {
  try {
    const share = await parseShare(rawText);
    const identityLayer = Layer.provideMerge(
      IdentityProvider.Live,
      MasterSecretProvider.fromSlip39Share(share),
    );
    const identity = await Effect.runPromise(
      Effect.provide(IdentityProvider, identityLayer),
    );
    const [nsec, npub] = await Promise.all([
      Effect.runPromise(encodeNostrNsec(identity.nostrSigningKey)),
      Effect.runPromise(encodeNostrNpub(identity.nostrPublicKey)),
    ]);
    return { npub, nsec };
  } catch {
    return null;
  }
};

export const createSlip39Seed = async (): Promise<string | null> => {
  try {
    return await Effect.runPromise(createSlip39Share());
  } catch {
    return null;
  }
};

export const deriveCashuBip85MnemonicFromSlip39 = async (
  rawText: string,
): Promise<string | null> => {
  try {
    const share = await parseShare(rawText);
    const masterSecret = await Effect.runPromise(
      recoverMasterSecretFromSlip39Share(share),
    );
    return await Effect.runPromise(
      deriveCashuMnemonicFromMasterSecret(masterSecret),
    );
  } catch {
    return null;
  }
};

export const deriveEvoluOwnerMnemonicFromSlip39 = async (
  rawText: string,
  role: "meta" | "contacts" | "cashu" | "messages",
  contactsIndex = 0,
): Promise<string | null> => {
  try {
    const share = await parseShare(rawText);
    const index = await Effect.runPromise(parseOwnerLaneIndex(contactsIndex));
    const masterSecret = await Effect.runPromise(
      recoverMasterSecretFromSlip39Share(share),
    );
    return await Effect.runPromise(
      deriveOwnerMnemonicFromMasterSecret(masterSecret, role, index),
    );
  } catch {
    return null;
  }
};
