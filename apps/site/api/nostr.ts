import {
  applyProxyHeaders,
  getFirstQueryValue,
  getNpubcashBaseUrl,
  proxyFixedUrl,
  type ApiRequest,
  type ApiResponse,
} from "./_npubcash.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const targetUrl = new URL("/.well-known/nostr.json", getNpubcashBaseUrl());
    const name = getFirstQueryValue(req.query?.name);
    if (name) {
      targetUrl.searchParams.set("name", name);
    }

    const proxyResult = await proxyFixedUrl(targetUrl);
    applyProxyHeaders(res, proxyResult.contentType);
    res.status(proxyResult.status).send(proxyResult.text);
  } catch (error) {
    res.status(502).json({
      error: "Proxy fetch failed",
      detail: String(error ?? "unknown"),
    });
  }
}
