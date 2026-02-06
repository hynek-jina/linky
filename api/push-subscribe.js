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

const isValidSubscription = (sub) => {
  if (!sub || typeof sub !== "object") return false;
  if (typeof sub.endpoint !== "string") return false;
  if (!sub.keys || typeof sub.keys !== "object") return false;
  if (typeof sub.keys.p256dh !== "string") return false;
  if (typeof sub.keys.auth !== "string") return false;
  return true;
};

const isValidRelays = (relays) => {
  if (!Array.isArray(relays)) return false;
  return relays.every(
    (r) => typeof r === "string" && r.startsWith("wss://")
  );
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { npub, subscription, relays } = req.body;

    if (!isValidNpub(npub)) {
      res.status(400).json({ error: "Invalid npub" });
      return;
    }

    if (!isValidSubscription(subscription)) {
      res.status(400).json({ error: "Invalid subscription" });
      return;
    }

    if (!isValidRelays(relays)) {
      res.status(400).json({ error: "Invalid relays" });
      return;
    }

    const data = {
      subscription,
      relays: relays.slice(0, 3),
      lastCheck: Math.floor(Date.now() / 1000),
      updatedAt: Date.now(),
    };

    await kv.set(`push:sub:${npub}`, data);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
