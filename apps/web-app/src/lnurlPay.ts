import { bech32 } from "@scure/base";
import type { JsonRecord, JsonValue } from "./types/json";
import { fetchJson } from "./utils/http";
import { asNonEmptyString } from "./utils/validation";

type LnurlPayRequest = {
  callback?: string;
  commentAllowed?: number;
  maxSendable?: number;
  metadata?: string;
  minSendable?: number;
  reason?: string;
  status?: string;
  tag?: string;
};

type LnurlInvoiceResponse = {
  paymentRequest?: string;
  pr?: string;
  reason?: string;
  status?: string;
};

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isOptionalNumber = (
  value: JsonValue | undefined,
): value is number | undefined => {
  return value === undefined || typeof value === "number";
};

const isOptionalString = (
  value: JsonValue | undefined,
): value is string | undefined => {
  return value === undefined || typeof value === "string";
};

const LIGHTNING_ADDRESS_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const stripLightningPrefix = (value: string): string => {
  return value.replace(/^lightning:/i, "").trim();
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const decodeLnurlBech32Url = (value: string): string | null => {
  const normalized = stripLightningPrefix(value);
  if (!/^lnurl1/i.test(normalized)) return null;

  try {
    const decoded = bech32.decodeUnsafe(normalized.toLowerCase(), 2048);
    if (!decoded) return null;
    const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
    const text = new TextDecoder().decode(bytes).trim();
    return isHttpUrl(text) ? text : null;
  } catch {
    return null;
  }
};

const normalizeLnurlSchemeUrl = (value: string): string | null => {
  const normalized = stripLightningPrefix(value);
  if (!/^lnurlp:\/\//i.test(normalized)) return null;

  const rawTarget = normalized.replace(/^lnurlp:\/\//i, "").trim();
  if (isLightningAddress(rawTarget)) {
    return getLnurlpUrlFromLightningAddress(rawTarget);
  }

  const httpUrl = `https://${rawTarget}`;
  return isHttpUrl(httpUrl) ? httpUrl : null;
};

const toHttpLnurlUrl = (value: string): string | null => {
  const normalized = stripLightningPrefix(value);
  if (!isHttpUrl(normalized)) return null;
  return normalized;
};

const resolveLnurlTargetUrlOrNull = (value: string): string | null => {
  const normalized = stripLightningPrefix(value);

  if (isLightningAddress(normalized)) {
    return getLnurlpUrlFromLightningAddress(normalized);
  }

  return (
    decodeLnurlBech32Url(normalized) ??
    normalizeLnurlSchemeUrl(normalized) ??
    toHttpLnurlUrl(normalized)
  );
};

const inferLightningAddressFromRequestUrl = (
  requestUrl: string,
): string | null => {
  try {
    const url = new URL(requestUrl);
    const pathSegments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    if (
      pathSegments.length >= 3 &&
      pathSegments[0] === ".well-known" &&
      pathSegments[1].toLowerCase() === "lnurlp"
    ) {
      return `${pathSegments[2]}@${url.host}`;
    }

    if (
      pathSegments.length >= 2 &&
      pathSegments[0].toLowerCase() === "lnurlp"
    ) {
      return `${pathSegments[1]}@${url.host}`;
    }

    return null;
  } catch {
    return null;
  }
};

export const isLightningAddress = (value: string): boolean => {
  return LIGHTNING_ADDRESS_PATTERN.test(stripLightningPrefix(value));
};

export const isLnurlPayTarget = (value: string): boolean => {
  return resolveLnurlTargetUrlOrNull(value) !== null;
};

export const resolveLnurlPayRequestUrl = (value: string): string => {
  const httpUrl = resolveLnurlTargetUrlOrNull(value);
  if (httpUrl) return httpUrl;

  throw new Error("Invalid LNURL or lightning address");
};

export const getLnurlPayDisplayText = (value: string): string => {
  const normalized = stripLightningPrefix(value);
  if (isLightningAddress(normalized)) return normalized;

  const requestUrl = resolveLnurlTargetUrlOrNull(normalized);
  if (!requestUrl) return normalized;

  try {
    const url = new URL(requestUrl);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path}`;
  } catch {
    return requestUrl;
  }
};

export const inferLightningAddressFromLnurlTarget = (
  value: string,
): string | null => {
  const normalized = stripLightningPrefix(value);
  if (isLightningAddress(normalized)) return normalized;

  const requestUrl = resolveLnurlTargetUrlOrNull(normalized);
  if (!requestUrl) return null;

  return inferLightningAddressFromRequestUrl(requestUrl);
};

const isLnurlPayRequest = (value: unknown): value is LnurlPayRequest => {
  if (!isJsonRecord(value)) return false;
  return (
    isOptionalString(value.callback) &&
    isOptionalNumber(value.commentAllowed) &&
    isOptionalNumber(value.maxSendable) &&
    isOptionalString(value.metadata) &&
    isOptionalNumber(value.minSendable) &&
    isOptionalString(value.reason) &&
    isOptionalString(value.status) &&
    isOptionalString(value.tag)
  );
};

const isLnurlInvoiceResponse = (
  value: unknown,
): value is LnurlInvoiceResponse => {
  if (!isJsonRecord(value)) return false;
  return (
    isOptionalString(value.paymentRequest) &&
    isOptionalString(value.pr) &&
    isOptionalString(value.reason) &&
    isOptionalString(value.status)
  );
};

const getLnurlpUrlFromLightningAddress = (lightningAddress: string): string => {
  const raw = lightningAddress.trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at === raw.length - 1) {
    throw new Error("Invalid lightning address");
  }

  const user = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  // LNURL-pay well-known endpoint for lightning address.
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;
};

const fetchLnurlJson = async (url: string): Promise<JsonValue> => {
  try {
    return await fetchJson<JsonValue>(url);
  } catch (error) {
    if (typeof window === "undefined") throw error;
    const proxyUrl = `/api/lnurlp?url=${encodeURIComponent(url)}`;
    return await fetchJson<JsonValue>(proxyUrl);
  }
};

export const fetchLnurlInvoiceForTarget = async (
  paymentTarget: string,
  amountSat: number,
  comment?: string,
): Promise<string> => {
  if (!Number.isFinite(amountSat) || amountSat <= 0) {
    throw new Error("Invalid amount");
  }

  const lnurlpUrl = resolveLnurlPayRequestUrl(paymentTarget);
  const payReqJson = await fetchLnurlJson(lnurlpUrl);
  if (!isLnurlPayRequest(payReqJson)) {
    throw new Error("Invalid LNURL pay response");
  }
  const payReq = payReqJson;
  if (String(payReq.status ?? "").toUpperCase() === "ERROR") {
    throw new Error(asNonEmptyString(payReq.reason) ?? "LNURL error");
  }

  const callback = asNonEmptyString(payReq.callback);
  if (!callback) throw new Error("LNURL callback missing");

  const minSendable = Number(payReq.minSendable ?? NaN);
  const maxSendable = Number(payReq.maxSendable ?? NaN);
  if (!Number.isFinite(minSendable) || !Number.isFinite(maxSendable)) {
    throw new Error("LNURL min/max missing");
  }

  const amountMsat = Math.round(amountSat * 1000);
  if (amountMsat < minSendable || amountMsat > maxSendable) {
    throw new Error("Amount out of LNURL range");
  }

  const callbackUrl = new URL(callback);
  callbackUrl.searchParams.set("amount", String(amountMsat));

  const commentAllowed = Number(payReq.commentAllowed ?? 0);
  const rawComment = String(comment ?? "").trim();

  // Some LNURL-pay providers omit/misreport commentAllowed. We try to include
  // a short comment (e.g., user display name) and fall back silently if it
  // causes invoice fetch to fail.
  const canUseComment = rawComment.length > 0;
  const providerAdvertisesComment =
    Number.isFinite(commentAllowed) && commentAllowed > 0;
  const maybeWithCommentUrl = (() => {
    if (!canUseComment) return null;
    const u = new URL(callbackUrl.toString());
    const maxLen = providerAdvertisesComment
      ? Math.max(0, Math.floor(commentAllowed))
      : 140;
    if (maxLen <= 0) return null;
    u.searchParams.set("comment", rawComment.slice(0, maxLen));
    return u.toString();
  })();

  const invoiceJson = await (async () => {
    if (maybeWithCommentUrl && !providerAdvertisesComment) {
      try {
        const withCommentJson = await fetchLnurlJson(maybeWithCommentUrl);
        if (!isLnurlInvoiceResponse(withCommentJson)) {
          throw new Error("Invalid LNURL invoice response");
        }
        return withCommentJson;
      } catch {
        // Retry without comment.
      }
    }
    const fallbackJson = await fetchLnurlJson(callbackUrl.toString());
    if (!isLnurlInvoiceResponse(fallbackJson)) {
      throw new Error("Invalid LNURL invoice response");
    }
    return fallbackJson;
  })();
  if (String(invoiceJson.status ?? "").toUpperCase() === "ERROR") {
    throw new Error(
      asNonEmptyString(invoiceJson.reason) ?? "LNURL invoice error",
    );
  }

  const pr =
    asNonEmptyString(invoiceJson.pr) ??
    asNonEmptyString(invoiceJson.paymentRequest);
  if (!pr) throw new Error("Invoice missing");

  return pr;
};

export const fetchLnurlInvoiceForLightningAddress = async (
  lightningAddress: string,
  amountSat: number,
  comment?: string,
): Promise<string> => {
  return fetchLnurlInvoiceForTarget(lightningAddress, amountSat, comment);
};
