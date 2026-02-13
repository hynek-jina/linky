const isSafeUrl = (value: string): boolean => {
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  if (value.length > 2000) return false;
  return true;
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

    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();
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
