const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512_000;

const isSafeUrl = (value: string): boolean => {
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  if (value.length > 2000) return false;
  return true;
};

const readResponseText = async (response: Response): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error("Proxy response is too large");
  }

  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Proxy response is too large");
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

export default async function handler(
  req: { query?: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => {
      json: (body: Record<string, unknown>) => void;
      send: (body: string) => void;
    };
    setHeader: (name: string, value: string) => void;
  },
) {
  try {
    const raw = Array.isArray(req.query?.url)
      ? req.query.url[0]
      : req.query?.url;
    const target = String(raw ?? "").trim();

    if (!isSafeUrl(target)) {
      res.status(400).json({ error: "Invalid url" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    let text: string;
    try {
      response = await fetch(target, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      text = await readResponseText(response);
    } finally {
      clearTimeout(timeout);
    }
    const contentType = response.headers.get("content-type");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    if (contentType) res.setHeader("Content-Type", contentType);

    res.status(response.status).send(text);
  } catch (error) {
    res.status(502).json({
      error: "Proxy fetch failed",
      detail: String(error ?? "unknown"),
    });
  }
}
