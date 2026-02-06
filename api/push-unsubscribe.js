import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const isValidNpub = (npub) => {
  if (!npub || typeof npub !== "string") return false;
  if (!npub.startsWith("npub1")) return false;
  if (npub.length < 20) return false;
  return true;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { npub } = req.body;

    if (!isValidNpub(npub)) {
      res.status(400).json({ error: "Invalid npub" });
      return;
    }

    await kv.del(`push:sub:${npub}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
