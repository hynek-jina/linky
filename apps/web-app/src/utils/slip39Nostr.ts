import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Slip39 } from "slip39-ts";

const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";
const CASHU_BIP85_DERIVATION_PATH = "m/83696968'/39'/0'/24'/0'";
const EVOLU_META_OWNER_DERIVATION_PATH = "m/83696968'/39'/0'/24'/1'/0'";
const EVOLU_CONTACTS_OWNER_DERIVATION_PATH_PREFIX = "m/83696968'/39'/0'/24'/2'";
const EVOLU_CASHU_OWNER_DERIVATION_PATH_PREFIX = "m/83696968'/39'/0'/24'/3'";
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

const normalizeSlip39Seed = (rawText: string): string => {
  return toWordList(rawText).join(" ");
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

const deriveBip85EntropyFromSlip39 = async (
  rawText: string,
  path: string,
  bytesLength: 16 | 32,
): Promise<Uint8Array | null> => {
  const normalizedMnemonic = normalizeSlip39Seed(rawText);
  if (!looksLikeSlip39Seed(normalizedMnemonic)) return null;

  try {
    if (!Slip39.validateMnemonic(normalizedMnemonic)) return null;

    const recovered = await Slip39.recoverSecret([normalizedMnemonic], "");
    const seed = toSecretBytes(recovered);
    if (!seed || seed.length < 16 || seed.length > 64) return null;

    const hdRoot = HDKey.fromMasterSeed(seed);
    const node = hdRoot.derive(path);
    const privateKey = node.privateKey;
    if (!privateKey) return null;

    const hmacKey = new TextEncoder().encode("bip-entropy-from-k");
    const digest = hmac(sha512, hmacKey, privateKey);
    return digest.slice(0, bytesLength);
  } catch {
    return null;
  }
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

export const createSlip39Seed = async (): Promise<string | null> => {
  try {
    const entropy = new Uint8Array(16);
    crypto.getRandomValues(entropy);

    const masterSecret = Array.from(entropy);
    const slip = await Slip39.fromArray(masterSecret, {
      groupThreshold: 1,
      groups: [[1, 1, "Linky"]],
      passphrase: "",
      title: "Linky",
    });

    const mnemonics = slip.fromPath("r/0").mnemonics;
    const firstShare = mnemonics[0];
    if (typeof firstShare !== "string") return null;

    const normalized = normalizeSlip39Seed(firstShare);
    if (!normalized) return null;
    if (!Slip39.validateMnemonic(normalized)) return null;
    if (!looksLikeSlip39Seed(normalized)) return null;

    return normalized;
  } catch {
    return null;
  }
};

export const deriveCashuBip85MnemonicFromSlip39 = async (
  rawText: string,
): Promise<string | null> => {
  try {
    const entropy = await deriveBip85EntropyFromSlip39(
      rawText,
      CASHU_BIP85_DERIVATION_PATH,
      32,
    );
    if (!entropy) return null;
    const mnemonic = entropyToMnemonic(entropy, wordlist);

    return String(mnemonic ?? "").trim() || null;
  } catch {
    return null;
  }
};

export const deriveEvoluOwnerMnemonicFromSlip39 = async (
  rawText: string,
  role: "meta" | "contacts" | "cashu",
  contactsIndex = 0,
): Promise<string | null> => {
  if (!Number.isInteger(contactsIndex) || contactsIndex < 0) return null;

  const path = (() => {
    if (role === "meta") return EVOLU_META_OWNER_DERIVATION_PATH;
    if (role === "contacts") {
      return `${EVOLU_CONTACTS_OWNER_DERIVATION_PATH_PREFIX}/${contactsIndex}'`;
    }
    return `${EVOLU_CASHU_OWNER_DERIVATION_PATH_PREFIX}/${contactsIndex}'`;
  })();

  try {
    const entropy = await deriveBip85EntropyFromSlip39(rawText, path, 16);
    if (!entropy) return null;
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    return String(mnemonic ?? "").trim() || null;
  } catch {
    return null;
  }
};
