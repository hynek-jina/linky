import {
  getFirstQueryValue,
  getNpubcashBaseUrl,
  proxyFixedUrl,
  sendProxyFailure,
  sendPublicProxyResult,
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

    sendPublicProxyResult(res, await proxyFixedUrl(targetUrl));
  } catch (error) {
    sendProxyFailure(res, error);
  }
}
