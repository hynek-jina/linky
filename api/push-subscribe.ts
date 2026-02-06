import { createClient } from "@vercel/kv";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

type PushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type SubscriptionData = {
  subscription: PushSubscription;
  relays: string[];
  lastCheck: number;
  updatedAt: number;
};

const isValidNpub = (npub: string): boolean => {
  if (!npub || typeof npub !== "string") return false;
  if (!npub.startsWith("npub1")) return false;
  if (npub.length < 20) return false;
  return true;
};

const isValidSubscription = (sub: unknown): sub is PushSubscription => {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as Record<string, unknown>;
  if (typeof s.endpoint !== "string") return false;
  if (!s.keys || typeof s.keys !== "object") return false;
  const keys = s.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string") return false;
  if (typeof keys.auth !== "string") return false;
  return true;
};

const isValidRelays = (relays: unknown): relays is string[] => {
  if (!Array.isArray(relays)) return false;
  return relays.every(
    (r) => typeof r === "string" && r.startsWith("wss://")
  );
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const data: SubscriptionData = {
      subscription,
      relays: relays.slice(0, 3), // Max 3 relays
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
