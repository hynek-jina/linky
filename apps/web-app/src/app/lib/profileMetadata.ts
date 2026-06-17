import type { NostrProfileMetadata } from "../../nostrProfile";
import type { JsonRecord } from "../../types/json";
import { getDefaultNip05IdentifierFromAddress } from "../../utils/nostrNip05";

const readProfileText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const buildKind0ProfileContent = (
  metadata: NostrProfileMetadata,
): JsonRecord => {
  const content: JsonRecord = {};
  const name = readProfileText(metadata.name);
  const displayName = readProfileText(metadata.displayName);
  const picture = readProfileText(metadata.picture);
  const image = readProfileText(metadata.image);
  const lud16 = readProfileText(metadata.lud16);
  const lud06 = readProfileText(metadata.lud06);
  const nip05 = readProfileText(metadata.nip05);

  if (name) content.name = name;
  if (displayName) content.display_name = displayName;
  if (picture) content.picture = picture;
  if (image) content.image = image;
  if (lud16) content.lud16 = lud16;
  if (lud06) content.lud06 = lud06;
  if (nip05) content.nip05 = nip05;

  return content;
};

export const applyLightningAddressToProfileMetadata = (
  previous: NostrProfileMetadata,
  lightningAddress: string,
): {
  lightningAddress: string;
  metadata: NostrProfileMetadata;
  nip05: string | null;
} => {
  const trimmedLightningAddress = lightningAddress.trim();
  const nextNip05 = getDefaultNip05IdentifierFromAddress(
    trimmedLightningAddress,
  );
  const metadata: NostrProfileMetadata = { ...previous };

  if (trimmedLightningAddress) {
    metadata.lud16 = trimmedLightningAddress;
  } else {
    delete metadata.lud16;
    delete metadata.lud06;
  }

  if (nextNip05) {
    metadata.nip05 = nextNip05;
  } else if (getDefaultNip05IdentifierFromAddress(previous.nip05)) {
    delete metadata.nip05;
  }

  return {
    lightningAddress: trimmedLightningAddress,
    metadata,
    nip05: nextNip05,
  };
};
