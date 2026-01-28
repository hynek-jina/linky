import { FIRST_NAMES } from "./firstNames";

export type DerivedProfileDefaults = {
  lnAddress: string;
  name: string;
  pictureUrl: string;
};

// Simple deterministic hash (FNV-1a 32-bit) that works synchronously in the browser.
const hash32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (via shifts to stay in 32-bit)
    hash =
      (hash +
        ((hash << 1) >>> 0) +
        ((hash << 4) >>> 0) +
        ((hash << 7) >>> 0) +
        ((hash << 8) >>> 0) +
        ((hash << 24) >>> 0)) >>
      0;
  }
  return hash >>> 0;
};

const pickDeterministicName = (npub: string): string => {
  const key = String(npub ?? "").trim();
  const list = FIRST_NAMES;
  if (!key) return list[0] ?? "Linky";
  if (!list.length) return "Linky";
  const idx = hash32(key) % list.length;
  return list[idx] ?? list[0] ?? "Linky";
};

const dicebearAvataaarsUrlForNpub = (npub: string): string => {
  const seed = String(npub ?? "").trim() || "linky";
  // DiceBear avatar URL (deterministic by seed). Using SVG keeps it crisp.
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(
    seed,
  )}`;
};

export const deriveDefaultProfile = (npub: string): DerivedProfileDefaults => {
  const normalized = String(npub ?? "").trim();
  const name = pickDeterministicName(normalized);
  const pictureUrl = dicebearAvataaarsUrlForNpub(normalized);
  const lnAddress = normalized ? `${normalized}@npub.cash` : "";
  return { name, lnAddress, pictureUrl };
};
