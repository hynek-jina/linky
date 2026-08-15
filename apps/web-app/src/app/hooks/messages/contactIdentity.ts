import {
  identityFromNsec,
  parsePubkey,
  type NostrSecretKey,
} from "@linky/linkstr";
import { UNKNOWN_CONTACT_ID_PREFIX } from "../../../utils/constants";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import type { ContactIdentityRowLike } from "../../types/appTypes";

export const normalizePubkeyHex = (value: unknown): string | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return parsePubkey(normalized);
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

export const readUnknownContactIdPubkey = (id: unknown): string | null => {
  const normalizedId = String(id ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedId.startsWith(UNKNOWN_CONTACT_ID_PREFIX)) return null;
  return normalizePubkeyHex(
    normalizedId.slice(UNKNOWN_CONTACT_ID_PREFIX.length),
  );
};

export interface ResolvedNostrChatIdentity {
  contactPubHex: string;
  myPubHex: string;
  privBytes: NostrSecretKey;
}

export const resolveNostrChatIdentity = async (
  currentNsec: string,
  contact: ContactIdentityRowLike,
): Promise<ResolvedNostrChatIdentity | null> => {
  const identity = identityFromNsec(currentNsec);
  if (!identity) throw new Error("invalid nsec");

  const unknownPubkeyHex = readUnknownPubkeyHex(contact);
  if (unknownPubkeyHex) {
    return {
      contactPubHex: unknownPubkeyHex,
      myPubHex: identity.pubkey,
      privBytes: identity.secretKey,
    };
  }

  const contactNpub = normalizeNpubIdentifier(contact.npub);
  if (!contactNpub) return null;

  const contactPubkey = parsePubkey(contactNpub);
  if (!contactPubkey) return null;
  return {
    contactPubHex: contactPubkey,
    myPubHex: identity.pubkey,
    privBytes: identity.secretKey,
  };
};
