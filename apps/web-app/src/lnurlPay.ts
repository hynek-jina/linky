import { fetchJson } from "./utils/http";
import { asNonEmptyString } from "./utils/validation";
import type { JsonRecord, JsonValue } from "./types/json";

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

export const fetchLnurlInvoiceForLightningAddress = async (
  lightningAddress: string,
  amountSat: number,
  comment?: string,
): Promise<string> => {
  if (!Number.isFinite(amountSat) || amountSat <= 0) {
    throw new Error("Invalid amount");
  }

  const lnurlpUrl = getLnurlpUrlFromLightningAddress(lightningAddress);
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
