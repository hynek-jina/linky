import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeaderMenu } from "../SiteHeaderMenu";
import {
  getInitialSiteDisplayCurrency,
  siteDisplayCurrencyStorageKey,
  type SiteDisplayCurrency,
} from "../siteDisplayCurrency";
import { forwardCashuTokenPrivately } from "./nostrGiftWrap";

type Locale = "cs" | "en";

interface LocaleCopy {
  cashuLabel: string;
  czechLabel: string;
  copyTokenLabel: string;
  currencyLabel: string;
  englishLabel: string;
  githubLabel: string;
  invalidToken: string;
  lightningAddressLabel: string;
  lightningAddressPlaceholder: string;
  loadingToken: string;
  noTokenLoaded: string;
  nostrLabel: string;
  pageTitle: string;
  payoutIntroLead: string;
  payoutIntroLink: string;
  payoutIntroTail: string;
  privacyLabel: string;
  menuLabel: string;
  openAppLabel: string;
  openInWalletLabel: string;
  redeemButton: string;
  redeemConfirmed: string;
  redeemLnurlComment: string;
  redeemSuccessAddress: string;
  redeeming: string;
  showTokenButton: string;
  spentInfo: string;
  statusSpent: string;
  subtitle: string;
  switchLabel: string;
  tokenLabel: string;
  validUnknown: string;
}

interface TokenSnapshot {
  amount: number;
  hasMpp: boolean | null;
  iconUrl: string;
  isValid: boolean;
  mint: string;
  mintHost: string;
  totalAmount: number;
  unit: string;
}

interface RedeemSuccessState {
  lightningAddress: string;
}

interface SiteFiatRates {
  czkPerBtc: number;
  fetchedAtMs: number;
  usdPerBtc: number;
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
const fiatRatesStorageKey = "linky.fiat_rates.v1";
const fiatRatesTtlMs = 10 * 60 * 1000;
const satsPerBtc = 100_000_000;
const REMAINING_TOKEN_FORWARD_RECIPIENT_NPUB =
  "npub1xuxvcnmw4drf8duzalvalxrfxjvwtrjdmwxy0ez2e62uje4drrvqu6pz2w";

const copy: Record<Locale, LocaleCopy> = {
  cs: {
    cashuLabel: "Cashu",
    czechLabel: "Čeština",
    copyTokenLabel: "Kopírovat token",
    currencyLabel: "Jednotky",
    englishLabel: "Angličtina",
    githubLabel: "GitHub",
    invalidToken: "Utraceno",
    lightningAddressLabel: "Lightning adresa",
    lightningAddressPlaceholder: "jmeno@linky.fit",
    loadingToken: "Ověřuji token u mintu…",
    noTokenLoaded:
      "Vlož token ručně nebo otevři stránku rovnou s tokenem v URL.",
    nostrLabel: "Nostr profil",
    pageTitle: "Vytvoř odkaz pro vyzvednutí bitcoinu na lightning adresu",
    payoutIntroLead:
      "Někdo vám posílá bitcoin. Zadejte lightning adresu, abyste si ho vybrali do své peněženky. Nebo začněte používat aplikaci ",
    payoutIntroLink: "Linky",
    payoutIntroTail: ".",
    privacyLabel: "Ochrana soukromí",
    menuLabel: "Menu",
    openAppLabel: "Otevřít aplikaci",
    openInWalletLabel: "Otevřít v peněžence",
    redeemButton: "Vyzvednout bitcoin",
    redeemConfirmed: "Hotovo",
    redeemLnurlComment: "Vybráno pomocí Linky",
    redeemSuccessAddress: "Prostředky vybrány na {address}",
    redeeming: "Vyzvedávám…",
    showTokenButton: "Zobrazit token",
    spentInfo: "Už to někdo vybral.",
    statusSpent: "Utraceno",
    subtitle:
      "Vložte existující cashu token a vytvořte odkaz, který můžete poslat svému známému.",
    switchLabel: "Jazyk",
    tokenLabel: "Cashu token",
    validUnknown: "Nepodařilo se načíst token.",
  },
  en: {
    cashuLabel: "Cashu",
    czechLabel: "Czech",
    copyTokenLabel: "Copy token",
    currencyLabel: "Units",
    englishLabel: "English",
    githubLabel: "GitHub",
    invalidToken: "Spent",
    lightningAddressLabel: "Lightning address",
    lightningAddressPlaceholder: "name@linky.fit",
    loadingToken: "Checking the token with the mint…",
    noTokenLoaded:
      "Paste a token manually or open the page directly with a token in the URL.",
    nostrLabel: "Nostr profile",
    pageTitle: "Create a link to redeem bitcoin to a lightning address",
    payoutIntroLead:
      "Someone is sending you bitcoin. Enter your lightning address to withdraw it into your wallet. Or start using ",
    payoutIntroLink: "Linky",
    payoutIntroTail: ".",
    privacyLabel: "Privacy Policy",
    menuLabel: "Menu",
    openAppLabel: "Open web app",
    openInWalletLabel: "Open in wallet",
    redeemButton: "Redeem bitcoin",
    redeemConfirmed: "Success",
    redeemLnurlComment: "Redeemed with Linky",
    redeemSuccessAddress: "Funds redeemed to {address}",
    redeeming: "Redeeming…",
    showTokenButton: "Show token",
    spentInfo: "Someone already redeemed it.",
    statusSpent: "Spent",
    subtitle:
      "Paste an existing Cashu token and create a link to redeem bitcoin to a lightning address.",
    switchLabel: "Language",
    tokenLabel: "Cashu token",
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

const readObjectField = (value: unknown, field: string): unknown => {
  if (!isRecord(value)) return undefined;
  return Reflect.get(value, field);
};

const isSiteFiatRates = (value: unknown): value is SiteFiatRates => {
  const czkPerBtc = readObjectField(value, "czkPerBtc");
  const fetchedAtMs = readObjectField(value, "fetchedAtMs");
  const usdPerBtc = readObjectField(value, "usdPerBtc");

  return (
    typeof czkPerBtc === "number" &&
    Number.isFinite(czkPerBtc) &&
    czkPerBtc > 0 &&
    typeof fetchedAtMs === "number" &&
    Number.isFinite(fetchedAtMs) &&
    fetchedAtMs > 0 &&
    typeof usdPerBtc === "number" &&
    Number.isFinite(usdPerBtc) &&
    usdPerBtc > 0
  );
};

const readStoredSiteFiatRates = (): SiteFiatRates | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(fiatRatesStorageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSiteFiatRates(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const storeSiteFiatRates = (value: SiteFiatRates): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(fiatRatesStorageKey, JSON.stringify(value));
  } catch {
    // Keep going without cached rates.
  }
};

const areSiteFiatRatesStale = (value: SiteFiatRates | null): boolean => {
  if (!value) return true;
  return Date.now() - value.fetchedAtMs >= fiatRatesTtlMs;
};

const parseFetchedSiteFiatRates = (value: unknown): SiteFiatRates | null => {
  const data = readObjectField(value, "data");
  const rates = readObjectField(data, "rates");
  const czkRaw = readObjectField(rates, "CZK");
  const usdRaw = readObjectField(rates, "USD");

  const czkPerBtc = Number.parseFloat(String(czkRaw ?? ""));
  const usdPerBtc = Number.parseFloat(String(usdRaw ?? ""));

  if (
    !Number.isFinite(czkPerBtc) ||
    czkPerBtc <= 0 ||
    !Number.isFinite(usdPerBtc) ||
    usdPerBtc <= 0
  ) {
    return null;
  }

  return {
    czkPerBtc,
    fetchedAtMs: Date.now(),
    usdPerBtc,
  };
};

const fetchSiteFiatRates = async (
  signal: AbortSignal,
): Promise<SiteFiatRates | null> => {
  const url = new URL("https://api.coinbase.com/v2/exchange-rates");
  url.searchParams.set("currency", "BTC");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) return null;
  const payload: unknown = await response.json();
  return parseFetchedSiteFiatRates(payload);
};

const normalizeLocale = (lang: Locale): string => {
  return lang === "cs" ? "cs-CZ" : "en-US";
};

const formatInteger = (value: number, lang: Locale): string => {
  return new Intl.NumberFormat(normalizeLocale(lang)).format(
    Number.isFinite(value) ? Math.trunc(value) : 0,
  );
};

const formatCashuDisplayAmount = (
  amountSat: number,
  displayCurrency: SiteDisplayCurrency,
  fiatRates: SiteFiatRates | null,
  lang: Locale,
): string => {
  const normalizedAmount = Number.isFinite(amountSat)
    ? Math.max(0, Math.trunc(amountSat))
    : 0;

  if (displayCurrency === "btc") {
    return `${formatInteger(normalizedAmount, lang)} ₿`;
  }

  if (displayCurrency === "czk" && fiatRates) {
    const fiatValue = (normalizedAmount / satsPerBtc) * fiatRates.czkPerBtc;
    return `~${formatInteger(Math.round(fiatValue), lang)} Kč`;
  }

  if (displayCurrency === "usd" && fiatRates) {
    const fiatValue = (normalizedAmount / satsPerBtc) * fiatRates.usdPerBtc;
    return `~${formatInteger(Math.round(fiatValue), lang)} USD`;
  }

  return `${formatInteger(normalizedAmount, lang)} sat`;
};

const copyTextToClipboard = async (value: string): Promise<boolean> => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(trimmed);
      return true;
    } catch {
      // Fall through to the textarea fallback below.
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = trimmed;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
};

const buildLinkyWalletImportUrl = (token: string): string | null => {
  const trimmed = String(token ?? "").trim();
  if (!trimmed) return null;
  return `https://app.linky.fit/#wallet?cashu=${encodeURIComponent(trimmed)}`;
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
  const rawIcon = findMintInfoIconValue(mintInfo, new Set());
  if (rawIcon) {
    try {
      return new URL(rawIcon, origin ?? undefined).toString();
    } catch {
      return GENERIC_MINT_ICON_DATA_URL;
    }
  }

  const override = getMintIconOverride(host);
  if (override) return override;

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

const findBestRedeemQuote = async (
  wallet: CashuWalletLike,
  lightningAddress: string,
  availableAmount: number,
  comment?: string,
): Promise<{
  feeReserve: number;
  quote: Awaited<ReturnType<CashuWalletLike["createMeltQuote"]>>;
  quoteAmount: number;
}> => {
  let low = 1;
  let high = availableAmount;
  let best: {
    feeReserve: number;
    quote: Awaited<ReturnType<CashuWalletLike["createMeltQuote"]>>;
    quoteAmount: number;
    total: number;
  } | null = null;
  let lastError: unknown = null;

  while (low <= high) {
    const requestedAmount = Math.floor((low + high) / 2);

    try {
      const invoice = await fetchLnurlInvoice(
        lightningAddress,
        requestedAmount,
        comment,
      );
      const quote = await wallet.createMeltQuote(invoice);
      const quoteAmount = Number(quote.amount ?? 0);
      const feeReserve = Number(quote.fee_reserve ?? 0);
      const total = quoteAmount + feeReserve;

      if (
        !Number.isFinite(quoteAmount) ||
        !Number.isFinite(feeReserve) ||
        !Number.isFinite(total) ||
        quoteAmount <= 0 ||
        total <= 0
      ) {
        throw new Error("Invalid melt quote");
      }

      if (total > availableAmount) {
        high = requestedAmount - 1;
        continue;
      }

      best = {
        feeReserve,
        quote,
        quoteAmount,
        total,
      };

      if (total === availableAmount) {
        break;
      }

      low = requestedAmount + 1;
    } catch (error) {
      lastError = error;
      high = requestedAmount - 1;
    }
  }

  if (!best) {
    throw lastError ?? new Error("Redeem failed");
  }

  return {
    feeReserve: best.feeReserve,
    quote: best.quote,
    quoteAmount: best.quoteAmount,
  };
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
  comment?: string,
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
  const commentAllowed = Number(payRequest.commentAllowed ?? NaN);
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
  const trimmedComment = String(comment ?? "").trim();
  if (trimmedComment && Number.isFinite(commentAllowed) && commentAllowed > 0) {
    invoiceUrl.searchParams.set(
      "comment",
      trimmedComment.slice(0, Math.trunc(commentAllowed)),
    );
  }

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
  const totalAmount = sumProofAmounts(proofs);

  return {
    amount: sumProofAmounts(unspentProofs),
    hasMpp:
      methods.length > 0 ? methods.some((method) => method.mpp === true) : null,
    iconUrl: resolveMintIconUrl(mint, mintInfo),
    isValid: unspentProofs.length > 0,
    mint,
    mintHost: getMintOriginAndHost(mint).host ?? mint,
    totalAmount,
    unit: String(decoded.unit ?? "sat").trim() || "sat",
  };
};

const redeemToken = async (
  token: string,
  lightningAddress: string,
  comment?: string,
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
  const bestQuote = await findBestRedeemQuote(
    wallet,
    lightningAddress,
    availableAmount,
    comment,
  );
  const total = bestQuote.quoteAmount + bestQuote.feeReserve;
  const swapped = await wallet.swap(total, unspentProofs);
  const melt = await wallet.meltProofs(bestQuote.quote, swapped.send);
  const changeProofs = [
    ...swapped.keep,
    ...(Array.isArray(melt.change) ? melt.change : []),
  ];

  return {
    amountSent: bestQuote.quoteAmount,
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
};

const redeemTokenFully = async (
  token: string,
  lightningAddress: string,
  comment?: string,
): Promise<{
  amountSent: number;
  changeAmount: number;
  changeToken: string | null;
}> => {
  return await redeemToken(token.trim(), lightningAddress, comment);
};

function CashuPage() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [displayCurrency, setDisplayCurrency] = useState<SiteDisplayCurrency>(
    getInitialSiteDisplayCurrency,
  );
  const [fiatRates, setFiatRates] = useState<SiteFiatRates | null>(() =>
    readStoredSiteFiatRates(),
  );
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [tokenState, setTokenState] = useState<TokenSnapshot | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [lightningAddress, setLightningAddress] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState<RedeemSuccessState | null>(
    null,
  );
  const [isInspecting, setIsInspecting] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [mintIconSrc, setMintIconSrc] = useState(GENERIC_MINT_ICON_DATA_URL);
  const [tokenCopied, setTokenCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const redeemSubmitLockedRef = useRef(false);
  const activeCopy = useMemo(() => copy[locale], [locale]);
  const displayedTokenAmount = tokenState?.isValid
    ? (tokenState.amount ?? 0)
    : (tokenState?.totalAmount ?? 0);
  const displayedTokenAmountText = useMemo(
    () =>
      formatCashuDisplayAmount(
        displayedTokenAmount,
        displayCurrency,
        fiatRates,
        locale,
      ),
    [displayCurrency, displayedTokenAmount, fiatRates, locale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(siteDisplayCurrencyStorageKey, displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const syncRates = async () => {
      const cached = readStoredSiteFiatRates();
      if (!cancelled) setFiatRates(cached);
      if (!areSiteFiatRatesStale(cached)) return;

      const controller = new AbortController();
      activeController = controller;

      try {
        const next = await fetchSiteFiatRates(controller.signal);
        if (!next || cancelled) return;
        storeSiteFiatRates(next);
        setFiatRates(next);
      } catch {
        // Ignore exchange-rate fetch errors and keep last cached value.
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    void syncRates();
    const intervalId = window.setInterval(() => {
      void syncRates();
    }, fiatRatesTtlMs);

    return () => {
      cancelled = true;
      if (activeController) activeController.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = getTokenFromUrl();
      setTokenInput(next.token);
      setActiveToken(next.token);
      setRedeemSuccess(null);
      setTokenCopied(false);
      redeemSubmitLockedRef.current = false;

      if (next.source === "search" && next.token) {
        replaceHashToken(next.token);
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
      setMintIconSrc(GENERIC_MINT_ICON_DATA_URL);
      return;
    }

    let cancelled = false;

    setIsInspecting(true);
    setTokenError(null);

    void inspectToken(trimmedToken)
      .then((snapshot) => {
        if (cancelled) return;
        setTokenState(snapshot);
        setMintIconSrc(snapshot.iconUrl);
        if (!snapshot.isValid) {
          setTokenError(activeCopy.invalidToken);
          return;
        }

        setTokenError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setTokenState(null);
        setMintIconSrc(GENERIC_MINT_ICON_DATA_URL);
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

  const handleInspectSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedToken = tokenInput.trim();
    replaceHashToken(trimmedToken);
    setActiveToken(trimmedToken);
    setRedeemSuccess(null);
    redeemSubmitLockedRef.current = false;
  };

  const handleRedeemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRedeeming || redeemSubmitLockedRef.current) return;

    const trimmedToken = activeToken.trim();
    const trimmedAddress = lightningAddress.trim().toLowerCase();
    if (!trimmedToken || !isLightningAddress(trimmedAddress)) return;

    redeemSubmitLockedRef.current = true;
    setIsRedeeming(true);

    try {
      const result = await redeemTokenFully(
        trimmedToken,
        trimmedAddress,
        activeCopy.redeemLnurlComment,
      );
      const nextToken = String(result.changeToken ?? "").trim();

      if (nextToken && result.changeAmount > 0) {
        try {
          await forwardCashuTokenPrivately({
            recipientNpub: REMAINING_TOKEN_FORWARD_RECIPIENT_NPUB,
            token: nextToken,
          });
        } catch {
          redeemSubmitLockedRef.current = false;
          replaceHashToken(nextToken);
          setTokenInput(nextToken);
          setActiveToken(nextToken);
          return;
        }
      }

      replaceHashToken("");
      setTokenInput("");
      setActiveToken("");
      setTokenState(null);
      setRedeemSuccess({
        lightningAddress: trimmedAddress,
      });
    } catch {
      redeemSubmitLockedRef.current = false;
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleCopyToken = async () => {
    const ok = await copyTextToClipboard(activeToken);
    if (!ok) return;

    setTokenCopied(true);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setTokenCopied(false);
      copyResetTimerRef.current = null;
    }, 1400);
  };

  const handleOpenInWallet = () => {
    const walletImportUrl = buildLinkyWalletImportUrl(activeToken);
    if (!walletImportUrl) return;
    window.open(walletImportUrl, "_blank", "noopener,noreferrer");
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

        <SiteHeaderMenu
          copy={{
            czechLabel: activeCopy.czechLabel,
            currencyLabel: activeCopy.currencyLabel,
            englishLabel: activeCopy.englishLabel,
            menuLabel: activeCopy.menuLabel,
            openAppLabel: activeCopy.openAppLabel,
            switchLabel: activeCopy.switchLabel,
          }}
          displayCurrency={displayCurrency}
          locale={locale}
          onLocaleChange={setLocale}
          setDisplayCurrency={setDisplayCurrency}
        />
      </header>

      {redeemSuccess ? (
        <section className="cashu-token-view">
          <div className="cashu-panel cashu-panel-highlight cashu-success-panel">
            <div className="cashu-success-check" aria-hidden="true">
              ✓
            </div>
            <p className="cashu-success-title">{activeCopy.redeemConfirmed}</p>
            <p className="cashu-success-address">
              {activeCopy.redeemSuccessAddress.replace(
                "{address}",
                redeemSuccess.lightningAddress,
              )}
            </p>
          </div>
        </section>
      ) : !activeToken ? (
        <section className="cashu-entry">
          <div className="cashu-panel">
            <p className="cashu-page-kicker">Cashu</p>
            <h1>{activeCopy.pageTitle}</h1>
            <p className="lede">{activeCopy.subtitle}</p>

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
            <p className="cashu-page-kicker">Cashu</p>
            <div className="cashu-token-header">
              <div className="cashu-mint-chip">
                {tokenState?.iconUrl ? (
                  <img
                    className="cashu-mint-icon"
                    src={mintIconSrc}
                    alt=""
                    onError={() => {
                      setMintIconSrc(GENERIC_MINT_ICON_DATA_URL);
                    }}
                  />
                ) : null}
                <div className="cashu-token-copy">
                  <h1 className={!tokenState?.isValid ? "is-spent" : undefined}>
                    {displayedTokenAmountText}
                  </h1>
                  {tokenState?.mintHost ? (
                    <p className="cashu-mint-subtle">{tokenState.mintHost}</p>
                  ) : null}
                </div>
              </div>

              <div className="cashu-token-actions">
                <button
                  type="button"
                  className="cashu-token-action"
                  aria-label={activeCopy.copyTokenLabel}
                  title={activeCopy.copyTokenLabel}
                  onClick={() => {
                    void handleCopyToken();
                  }}
                >
                  <span className="cashu-token-action-glyph" aria-hidden="true">
                    {tokenCopied ? "✓" : "⧉"}
                  </span>
                </button>

                <button
                  type="button"
                  className="cashu-token-action"
                  aria-label={activeCopy.openInWalletLabel}
                  title={activeCopy.openInWalletLabel}
                  onClick={handleOpenInWallet}
                >
                  <img
                    className="cashu-token-action-logo"
                    src="/icon.svg"
                    alt=""
                  />
                </button>
              </div>
            </div>

            {isInspecting ? (
              <p className="cashu-status">{activeCopy.loadingToken}</p>
            ) : tokenState ? (
              <>
                {!tokenState.isValid ? (
                  <>
                    <p className="cashu-spent-badge">
                      {activeCopy.statusSpent}
                    </p>
                    <p className="cashu-status">{activeCopy.spentInfo}</p>
                  </>
                ) : (
                  <>
                    <p className="cashu-status">
                      {activeCopy.payoutIntroLead}
                      <a
                        className="cashu-inline-link"
                        href="https://app.linky.fit"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {activeCopy.payoutIntroLink}
                      </a>
                      {activeCopy.payoutIntroTail}
                    </p>

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
                        disabled={
                          !tokenState.isValid ||
                          isRedeeming ||
                          !isLightningAddress(lightningAddress.trim())
                        }
                      >
                        {isRedeeming
                          ? activeCopy.redeeming
                          : activeCopy.redeemButton}
                      </button>
                    </form>
                  </>
                )}
              </>
            ) : tokenError ? (
              <p className="cashu-status cashu-status-error">{tokenError}</p>
            ) : (
              <p className="cashu-status">{activeCopy.noTokenLoaded}</p>
            )}
          </div>
        </section>
      )}

      <footer className="footer-links">
        <a href="/cashu/">Cashu</a>
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
