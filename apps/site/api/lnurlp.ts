import {
  getFirstQueryValue,
  parseJsonObject,
  sendProxyFailure,
  sendProxyResult,
  type ApiRequest,
  type ApiResponse,
} from "./_npubcash.js";
import { isAllowedTarget, safeFetch } from "./_safeFetch.js";

const LIGHTNING_ADDRESS_PATTERN = /^[^@\s/:]+@[^@\s/:]+\.[^@\s/:]+$/;
const MILLISAT_AMOUNT_PATTERN = /^\d{1,15}$/;
const MAX_COMMENT_LENGTH = 1000;

const getLnurlpEndpoint = (lightningAddress: string): URL | null => {
  if (!LIGHTNING_ADDRESS_PATTERN.test(lightningAddress)) return null;
  const atIndex = lightningAddress.lastIndexOf("@");
  const user = lightningAddress.slice(0, atIndex);
  const domain = lightningAddress.slice(atIndex + 1);
  const endpoint = new URL(
    `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`,
  );
  return isAllowedTarget(endpoint) ? endpoint : null;
};

const readCallbackUrl = (payRequestText: string): URL | null => {
  const callback = parseJsonObject(payRequestText)?.callback;
  if (typeof callback !== "string") return null;
  try {
    const url = new URL(callback);
    return isAllowedTarget(url) ? url : null;
  } catch {
    return null;
  }
};

// Same-origin helper for `/cashu/`: it performs the LNURL-pay hops itself so the
// only URLs ever fetched are the address's well-known endpoint, the callback
// that endpoint returned, and redirects of those that pass the same checks.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  const address = getFirstQueryValue(req.query?.address)?.toLowerCase();
  const endpoint = address ? getLnurlpEndpoint(address) : null;
  if (!endpoint) {
    res.status(400).json({ error: "Invalid lightning address" });
    return;
  }

  const amount = getFirstQueryValue(req.query?.amount);
  if (amount && !MILLISAT_AMOUNT_PATTERN.test(amount)) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }

  try {
    const payRequest = await safeFetch(endpoint);
    if (!amount) {
      sendProxyResult(res, payRequest);
      return;
    }

    const callback = readCallbackUrl(payRequest.text);
    if (!callback) {
      res.status(502).json({ error: "LNURL callback missing or not allowed" });
      return;
    }

    callback.searchParams.set("amount", amount);
    const comment = getFirstQueryValue(req.query?.comment);
    if (comment) {
      callback.searchParams.set(
        "comment",
        comment.slice(0, MAX_COMMENT_LENGTH),
      );
    }
    sendProxyResult(res, await safeFetch(callback));
  } catch (error) {
    sendProxyFailure(res, error);
  }
}
