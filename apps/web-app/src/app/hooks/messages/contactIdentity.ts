import { UNKNOWN_CONTACT_ID_PREFIX } from "../../../utils/constants";
import type { ContactIdentityRowLike } from "../../types/appTypes";

const HEX_PUBKEY_RE = /^[a-f0-9]{64}$/;

export const normalizePubkeyHex = (value: unknown): string | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!HEX_PUBKEY_RE.test(normalized)) return null;
  return normalized;
};

export const buildUnknownContactId = (pubkeyHex: unknown): string | null => {
  const normalizedPubkey = normalizePubkeyHex(pubkeyHex);
  if (!normalizedPubkey) return null;
  return `${UNKNOWN_CONTACT_ID_PREFIX}${normalizedPubkey}`;
};

export const readUnknownPubkeyHex = (
  contact: ContactIdentityRowLike | null,
): string | null => {
  if (!contact || typeof contact !== "object") return null;
  if (!("unknownPubkeyHex" in contact)) return null;
  return normalizePubkeyHex(contact.unknownPubkeyHex);
};

export const isUnknownContactId = (id: unknown): boolean => {
  const normalizedId = String(id ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedId) return false;
  return normalizedId.startsWith(UNKNOWN_CONTACT_ID_PREFIX);
};
