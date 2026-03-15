export const MAIN_MINT_URL = "https://mint.minibits.cash/Bitcoin";

export const PRESET_MINTS = [
  "https://cashu.cz",
  "https://testnut.cashu.space",
  "https://mint.minibits.cash/Bitcoin",
  "https://kashu.me",
  "https://cashu.21m.lol",
];

export const CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY =
  "linky.cashu.defaultMintOverride.v1";

export const CASHU_SEEN_MINTS_STORAGE_KEY = "linky.cashu.seenMints.v1";

const GENERIC_MINT_ICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%2314b8a6'/><stop offset='100%' stop-color='%230ea5e9'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><path d='M21 44V20h6l5 10 5-10h6v24h-5V29l-4.5 8h-3L26 29v15z' fill='white'/></svg>";

const GENERIC_MINT_ICON_DATA_URL = `data:image/svg+xml,${GENERIC_MINT_ICON_SVG}`;

interface MintStructuredValue {
  toString(): string;
}

type MintStringInput =
  | bigint
  | boolean
  | number
  | MintStructuredValue
  | string
  | symbol
  | null
  | undefined;

type PpkSearchPrimitive =
  | bigint
  | boolean
  | number
  | MintStructuredValue
  | string
  | symbol
  | null
  | undefined;

interface PpkSearchRecord {
  [key: string]: PpkSearchValue;
}

type PpkSearchValue = PpkSearchPrimitive | PpkSearchRecord | PpkSearchValue[];

const isPpkSearchBranch = (
  value: PpkSearchValue,
): value is PpkSearchRecord | PpkSearchValue[] => {
  return typeof value === "object" && value !== null;
};

const getPpkEntries = (
  value: PpkSearchRecord | PpkSearchValue[],
): Array<[string, PpkSearchValue]> => {
  if (Array.isArray(value)) {
    return value.map((inner, index) => [String(index), inner]);
  }
  return Object.entries(value);
};

export const normalizeMintUrl = (value: MintStringInput): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/\/+$/, "");

  try {
    const u = new URL(stripped);
    const host = u.host.toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, "");

    // Canonicalize our main mint: always use the /Bitcoin variant.
    if (host === "mint.minibits.cash") {
      return "https://mint.minibits.cash/Bitcoin";
    }

    // Keep path for other mints (some are hosted under a path), but drop
    // search/hash for stable identity.
    return `${u.origin}${pathname}`.replace(/\/+$/, "");
  } catch {
    return stripped;
  }
};

export const getMintOriginAndHost = (
  mint: MintStringInput,
): { origin: string | null; host: string | null } => {
  const raw = String(mint ?? "").trim();
  if (!raw) return { origin: null, host: null };
  try {
    const u = new URL(raw);
    return { origin: u.origin, host: u.host };
  } catch {
    const candidate = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;
    try {
      const u = new URL(candidate);
      return { origin: u.origin, host: u.host };
    } catch {
      return { origin: null, host: raw };
    }
  }
};

export const getGenericMintIconUrl = (): string => {
  return GENERIC_MINT_ICON_DATA_URL;
};

export const getNextMintIconUrl = (
  currentUrl: string | null,
  origin: string | null,
): string | null => {
  const genericUrl = getGenericMintIconUrl();
  const cleanedCurrentUrl = String(currentUrl ?? "").trim() || null;
  const faviconUrl = origin ? `${origin}/favicon.ico` : null;

  if (faviconUrl && cleanedCurrentUrl !== faviconUrl) {
    return faviconUrl;
  }

  if (cleanedCurrentUrl !== genericUrl) {
    return genericUrl;
  }

  return null;
};

export const extractPpk = (value: PpkSearchValue): number | null => {
  const seen = new Set<PpkSearchRecord | PpkSearchValue[]>();
  const queue: Array<{ depth: number; value: PpkSearchValue }> = [
    { value, depth: 0 },
  ];

  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    const { depth, value: current } = item;
    if (!isPpkSearchBranch(current)) continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const [key, inner] of getPpkEntries(current)) {
      if (key.toLowerCase() === "ppk") {
        if (typeof inner === "number" && Number.isFinite(inner)) return inner;
        const num = Number(String(inner ?? "").trim());
        if (Number.isFinite(num)) return num;
      }
      if (depth < 3 && isPpkSearchBranch(inner)) {
        queue.push({ value: inner, depth: depth + 1 });
      }
    }
  }
  return null;
};

export const getMintIconOverride = (host: string | null) => {
  if (!host) return null;
  const key = host.toLowerCase();
  if (key === "cashu.cz") {
    return "https://cashu.cz/icon.webp";
  }
  if (key === "testnut.cashu.space") {
    return "https://image.nostr.build/46ee47763c345d2cfa3317f042d332003f498ee281fb42808d47a7d3b9585911.png";
  }
  if (key === "mint.minibits.cash") {
    return "https://play-lh.googleusercontent.com/raLGxOOzbxOsEx25gr-rISzJOdbgVPG11JHuI2yV57TxqPD_fYBof9TRh-vUE-XyhgmN=w40-h480-rw";
  }
  if (key === "linky.cashu.cz") {
    return "https://linky-weld.vercel.app/icon.svg";
  }
  if (key === "kashu.me") {
    return "https://image.nostr.build/ca72a338d053ffa0f283a1399ebc772bef43814e4998c1fff8aa143b1ea6f29e.jpg";
  }
  if (key === "cashu.21m.lol") {
    return "https://em-content.zobj.net/source/apple/391/zany-face_1f92a.png";
  }
  return null;
};
