import type { JsonRecord } from "../types/json";

export const DEFAULT_NIP05_DOMAIN = "linky.fit";

const NOSTR_URI_PREFIX = "nostr:";
const NIP05_LOCAL_PART_RE = /^[a-z0-9._-]+$/i;
const NIP05_DOMAIN_RE = /^[a-z0-9.-]+$/i;
const PUBKEY_HEX_RE = /^[a-f0-9]{64}$/;

let nostrToolsPromise: Promise<typeof import("nostr-tools")> | null = null;

const getNostrTools = () => {
  if (!nostrToolsPromise) nostrToolsPromise = import("nostr-tools");
  return nostrToolsPromise;
};

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export interface Nip05Identifier {
  domain: string;
  identifier: string;
  localPart: string;
}

export type Nip05ResolutionResult =
  | {
      identifier: Nip05Identifier;
      kind: "resolved";
      npub: string;
      relays: string[];
    }
  | { identifier: Nip05Identifier; kind: "not_found" }
  | { identifier: Nip05Identifier; kind: "error"; message: string }
  | { kind: "none" };

const stripNostrUriPrefix = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.slice(0, NOSTR_URI_PREFIX.length).toLowerCase() ===
    NOSTR_URI_PREFIX
    ? trimmed.slice(NOSTR_URI_PREFIX.length).trim()
    : trimmed;
};

const looksLikeDirectNpub = (value: string): boolean => {
  const normalized = stripNostrUriPrefix(value);
  const atIndex = normalized.lastIndexOf("@");
  const candidate = atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
  return /^npub1/i.test(candidate.trim());
};

const normalizeLocalPart = (value: string): string | null => {
  const localPart = value.trim().toLowerCase();
  if (!localPart) return null;
  if (!NIP05_LOCAL_PART_RE.test(localPart)) return null;
  return localPart;
};

const normalizeDomain = (value: string): string | null => {
  const domain = value.trim().toLowerCase();
  if (!domain) return null;
  if (!NIP05_DOMAIN_RE.test(domain)) return null;
  if (domain.includes("..")) return null;

  try {
    const url = new URL(`https://${domain}`);
    if (url.hostname !== domain) return null;
    return domain;
  } catch {
    return null;
  }
};

export const parseNip05IdentifierInput = (
  value: unknown,
): Nip05Identifier | null => {
  const input = stripNostrUriPrefix(String(value ?? ""));
  if (!input) return null;
  if (looksLikeDirectNpub(input)) return null;

  const atIndex = input.indexOf("@");
  if (atIndex >= 0) {
    if (atIndex !== input.lastIndexOf("@")) return null;

    const localPart = normalizeLocalPart(input.slice(0, atIndex));
    const domain = normalizeDomain(input.slice(atIndex + 1));
    if (!localPart || !domain) return null;

    return {
      domain,
      identifier: `${localPart}@${domain}`,
      localPart,
    };
  }

  const localPart = normalizeLocalPart(input);
  if (!localPart) return null;

  return {
    domain: DEFAULT_NIP05_DOMAIN,
    identifier: `${localPart}@${DEFAULT_NIP05_DOMAIN}`,
    localPart,
  };
};

export const getDefaultNip05IdentifierFromAddress = (
  value: unknown,
): string | null => {
  const input = stripNostrUriPrefix(String(value ?? ""));
  const atIndex = input.indexOf("@");
  if (atIndex < 0 || atIndex !== input.lastIndexOf("@")) return null;

  const localPart = normalizeLocalPart(input.slice(0, atIndex));
  const domain = normalizeDomain(input.slice(atIndex + 1));
  if (!localPart || domain !== DEFAULT_NIP05_DOMAIN) return null;

  return `${localPart}@${DEFAULT_NIP05_DOMAIN}`;
};

const readRelays = (value: unknown, pubkeyHex: string): string[] => {
  if (!isJsonRecord(value)) return [];

  const rawList = value[pubkeyHex];
  if (!Array.isArray(rawList)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    const relay = readText(item);
    if (!relay) continue;
    if (!(relay.startsWith("wss://") || relay.startsWith("ws://"))) continue;
    if (seen.has(relay)) continue;
    seen.add(relay);
    out.push(relay);
  }

  return out;
};

export const resolveNip05Identifier = async (
  identifier: Nip05Identifier,
  options?: { signal?: AbortSignal },
): Promise<Nip05ResolutionResult> => {
  if (options?.signal?.aborted) return { identifier, kind: "not_found" };

  const url = new URL(`https://${identifier.domain}/.well-known/nostr.json`);
  url.searchParams.set("name", identifier.localPart);

  try {
    const init: RequestInit = {
      headers: { Accept: "application/json" },
      redirect: "manual",
    };
    if (options?.signal) init.signal = options.signal;

    const response = await fetch(url, init);
    if (!response.ok || response.type === "opaqueredirect") {
      return { identifier, kind: "not_found" };
    }

    const body: unknown = await response.json();
    if (!isJsonRecord(body)) return { identifier, kind: "not_found" };

    const names = body.names;
    if (!isJsonRecord(names)) return { identifier, kind: "not_found" };

    const rawPubkey = readText(names[identifier.localPart]);
    const pubkeyHex = rawPubkey?.toLowerCase() ?? "";
    if (!PUBKEY_HEX_RE.test(pubkeyHex)) {
      return { identifier, kind: "not_found" };
    }

    const { nip19 } = await getNostrTools();
    return {
      identifier,
      kind: "resolved",
      npub: nip19.npubEncode(pubkeyHex),
      relays: readRelays(body.relays, pubkeyHex),
    };
  } catch (error) {
    if (options?.signal?.aborted) return { identifier, kind: "not_found" };
    return {
      identifier,
      kind: "error",
      message: String(error ?? "unknown"),
    };
  }
};

export const resolveNip05Input = async (
  value: unknown,
  options?: { signal?: AbortSignal },
): Promise<Nip05ResolutionResult> => {
  const identifier = parseNip05IdentifierInput(value);
  if (!identifier) return { kind: "none" };
  return resolveNip05Identifier(identifier, options);
};
