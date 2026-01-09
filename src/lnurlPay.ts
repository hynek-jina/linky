import { fetchJson } from "./utils/http";
import { asNonEmptyString } from "./utils/validation";

type LnurlPayRequest = {
  tag?: string;
  callback?: string;
  minSendable?: number;
  maxSendable?: number;
  metadata?: string;
  status?: string;
  reason?: string;
};

type LnurlInvoiceResponse = {
  pr?: string;
  paymentRequest?: string;
  status?: string;
  reason?: string;
};

const getLnurlpUrlFromLightningAddress = (
  lightningAddress: string
): string => {
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

export const fetchLnurlInvoiceForLightningAddress = async (
  lightningAddress: string,
  amountSat: number
): Promise<string> => {
  if (!Number.isFinite(amountSat) || amountSat <= 0) {
    throw new Error("Invalid amount");
  }

  const lnurlpUrl = getLnurlpUrlFromLightningAddress(lightningAddress);
  const payReq = await fetchJson<LnurlPayRequest>(lnurlpUrl);
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

  const invoiceJson = await fetchJson<LnurlInvoiceResponse>(
    callbackUrl.toString()
  );
  if (String(invoiceJson.status ?? "").toUpperCase() === "ERROR") {
    throw new Error(
      asNonEmptyString(invoiceJson.reason) ?? "LNURL invoice error"
    );
  }

  const pr =
    asNonEmptyString(invoiceJson.pr) ??
    asNonEmptyString(invoiceJson.paymentRequest);
  if (!pr) throw new Error("Invoice missing");

  return pr;
};
