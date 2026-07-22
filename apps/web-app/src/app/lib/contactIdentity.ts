interface LightningAddressContact {
  readonly lnAddress?: unknown;
}

export const normalizeContactLightningAddress = (value: unknown): string => {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

export const findUniqueContactByLightningAddress = <
  TContact extends LightningAddressContact,
>(
  contacts: readonly TContact[],
  lightningAddress: unknown,
): TContact | null => {
  const normalizedAddress = normalizeContactLightningAddress(lightningAddress);
  if (!normalizedAddress) return null;

  let match: TContact | null = null;
  for (const contact of contacts) {
    if (
      normalizeContactLightningAddress(contact.lnAddress) !== normalizedAddress
    ) {
      continue;
    }
    if (match) return null;
    match = contact;
  }
  return match;
};
