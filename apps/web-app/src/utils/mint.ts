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

export const normalizeMintUrl = (value: unknown): string => {
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
  mint: unknown,
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

export const extractPpk = (value: unknown): number | null => {
  const seen = new Set<unknown>();
  const queue: Array<{ v: unknown; depth: number }> = [{ v: value, depth: 0 }];
  while (queue.length) {
    const item = queue.shift();
    if (!item) break;
    const { v, depth } = item;
    if (!v || typeof v !== "object") continue;
    if (seen.has(v)) continue;
    seen.add(v);

    const rec = v as Record<string, unknown>;
    for (const [k, inner] of Object.entries(rec)) {
      if (k.toLowerCase() === "ppk") {
        if (typeof inner === "number" && Number.isFinite(inner)) return inner;
        const num = Number(String(inner ?? "").trim());
        if (Number.isFinite(num)) return num;
      }
      if (depth < 3 && inner && typeof inner === "object") {
        queue.push({ v: inner, depth: depth + 1 });
      }
    }
  }
  return null;
};

export const getMintDuckDuckGoIcon = (host: string | null) => {
  if (!host) return null;
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
};

export const getMintIconOverride = (host: string | null) => {
  if (!host) return null;
  const key = host.toLowerCase();
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
