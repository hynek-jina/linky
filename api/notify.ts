import { createClient } from "@vercel/kv";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  "mailto:admin@linky.app",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

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

type NotificationPayload = {
  title: string;
  body: string;
  data?: {
    type: string;
    contactNpub?: string;
  };
};

const isValidNpub = (npub: string): boolean => {
  if (!npub || typeof npub !== "string") return false;
  if (!npub.startsWith("npub1")) return false;
  if (npub.length < 20) return false;
  return true;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { npub, payload } = req.body as {
      npub: string;
      payload: NotificationPayload;
    };

    if (!isValidNpub(npub)) {
      res.status(400).json({ error: "Invalid npub" });
      return;
    }

    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    // Get subscription from KV
    const data = await kv.get<SubscriptionData>(`push:sub:${npub}`);

    if (!data) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    // Send push notification
    const pushPayload = JSON.stringify({
      title: payload.title || "Nová zpráva",
      body: payload.body || "Máš novou zprávu v Linky",
      data: payload.data || { type: "dm" },
    });

    try {
      await webpush.sendNotification(data.subscription, pushPayload);
      res.status(200).json({ success: true });
    } catch (error) {
      // If push fails (e.g., subscription expired), delete it
      const webPushError = error as { statusCode?: number };
      if (webPushError.statusCode === 404 || webPushError.statusCode === 410) {
        await kv.del(`push:sub:${npub}`);
        res.status(410).json({ error: "Subscription expired" });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error("Push notify error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
