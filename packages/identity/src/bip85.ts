import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import type { HDKey } from "@scure/bip32";
import { OwnerKey } from "./domain";

const BIP85_HMAC_KEY = new TextEncoder().encode("bip-entropy-from-k");

export const deriveBip85Entropy = (
  root: HDKey,
  path: string,
  bytes: 16 | 32,
): Uint8Array => {
  const node = root.derive(path);
  if (!node.privateKey) throw new Error(`BIP-85 derivation failed at ${path}`);
  return hmac(sha512, BIP85_HMAC_KEY, node.privateKey).slice(0, bytes);
};

export const deriveOwnerKeyAtPath = (root: HDKey, path: string): OwnerKey =>
  OwnerKey.make(deriveBip85Entropy(root, path, 16));
