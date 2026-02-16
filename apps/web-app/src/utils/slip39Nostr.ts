import { HDKey } from "@scure/bip32";
import { Slip39 } from "slip39-ts";

const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";
const SLIP39_WORD_COUNT = 20;

interface DerivedNostrKeys {
  npub: string;
  nsec: string;
}

const toWordList = (rawText: string): string[] => {
  return rawText
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
};

const isByte = (value: unknown): value is number => {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  return value >= 0 && value <= 255;
};

const toSecretBytes = (value: unknown): Uint8Array | null => {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => isByte(item))) return null;
  return Uint8Array.from(value);
};

export const looksLikeSlip39Seed = (rawText: string): boolean => {
  const words = toWordList(rawText);
  return words.length === SLIP39_WORD_COUNT;
};

export const deriveNostrKeysFromSlip39 = async (
  rawText: string,
): Promise<DerivedNostrKeys | null> => {
  const words = toWordList(rawText);
  if (words.length !== SLIP39_WORD_COUNT) return null;

  const normalizedMnemonic = words.join(" ");

  try {
    if (!Slip39.validateMnemonic(normalizedMnemonic)) return null;

    const recovered = await Slip39.recoverSecret([normalizedMnemonic], "");
    const seed = toSecretBytes(recovered);
    if (!seed || seed.length < 16 || seed.length > 64) return null;

    const hdRoot = HDKey.fromMasterSeed(seed);
    const derived = hdRoot.derive(NOSTR_DERIVATION_PATH);
    const privBytes = derived.privateKey;
    if (!privBytes) return null;

    const { getPublicKey, nip19 } = await import("nostr-tools");
    const pubHex = getPublicKey(privBytes);

    return {
      nsec: nip19.nsecEncode(privBytes),
      npub: nip19.npubEncode(pubHex),
    };
  } catch {
    return null;
  }
};
