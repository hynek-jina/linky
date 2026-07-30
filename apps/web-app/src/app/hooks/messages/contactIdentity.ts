import { UNKNOWN_CONTACT_ID_PREFIX } from "../../../utils/constants";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
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
  privBytes: Uint8Array;
}

export const resolveNostrChatIdentity = async (
  currentNsec: string,
  contact: ContactIdentityRowLike,
): Promise<ResolvedNostrChatIdentity | null> => {
  const { getPublicKey, nip19 } = await import("nostr-tools");
  const decodedMe = nip19.decode(currentNsec);
  if (decodedMe.type !== "nsec" || !(decodedMe.data instanceof Uint8Array)) {
    throw new Error("invalid nsec");
  }

  const unknownPubkeyHex = readUnknownPubkeyHex(contact);
  if (unknownPubkeyHex) {
    return {
      contactPubHex: unknownPubkeyHex,
      myPubHex: getPublicKey(decodedMe.data),
      privBytes: decodedMe.data,
    };
  }

  const contactNpub = normalizeNpubIdentifier(contact.npub);
  if (!contactNpub) return null;

  try {
    const decodedContact = nip19.decode(contactNpub);
    if (
      decodedContact.type !== "npub" ||
      typeof decodedContact.data !== "string"
    ) {
      return null;
    }
    return {
      contactPubHex: decodedContact.data,
      myPubHex: getPublicKey(decodedMe.data),
      privBytes: decodedMe.data,
    };
  } catch {
    return null;
  }
};
