import {
  applyProxyHeaders,
  getFirstQueryValue,
  getNpubcashBaseUrl,
  getPublicOrigin,
  proxyFixedUrl,
  type ApiRequest,
  type ApiResponse,
} from "../_npubcash.js";

interface LnurlPayResponse {
  callback?: unknown;
}

const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const rewriteLnurlCallback = (
  payload: Record<string, unknown>,
  publicOrigin: string,
  user: string,
): string => {
  const nextPayload: LnurlPayResponse = { ...payload };
  nextPayload.callback = `${publicOrigin}/.well-known/lnurlp/${encodeURIComponent(user)}`;
  return JSON.stringify(nextPayload);
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const user = getFirstQueryValue(req.query?.user);
    if (!user) {
      res.status(400).json({ error: "Missing user" });
      return;
    }

    const targetUrl = new URL(
      `/.well-known/lnurlp/${encodeURIComponent(user)}`,
      getNpubcashBaseUrl(),
    );

    const amount = getFirstQueryValue(req.query?.amount);
    const nostr = getFirstQueryValue(req.query?.nostr);
    if (amount) {
      targetUrl.searchParams.set("amount", amount);
    }
    if (nostr) {
      targetUrl.searchParams.set("nostr", nostr);
    }

    const proxyResult = await proxyFixedUrl(targetUrl);
    applyProxyHeaders(res, proxyResult.contentType);

    const shouldRewriteCallback = !amount;
    if (!shouldRewriteCallback) {
      res.status(proxyResult.status).send(proxyResult.text);
      return;
    }

    const payload = parseJsonObject(proxyResult.text);
    if (!payload) {
      res.status(proxyResult.status).send(proxyResult.text);
      return;
    }

    const rewrittenPayload = rewriteLnurlCallback(
      payload,
      getPublicOrigin(req),
      user,
    );
    res.status(proxyResult.status).send(rewrittenPayload);
  } catch (error) {
    res.status(502).json({
      error: "Proxy fetch failed",
      detail: String(error ?? "unknown"),
    });
  }
}
