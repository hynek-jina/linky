export interface LightningAddressParts {
  readonly domain: string;
  readonly user: string;
}

export const splitLightningAddress = (
  value: string,
): LightningAddressParts | null => {
  const trimmed = value.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
  return {
    user: trimmed.slice(0, atIndex),
    domain: trimmed.slice(atIndex + 1),
  };
};
