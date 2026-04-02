import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Locale = "cs" | "en";

interface LocaleCopy {
  changeTokenLabel: string;
  githubLabel: string;
  invalidToken: string;
  lightningAddressLabel: string;
  lightningAddressPlaceholder: string;
  loadingToken: string;
  mintLabel: string;
  mppLabel: string;
  mppNo: string;
  mppUnknown: string;
  mppYes: string;
  noTokenLoaded: string;
  nostrLabel: string;
  openDifferentTokenLabel: string;
  pageTitle: string;
  privacyLabel: string;
  privacySearch: string;
  privacyUnknown: string;
  privacyHash: string;
  redeemButton: string;
  redeemDone: string;
  redeemDoneWithChange: string;
  redeemFailed: string;
  redeeming: string;
  satAmountLabel: string;
  showTokenButton: string;
  statusLabel: string;
  statusSpent: string;
  statusValid: string;
  subtitle: string;
  switchLabel: string;
  tokenLabel: string;
  tokenMissing: string;
  validUnknown: string;
}

interface TokenSnapshot {
  amount: number;
  hasMpp: boolean | null;
  iconUrl: string;
  isValid: boolean;
  mint: string;
  mintHost: string;
  unit: string;
}

type MintInfoSearchPrimitive = boolean | number | string | null | undefined;

interface MintInfoSearchObject {
  [key: string]: MintInfoSearchValue;
}

type MintInfoSearchValue =
  | MintInfoSearchObject
  | MintInfoSearchPrimitive
  | MintInfoSearchValue[];

const localeStorageKey = "linky.lang";
const localeOptions: Locale[] = ["cs", "en"];
const localeLabels: Record<Locale, string> = {
  cs: "CZ",
  en: "EN",
};

const copy: Record<Locale, LocaleCopy> = {
  cs: {
    changeTokenLabel: "Soukromý odkaz",
    githubLabel: "GitHub",
    invalidToken: "Token je už utracený nebo neplatný.",
    lightningAddressLabel: "Lightning adresa",
    lightningAddressPlaceholder: "sats@wallet.com",
    loadingToken: "Ověřuji token u mintu…",
    mintLabel: "Mint",
    mppLabel: "MPP",
    mppNo: "Ne",
    mppUnknown: "Neznámé",
    mppYes: "Ano",
    noTokenLoaded:
      "Vlož token ručně nebo otevři stránku rovnou s tokenem v URL.",
    nostrLabel: "Nostr profil",
    openDifferentTokenLabel: "Otevřít jiný token",
    pageTitle: "Redeem Cashu tokenu na lightning adresu",
    privacyLabel: "Ochrana soukromí",
    privacySearch:
      "Token přišel přes query string. Ten server při prvním requestu opravdu vidí. Bezpečnější je hash varianta po #.",
    privacyUnknown:
      "Pro soukromější sdílení používej adresu s tokenem až za #, ne za otazníkem.",
    privacyHash:
      "Token je načtený z hash fragmentu po #, takže se neposílá serveru v HTTP requestu.",
    redeemButton: "Redeemnout token",
    redeemDone: "Redeem hotový. Odesláno {amount} sat.",
    redeemDoneWithChange:
      "Redeem hotový. Odesláno {amount} sat, zůstalo {change} sat jako nový token.",
    redeemFailed: "Redeem se nepodařil.",
    redeeming: "Redeemuju…",
    satAmountLabel: "Částka",
    showTokenButton: "Zobrazit token",
    statusLabel: "Validita",
    statusSpent: "Neplatný",
    statusValid: "Neutracený",
    subtitle:
      "Token zůstává v prohlížeči, stránka ho umí načíst z URL i ručně vloženého textu a redeemnout ho na lightning adresu.",
    switchLabel: "Jazyk",
    tokenLabel: "Cashu token",
    tokenMissing: "Nejdřív vlož Cashu token.",
    validUnknown: "Nepodařilo se načíst token.",
  },
  en: {
    changeTokenLabel: "Private link",
    githubLabel: "GitHub",
    invalidToken: "The token is already spent or invalid.",
    lightningAddressLabel: "Lightning address",
    lightningAddressPlaceholder: "sats@wallet.com",
    loadingToken: "Checking the token with the mint…",
    mintLabel: "Mint",
    mppLabel: "MPP",
    mppNo: "No",
    mppUnknown: "Unknown",
    mppYes: "Yes",
    noTokenLoaded:
      "Paste a token manually or open the page directly with a token in the URL.",
    nostrLabel: "Nostr profile",
    openDifferentTokenLabel: "Open a different token",
    pageTitle: "Redeem a Cashu token to a lightning address",
    privacyLabel: "Privacy Policy",
    privacySearch:
      "This token came via the query string. The server really can see that on the first request. A hash after # is safer.",
    privacyUnknown:
      "For better privacy, put the token after # instead of after a question mark.",
    privacyHash:
      "This token was loaded from the hash fragment after #, so it is not sent to the server in the HTTP request.",
    redeemButton: "Redeem token",
    redeemDone: "Redeem complete. Sent {amount} sat.",
    redeemDoneWithChange:
      "Redeem complete. Sent {amount} sat and {change} sat remains as a new token.",
    redeemFailed: "Redeem failed.",
    redeeming: "Redeeming…",
    satAmountLabel: "Amount",
    showTokenButton: "Show token",
    statusLabel: "Validity",
    statusSpent: "Invalid",
    statusValid: "Unspent",
    subtitle:
      "The token stays in the browser. This page can load it from the URL or pasted text and redeem it to a lightning address.",
    switchLabel: "Language",
    tokenLabel: "Cashu token",
    tokenMissing: "Paste a Cashu token first.",
    validUnknown: "Could not load the token.",
  },
};

const GENERIC_MINT_ICON_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%2314b8a6'/><stop offset='100%' stop-color='%230ea5e9'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(%23g)'/><path d='M21 44V20h6l5 10 5-10h6v24h-5V29l-4.5 8h-3L26 29v15z' fill='white'/></svg>";

const GENERIC_MINT_ICON_DATA_URL = `data:image/svg+xml,${GENERIC_MINT_ICON_SVG}`;

const getCashuLib = async () => await import("@cashu/cashu-ts");

type CashuLib = Awaited<ReturnType<typeof getCashuLib>>;
type CashuWalletLike = InstanceType<CashuLib["CashuWallet"]>;
type CashuMintKeysetLike = CashuWalletLike["keysets"][number];
type ProofStatesResponse = Awaited<
  ReturnType<CashuWalletLike["checkProofsStates"]>
>;
type CashuProofStateLike = ProofStatesResponse[number];
type CashuProofLike = Parameters<
  CashuLib["getEncodedToken"]
>[0]["proofs"][number];

const cashuLibPromise = getCashuLib();

const getInitialLocale = (): Locale => {
  if (typeof window !== "undefined") {
    const savedLocale = window.localStorage.getItem(localeStorageKey);
    if (savedLocale === "cs" || savedLocale === "en") {
      return savedLocale;
    }
  }

  if (typeof navigator === "undefined") return "cs";
  const languages = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];

  for (const language of languages) {
    const normalized = String(language ?? "").toLowerCase();
    if (normalized.startsWith("cs")) return "cs";
    if (normalized.startsWith("en")) return "en";
  }

  return "cs";
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value) return value;
  if (value instanceof Error) return value.message || fallback;

  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message
  ) {
    return value.message;
  }

  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeMintUrl = (value: string): string => {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
};

const isHexString = (value: string): boolean => {
  return /^[0-9a-f]+$/i.test(value);
};

const getMintOriginAndHost = (
  mintUrl: string,
): { host: string | null; origin: string | null } => {
  const raw = String(mintUrl ?? "").trim();
  if (!raw) return { origin: null, host: null };

  try {
    const url = new URL(raw);
    return { origin: url.origin, host: url.host };
  } catch {
    return { origin: null, host: raw };
  }
};

const getMintIconOverride = (host: string | null): string | null => {
  if (!host) return null;
  const key = host.toLowerCase();
  if (key === "cashu.cz") return "https://cashu.cz/icon.webp";
  if (key === "testnut.cashu.space") {
    return "https://image.nostr.build/46ee47763c345d2cfa3317f042d332003f498ee281fb42808d47a7d3b9585911.png";
  }
  if (key === "mint.minibits.cash") {
    return "https://play-lh.googleusercontent.com/raLGxOOzbxOsEx25gr-rISzJOdbgVPG11JHuI2yV57TxqPD_fYBof9TRh-vUE-XyhgmN=w40-h480-rw";
  }
  if (key === "kashu.me") {
    return "https://image.nostr.build/ca72a338d053ffa0f283a1399ebc772bef43814e4998c1fff8aa143b1ea6f29e.jpg";
  }
  if (key === "cashu.21m.lol") {
    return "https://em-content.zobj.net/source/apple/391/zany-face_1f92a.png";
  }
  return null;
};

const isMintInfoSearchArray = (
  value: unknown,
): value is MintInfoSearchValue[] => {
  return Array.isArray(value);
};

const isMintInfoSearchObject = (
  value: unknown,
): value is MintInfoSearchObject => {
  return isRecord(value);
};

const findMintInfoIconValue = (
  value: unknown,
  seen: Set<MintInfoSearchObject | MintInfoSearchValue[]>,
): string | null => {
  if (isMintInfoSearchArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    for (const inner of value) {
      const found = findMintInfoIconValue(inner, seen);
      if (found) return found;
    }
    return null;
  }

  if (!isMintInfoSearchObject(value)) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  for (const key of [
    "icon_url",
    "iconUrl",
    "icon",
    "logo",
    "image",
    "image_url",
    "imageUrl",
  ]) {
    const raw = value[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }

  for (const inner of Object.values(value)) {
    const found = findMintInfoIconValue(inner, seen);
    if (found) return found;
  }

  return null;
};

const resolveMintIconUrl = (mintUrl: string, mintInfo: unknown): string => {
  const { origin, host } = getMintOriginAndHost(mintUrl);
  const override = getMintIconOverride(host);
  if (override) return override;

  const rawIcon = findMintInfoIconValue(mintInfo, new Set());
  if (rawIcon) {
    try {
      return new URL(rawIcon, origin ?? undefined).toString();
    } catch {
      return rawIcon;
    }
  }

  if (origin) {
    return `${origin}/favicon.ico`;
  }

  return GENERIC_MINT_ICON_DATA_URL;
};

const sumProofAmounts = (proofs: readonly CashuProofLike[]): number => {
  let sum = 0;

  for (const proof of proofs) {
    const amount = Number(proof.amount ?? 0);
    if (Number.isFinite(amount) && amount > 0) {
      sum += Math.trunc(amount);
    }
  }

  return sum;
};

const buildProofKey = (proof: CashuProofLike): string => {
  return [
    String(proof.id ?? "").trim(),
    String(proof.secret ?? "").trim(),
    String(proof.C ?? "").trim(),
    String(Number(proof.amount ?? 0) || 0),
  ].join("|");
};

const dedupeProofs = (proofs: readonly CashuProofLike[]): CashuProofLike[] => {
  const seen = new Set<string>();
  const unique: CashuProofLike[] = [];

  for (const proof of proofs) {
    const key = buildProofKey(proof);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(proof);
  }

  return unique;
};

const filterUnspentProofs = (
  proofs: readonly CashuProofLike[],
  states: readonly CashuProofStateLike[],
): CashuProofLike[] => {
  if (states.length !== proofs.length) return [...proofs];

  return proofs.filter((_, index) => {
    return (
      String(states[index]?.state ?? "")
        .trim()
        .toUpperCase() === "UNSPENT"
    );
  });
};

const parseTokenFromSearch = (search: string): string | null => {
  if (!search.startsWith("?")) return null;

  const raw = search.slice(1).trim();
  if (!raw) return null;

  const searchParams = new URLSearchParams(raw);
  const namedToken =
    searchParams.get("token") ??
    searchParams.get("cashu") ??
    searchParams.get("cashutoken");
  const namedValue = String(namedToken ?? "").trim();
  if (namedValue.startsWith("cashu")) {
    return namedValue;
  }

  if (raw.startsWith("cashu")) {
    return decodeURIComponent(raw);
  }

  return null;
};

const parseTokenFromHash = (hash: string): string | null => {
  if (!hash.startsWith("#")) return null;

  const raw = hash.slice(1).trim();
  if (!raw) return null;

  const decoded = decodeURIComponent(raw);
  if (decoded.startsWith("cashu")) {
    return decoded;
  }

  const params = new URLSearchParams(raw);
  const namedToken =
    params.get("token") ?? params.get("cashu") ?? params.get("cashutoken");
  const namedValue = String(namedToken ?? "").trim();
  return namedValue.startsWith("cashu") ? namedValue : null;
};

const getTokenFromUrl = (): {
  source: "hash" | "search" | null;
  token: string;
} => {
  const hashToken = parseTokenFromHash(window.location.hash);
  if (hashToken) return { source: "hash", token: hashToken };

  const searchToken = parseTokenFromSearch(window.location.search);
  if (searchToken) return { source: "search", token: searchToken };

  return { source: null, token: "" };
};

const replaceHashToken = (token: string): void => {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = token ? encodeURIComponent(token) : "";
  window.history.replaceState(null, "", url.toString());
};

const getPrivacySafeTokenUrl = (token: string): string => {
  return `${window.location.origin}/cashu/#${encodeURIComponent(token)}`;
};

const fetchJson = async (url: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isRecord(data)) {
    throw new Error("Invalid JSON response");
  }

  return data;
};

const isLightningAddress = (value: string): boolean => {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
};

const getLnurlEndpoint = (lightningAddress: string): string => {
  const trimmed = lightningAddress.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    throw new Error("Invalid lightning address");
  }

  const user = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;
};

const fetchLnurlInvoice = async (
  lightningAddress: string,
  amountSat: number,
): Promise<string> => {
  if (!isLightningAddress(lightningAddress)) {
    throw new Error("Invalid lightning address");
  }

  const requestUrl = getLnurlEndpoint(lightningAddress);
  const payRequest = await (async () => {
    try {
      return await fetchJson(requestUrl);
    } catch {
      return await fetchJson(
        `/api/lnurlp?url=${encodeURIComponent(requestUrl)}`,
      );
    }
  })();

  const status = String(payRequest.status ?? "")
    .trim()
    .toUpperCase();
  const reason = String(payRequest.reason ?? "").trim();
  if (status === "ERROR") {
    throw new Error(reason || "LNURL error");
  }

  const callback = String(payRequest.callback ?? "").trim();
  const minSendable = Number(payRequest.minSendable ?? NaN);
  const maxSendable = Number(payRequest.maxSendable ?? NaN);
  const amountMsat = Math.round(amountSat * 1000);

  if (!callback) {
    throw new Error("LNURL callback missing");
  }

  if (
    !Number.isFinite(minSendable) ||
    !Number.isFinite(maxSendable) ||
    amountMsat < minSendable ||
    amountMsat > maxSendable
  ) {
    throw new Error("Amount out of LNURL range");
  }

  const invoiceUrl = new URL(callback);
  invoiceUrl.searchParams.set("amount", String(amountMsat));

  const invoiceResponse = await (async () => {
    try {
      return await fetchJson(invoiceUrl.toString());
    } catch {
      return await fetchJson(
        `/api/lnurlp?url=${encodeURIComponent(invoiceUrl.toString())}`,
      );
    }
  })();

  const invoiceStatus = String(invoiceResponse.status ?? "")
    .trim()
    .toUpperCase();
  const invoiceReason = String(invoiceResponse.reason ?? "").trim();
  if (invoiceStatus === "ERROR") {
    throw new Error(invoiceReason || "LNURL invoice error");
  }

  const invoice =
    String(invoiceResponse.pr ?? "").trim() ||
    String(invoiceResponse.paymentRequest ?? "").trim();
  if (!invoice) {
    throw new Error("Invoice missing");
  }

  return invoice;
};

const pickPreferredMintKeyset = (
  keysets: readonly CashuMintKeysetLike[],
  unit: string,
): CashuMintKeysetLike | null => {
  const matches = keysets
    .filter((keyset) => {
      return (
        keyset.active === true &&
        String(keyset.unit ?? "").trim() === unit &&
        isHexString(String(keyset.id ?? ""))
      );
    })
    .sort((left, right) => {
      return Number(left.input_fee_ppk ?? 0) - Number(right.input_fee_ppk ?? 0);
    });

  return matches[0] ?? null;
};

const createLoadedWallet = async (
  lib: CashuLib,
  mintUrl: string,
  unit: string,
): Promise<CashuWalletLike> => {
  const mint = new lib.CashuMint(mintUrl);
  const wallet = new lib.CashuWallet(mint, { unit });

  try {
    await wallet.loadMint();
    return wallet;
  } catch (error) {
    const message = getErrorMessage(error, "").toLowerCase();
    const keysetVerificationFailed =
      message.includes("couldn't verify keyset id") ||
      message.includes("short keyset id v2") ||
      message.includes("got no keysets to map it to") ||
      message.includes("couldn't map short keyset id");

    if (!keysetVerificationFailed) {
      throw error;
    }

    const [mintInfo, keysetsResponse] = await Promise.all([
      mint.getInfo(),
      mint.getKeySets(),
    ]);
    const keyset = pickPreferredMintKeyset(keysetsResponse.keysets, unit);
    if (!keyset?.id) {
      throw new Error(`No active ${unit} keyset found for ${mintUrl}`);
    }

    const keysResponse = await mint.getKeys(keyset.id);
    const keys =
      keysResponse.keysets.find((candidate) => {
        return (
          String(candidate.id ?? "") === String(keyset.id ?? "") &&
          String(candidate.unit ?? "") === String(keyset.unit ?? "")
        );
      }) ?? null;

    if (!keys) {
      throw new Error(`Mint keys for keyset ${keyset.id} are unavailable`);
    }

    const fallbackWallet = new lib.CashuWallet(mint, {
      keysets: keysetsResponse.keysets,
      keys,
      mintInfo,
      unit,
    });
    fallbackWallet.keysetId = keyset.id;
    return fallbackWallet;
  }
};

const inspectToken = async (token: string): Promise<TokenSnapshot> => {
  const lib = await cashuLibPromise;
  const metadata = lib.getTokenMetadata(token);
  const mint = normalizeMintUrl(String(metadata.mint ?? ""));
  if (!mint) {
    throw new Error("Token mint missing");
  }

  const wallet = await createLoadedWallet(lib, mint, "sat");
  const decoded = lib.getDecodedToken(token, wallet.keysets);
  const proofs = dedupeProofs(
    Array.isArray(decoded.proofs) ? decoded.proofs : [],
  );
  if (proofs.length === 0) {
    throw new Error("Token proofs missing");
  }

  const statesResponse = await wallet.checkProofsStates(proofs);
  const states = Array.isArray(statesResponse)
    ? statesResponse
    : [statesResponse];
  const unspentProofs = filterUnspentProofs(proofs, states);
  const mintInfo = wallet.getMintInfo ? await wallet.getMintInfo() : null;
  const methods = Array.isArray(mintInfo?.nuts?.["15"]?.methods)
    ? mintInfo.nuts["15"].methods
    : [];

  return {
    amount: sumProofAmounts(unspentProofs),
    hasMpp:
      methods.length > 0 ? methods.some((method) => method.mpp === true) : null,
    iconUrl: resolveMintIconUrl(mint, mintInfo),
    isValid: unspentProofs.length > 0,
    mint,
    mintHost: getMintOriginAndHost(mint).host ?? mint,
    unit: String(decoded.unit ?? "sat").trim() || "sat",
  };
};

const redeemToken = async (
  token: string,
  lightningAddress: string,
): Promise<{
  amountSent: number;
  changeAmount: number;
  changeToken: string | null;
}> => {
  const lib = await cashuLibPromise;
  const metadata = lib.getTokenMetadata(token);
  const mint = normalizeMintUrl(String(metadata.mint ?? ""));
  if (!mint) {
    throw new Error("Token mint missing");
  }

  const wallet = await createLoadedWallet(lib, mint, "sat");
  const decoded = lib.getDecodedToken(token, wallet.keysets);
  const proofs = dedupeProofs(
    Array.isArray(decoded.proofs) ? decoded.proofs : [],
  );
  const statesResponse = await wallet.checkProofsStates(proofs);
  const states = Array.isArray(statesResponse)
    ? statesResponse
    : [statesResponse];
  const unspentProofs = filterUnspentProofs(proofs, states);
  const availableAmount = sumProofAmounts(unspentProofs);

  if (availableAmount <= 0) {
    throw new Error("Token is already spent");
  }

  const attemptAmounts = Array.from(
    new Set(
      [availableAmount, availableAmount - 1, availableAmount - 5].filter(
        (amount) => amount > 0,
      ),
    ),
  );

  let lastError: unknown = null;

  for (const requestedAmount of attemptAmounts) {
    try {
      const invoice = await fetchLnurlInvoice(
        lightningAddress,
        requestedAmount,
      );
      const quote = await wallet.createMeltQuote(invoice);
      const quoteAmount = Number(quote.amount ?? 0);
      const feeReserve = Number(quote.fee_reserve ?? 0);
      const total = quoteAmount + feeReserve;

      if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Invalid melt quote");
      }

      if (total > availableAmount) {
        throw new Error("Insufficient funds for fees");
      }

      const swapped = await wallet.swap(total, unspentProofs);
      const melt = await wallet.meltProofs(quote, swapped.send);
      const changeProofs = [
        ...swapped.keep,
        ...(Array.isArray(melt.change) ? melt.change : []),
      ];

      return {
        amountSent: quoteAmount,
        changeAmount: sumProofAmounts(changeProofs),
        changeToken:
          changeProofs.length > 0
            ? lib.getEncodedToken({
                mint,
                proofs: changeProofs,
                unit: String(decoded.unit ?? "sat").trim() || "sat",
              })
            : null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Redeem failed");
};

function CashuPage() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [tokenState, setTokenState] = useState<TokenSnapshot | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [lightningAddress, setLightningAddress] = useState("");
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [urlTokenSource, setUrlTokenSource] = useState<
    "hash" | "search" | null
  >(null);
  const activeCopy = useMemo(() => copy[locale], [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getTokenFromUrl();
      setUrlTokenSource(next.source);
      setTokenInput(next.token);
      setActiveToken(next.token);
      setRedeemMessage(null);

      if (next.source === "search" && next.token) {
        replaceHashToken(next.token);
        setUrlTokenSource("hash");
      }
    };

    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);

    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, []);

  useEffect(() => {
    const trimmedToken = activeToken.trim();
    if (!trimmedToken) {
      setTokenState(null);
      setTokenError(null);
      return;
    }

    let cancelled = false;

    setIsInspecting(true);
    setTokenError(null);
    setRedeemMessage(null);

    void inspectToken(trimmedToken)
      .then((snapshot) => {
        if (cancelled) return;
        setTokenState(snapshot);
        if (!snapshot.isValid) {
          setTokenError(activeCopy.invalidToken);
          return;
        }

        setTokenError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setTokenState(null);
        setTokenError(getErrorMessage(error, activeCopy.validUnknown));
      })
      .finally(() => {
        if (cancelled) return;
        setIsInspecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCopy.invalidToken, activeCopy.validUnknown, activeToken]);

  const privacyCopy = useMemo(() => {
    if (urlTokenSource === "search") return activeCopy.privacySearch;
    if (urlTokenSource === "hash") return activeCopy.privacyHash;
    return activeCopy.privacyUnknown;
  }, [
    activeCopy.privacyHash,
    activeCopy.privacySearch,
    activeCopy.privacyUnknown,
    urlTokenSource,
  ]);

  const handleInspectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedToken = tokenInput.trim();
    replaceHashToken(trimmedToken);
    setUrlTokenSource(trimmedToken ? "hash" : null);
    setActiveToken(trimmedToken);
    setRedeemMessage(null);
  };

  const handleRedeemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRedeeming) return;

    const trimmedToken = activeToken.trim();
    const trimmedAddress = lightningAddress.trim().toLowerCase();

    if (!trimmedToken) {
      setRedeemMessage(activeCopy.tokenMissing);
      return;
    }

    if (!isLightningAddress(trimmedAddress)) {
      setRedeemMessage("Zadej platnou lightning adresu.");
      return;
    }

    setIsRedeeming(true);
    setRedeemMessage(null);

    try {
      const result = await redeemToken(trimmedToken, trimmedAddress);
      const nextToken = String(result.changeToken ?? "").trim();

      if (nextToken) {
        replaceHashToken(nextToken);
        setUrlTokenSource("hash");
        setTokenInput(nextToken);
        setActiveToken(nextToken);
        setRedeemMessage(
          activeCopy.redeemDoneWithChange
            .replace("{amount}", String(result.amountSent))
            .replace("{change}", String(result.changeAmount)),
        );
      } else {
        replaceHashToken("");
        setUrlTokenSource(null);
        setTokenInput("");
        setActiveToken("");
        setTokenState(null);
        setRedeemMessage(
          activeCopy.redeemDone.replace("{amount}", String(result.amountSent)),
        );
      }
    } catch (error) {
      setRedeemMessage(getErrorMessage(error, activeCopy.redeemFailed));
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <main className="cashu-shell">
      <div className="site-backdrop" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Linky home">
          <span className="brand-mark">
            <img className="brand-logo" src="/icon.svg" alt="Linky" />
          </span>
          <span className="brand-word">Linky</span>
        </a>

        <div className="locale-switch" aria-label={activeCopy.switchLabel}>
          {localeOptions.map((nextLocale) => {
            const selected = nextLocale === locale;
            return (
              <button
                key={nextLocale}
                className={selected ? "locale-pill is-active" : "locale-pill"}
                type="button"
                onClick={() => setLocale(nextLocale)}
                aria-pressed={selected}
              >
                {localeLabels[nextLocale]}
              </button>
            );
          })}
        </div>
      </header>

      {!activeToken ? (
        <section className="cashu-entry">
          <div className="cashu-panel">
            <p className="eyebrow">Cashu</p>
            <h1>{activeCopy.pageTitle}</h1>
            <p className="lede">{activeCopy.subtitle}</p>
            <p className="cashu-status">{privacyCopy}</p>

            <form className="cashu-form" onSubmit={handleInspectSubmit}>
              <label className="cashu-label" htmlFor="cashu-token-input">
                {activeCopy.tokenLabel}
              </label>
              <textarea
                id="cashu-token-input"
                className="cashu-textarea"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="cashuA..."
                rows={5}
                spellCheck={false}
              />
              <div className="cashu-actions">
                <button className="primary-cta is-single" type="submit">
                  {activeCopy.showTokenButton}
                </button>
              </div>
            </form>

            {tokenError ? (
              <p className="cashu-status cashu-status-error">{tokenError}</p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="cashu-token-view">
          <div className="cashu-panel cashu-panel-highlight">
            <div className="cashu-token-header">
              <div className="cashu-mint-chip">
                {tokenState?.iconUrl ? (
                  <img
                    className="cashu-mint-icon"
                    src={tokenState.iconUrl}
                    alt=""
                  />
                ) : null}
                <div>
                  <p className="eyebrow">Cashu</p>
                  <h1>{tokenState?.amount ?? 0} sat</h1>
                </div>
              </div>

              <div className="cashu-token-links">
                <a
                  className="cashu-secondary-link"
                  href="/cashu"
                  onClick={(event) => {
                    event.preventDefault();
                    replaceHashToken("");
                    setUrlTokenSource(null);
                    setTokenInput("");
                    setActiveToken("");
                    setTokenState(null);
                    setTokenError(null);
                    setRedeemMessage(null);
                  }}
                >
                  {activeCopy.openDifferentTokenLabel}
                </a>
                <a
                  className="cashu-secondary-link"
                  href={getPrivacySafeTokenUrl(activeToken)}
                >
                  {activeCopy.changeTokenLabel}
                </a>
              </div>
            </div>

            <p className="cashu-status">{privacyCopy}</p>

            {isInspecting ? (
              <p className="cashu-status">{activeCopy.loadingToken}</p>
            ) : tokenError ? (
              <p className="cashu-status cashu-status-error">{tokenError}</p>
            ) : tokenState ? (
              <>
                <dl className="cashu-stats">
                  <div className="cashu-stat">
                    <dt>{activeCopy.satAmountLabel}</dt>
                    <dd>
                      {tokenState.amount} {tokenState.unit}
                    </dd>
                  </div>
                  <div className="cashu-stat">
                    <dt>{activeCopy.mintLabel}</dt>
                    <dd>{tokenState.mintHost}</dd>
                  </div>
                  <div className="cashu-stat">
                    <dt>{activeCopy.statusLabel}</dt>
                    <dd>
                      {tokenState.isValid
                        ? activeCopy.statusValid
                        : activeCopy.statusSpent}
                    </dd>
                  </div>
                  <div className="cashu-stat">
                    <dt>{activeCopy.mppLabel}</dt>
                    <dd>
                      {tokenState.hasMpp === null
                        ? activeCopy.mppUnknown
                        : tokenState.hasMpp
                          ? activeCopy.mppYes
                          : activeCopy.mppNo}
                    </dd>
                  </div>
                </dl>

                <form
                  className="cashu-form cashu-redeem-form"
                  onSubmit={handleRedeemSubmit}
                >
                  <label className="cashu-label" htmlFor="cashu-ln-address">
                    {activeCopy.lightningAddressLabel}
                  </label>
                  <input
                    id="cashu-ln-address"
                    className="cashu-input"
                    type="text"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={lightningAddress}
                    onChange={(event) =>
                      setLightningAddress(event.target.value)
                    }
                    placeholder={activeCopy.lightningAddressPlaceholder}
                  />
                  <button
                    className="primary-cta is-single"
                    type="submit"
                    disabled={!tokenState.isValid || isRedeeming}
                  >
                    {isRedeeming
                      ? activeCopy.redeeming
                      : activeCopy.redeemButton}
                  </button>
                </form>
              </>
            ) : (
              <p className="cashu-status">{activeCopy.noTokenLoaded}</p>
            )}

            {redeemMessage ? (
              <p className="cashu-status">{redeemMessage}</p>
            ) : null}

            {tokenState?.mint ? (
              <p className="cashu-footnote">
                Mint URL: <span>{tokenState.mint}</span>
              </p>
            ) : null}
          </div>
        </section>
      )}

      <footer className="footer-links">
        <a
          href="https://github.com/hynek-jina/linky"
          target="_blank"
          rel="noreferrer"
        >
          {activeCopy.githubLabel}
        </a>
        <a href="nostr://npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8">
          {activeCopy.nostrLabel}
        </a>
        <a href="/privacy.html">{activeCopy.privacyLabel}</a>
      </footer>
    </main>
  );
}

export default CashuPage;
