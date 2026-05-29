interface ApiRequest {
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => {
    json: (body: Record<string, unknown>) => void;
    send: (body: string) => void;
  };
  setHeader: (name: string, value: string) => void;
}

interface ProxyResult {
  status: number;
  text: string;
  contentType: string | null;
}

const defaultNpubcashBaseUrl = "https://npub.linky.fit";

export const getFirstQueryValue = (
  value: string | string[] | undefined,
): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first !== "string") {
      return null;
    }
    const trimmed = first.trim();
    return trimmed ? trimmed : null;
  }

  return null;
};

export const getNpubcashBaseUrl = (): URL => {
  const rawValue = String(
    process.env.NPUBCASH_BASE_URL ?? defaultNpubcashBaseUrl,
  ).trim();

  try {
    return new URL(rawValue);
  } catch {
    return new URL(defaultNpubcashBaseUrl);
  }
};

export const getPublicOrigin = (req: ApiRequest): string => {
  const hostHeader = getFirstQueryValue(req.headers?.host);
  const forwardedProto = getFirstQueryValue(req.headers?.["x-forwarded-proto"]);
  const protocol = forwardedProto ?? "https";
  const host = hostHeader ?? "linky.fit";
  return `${protocol}://${host}`;
};

export const proxyFixedUrl = async (targetUrl: URL): Promise<ProxyResult> => {
  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type"),
  };
};

export const applyProxyHeaders = (
  res: ApiResponse,
  contentType: string | null,
): void => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
};

export type { ApiRequest, ApiResponse };
