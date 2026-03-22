import { parseCashuToken } from "../cashu";
import { normalizeNpubIdentifier } from "./nostrNpub";

export interface NativeDeepLinkScanText {
  kind: "scan-text";
  rawUrl: string;
  text: string;
}

const NOSTR_SCHEME_PREFIX = /^nostr:(\/\/)?/i;
const CASHU_SCHEME_PREFIX = /^cashu:(\/\/)?/i;

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeCandidate = (value: string): string => {
  return safeDecode(value).trim();
};

const normalizeStrictNpub = (value: string): string | null => {
  const normalized = normalizeNpubIdentifier(value);
  if (!normalized) return null;
  return /^npub1/i.test(normalized) ? normalized.toLowerCase() : null;
};

const normalizeStrictCashuToken = (value: string): string | null => {
  const trimmed = normalizeCandidate(value);
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^cashu/i, "cashu");
  return parseCashuToken(normalized) ? normalized : null;
};

export const buildCashuDeepLink = (rawToken: unknown): string | null => {
  const token = normalizeStrictCashuToken(String(rawToken ?? ""));
  if (!token) return null;
  return `cashu://${token}`;
};

const extractNpubFromCandidate = (value: string): string | null => {
  const trimmed = normalizeCandidate(value);
  if (!trimmed) return null;

  const direct = normalizeStrictNpub(trimmed);
  if (direct) return direct;

  const segments = trimmed
    .split("/")
    .map((segment) => normalizeCandidate(segment))
    .filter(Boolean);

  if (segments.length === 0) return null;

  const head = String(segments[0] ?? "").toLowerCase();
  if ((head === "contact" || head === "npub") && segments.length > 1) {
    return normalizeStrictNpub(segments[1] ?? "");
  }

  return normalizeStrictNpub(segments[0] ?? "");
};

const collectCandidatesFromUrl = (rawUrl: string, scheme: string): string[] => {
  const candidates: string[] = [];

  try {
    const url = new URL(rawUrl);
    if (url.protocol.toLowerCase() !== `${scheme}:`) {
      return [];
    }

    const queryKeys =
      scheme === "nostr"
        ? ["npub", "nostr", "uri"]
        : ["cashu", "token", "cashutoken", "cashu_token", "uri", "t"];

    for (const key of queryKeys) {
      const queryValue = normalizeCandidate(url.searchParams.get(key) ?? "");
      if (queryValue) {
        candidates.push(queryValue);
      }
    }

    const host = normalizeCandidate(url.host);
    const segments = url.pathname
      .split("/")
      .map((segment) => normalizeCandidate(segment))
      .filter(Boolean);

    if (host) {
      const lowerHost = host.toLowerCase();
      if (scheme === "nostr") {
        if (
          (lowerHost === "contact" || lowerHost === "npub") &&
          segments.length > 0
        ) {
          candidates.push(segments[0]);
        } else {
          candidates.push(host);
        }
      } else {
        candidates.push(host);
      }
    }

    if (segments.length > 0) {
      const first = String(segments[0] ?? "").toLowerCase();
      if (
        scheme === "nostr" &&
        (first === "contact" || first === "npub") &&
        segments.length > 1
      ) {
        candidates.push(segments[1]);
      } else if (
        scheme !== "nostr" ||
        !host ||
        host.toLowerCase() === "contact" ||
        host.toLowerCase() === "npub"
      ) {
        candidates.push(segments[0]);
      }
    }
  } catch {
    // ignore invalid URL parsing and fall back to manual extraction below
  }

  const withoutScheme = rawUrl
    .replace(scheme === "nostr" ? NOSTR_SCHEME_PREFIX : CASHU_SCHEME_PREFIX, "")
    .trim();
  if (withoutScheme) {
    const manualPath = withoutScheme.split("?")[0]?.trim() ?? "";
    if (manualPath) {
      candidates.push(manualPath.replace(/^\/+/, ""));
    }
  }

  return candidates;
};

const parseNostrDeepLinkUrl = (
  normalizedRawUrl: string,
): NativeDeepLinkScanText | null => {
  for (const candidate of collectCandidatesFromUrl(normalizedRawUrl, "nostr")) {
    const npub = extractNpubFromCandidate(candidate);
    if (!npub) continue;
    return {
      kind: "scan-text",
      rawUrl: normalizedRawUrl,
      text: `nostr:${npub}`,
    };
  }

  return null;
};

const parseCashuDeepLinkUrl = (
  normalizedRawUrl: string,
): NativeDeepLinkScanText | null => {
  for (const candidate of collectCandidatesFromUrl(normalizedRawUrl, "cashu")) {
    const token = normalizeStrictCashuToken(candidate);
    if (!token) continue;
    return {
      kind: "scan-text",
      rawUrl: normalizedRawUrl,
      text: `cashu:${token}`,
    };
  }

  return null;
};

export const parseNativeDeepLinkUrl = (
  rawUrl: unknown,
): NativeDeepLinkScanText | null => {
  const normalizedRawUrl = String(rawUrl ?? "").trim();
  if (!normalizedRawUrl) {
    return null;
  }

  if (NOSTR_SCHEME_PREFIX.test(normalizedRawUrl)) {
    return parseNostrDeepLinkUrl(normalizedRawUrl);
  }

  if (CASHU_SCHEME_PREFIX.test(normalizedRawUrl)) {
    return parseCashuDeepLinkUrl(normalizedRawUrl);
  }

  return null;
};
