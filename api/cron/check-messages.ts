import { createClient } from "@vercel/kv";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Filter, Event as NostrToolsEvent } from "nostr-tools";

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

type NostrPool = {
  querySync: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { maxWait: number }
  ) => Promise<unknown>;
};

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getSharedNostrPool = async (): Promise<NostrPool> => {
  const { SimplePool } = await import("nostr-tools");
  const pool = new SimplePool();
  return pool as unknown as NostrPool;
};

const hexToNpub = async (hex: string): Promise<string> => {
  const { nip19 } = await import("nostr-tools");
  return nip19.npubEncode(hex);
};

// Default relays if user has none configured
const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron job request (Vercel sends specific headers)
  // Or verify secret for manual triggers
  const isCron = req.headers["x-vercel-cron"] === "1";
  const hasValidSecret = req.query.secret === process.env.CRON_SECRET;

  if (!isCron && !hasValidSecret && process.env.NODE_ENV !== "development") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Get all subscription keys from KV
    const keys = await kv.keys("push:sub:*");
    const results: Array<
      | { npub: string; newMessages: number; notifySuccess: boolean }
      | { key: string; error: string }
    > = [];

    const pool = await getSharedNostrPool();
    const now = Math.floor(Date.now() / 1000);

    for (const key of keys) {
      try {
        const data = await kv.get<SubscriptionData>(key);
        if (!data) continue;

        // Extract npub from key (push:sub:<npub>)
        const npub = key.replace("push:sub:", "");

        // Decode npub to hex pubkey for query
        let pubkey: string;
        try {
          const { nip19 } = await import("nostr-tools");
          type DecodeResult = { type: string; data: unknown };
          const decoded = nip19.decode(npub) as DecodeResult;
          if (decoded.type !== "npub") continue;
          pubkey = decoded.data as string;
        } catch {
          continue;
        }

        // Use user's relays or defaults
        const relays =
          data.relays.length > 0 ? data.relays.slice(0, 3) : DEFAULT_RELAYS;

        // Query for new DM events (kind 4 or 1059/1060 for gift wrap)
        // Check both direct DMs and gift wraps
        const filter: Filter = {
          kinds: [4, 1059],
          "#p": [pubkey],
          since: data.lastCheck,
        };

        const events = (await pool.querySync(relays, filter, {
          maxWait: 5000,
        })) as NostrToolsEvent[];

        if (events && events.length > 0) {
          // Get unique sender pubkeys
          const senderPubkeys = [...new Set(events.map((e) => e.pubkey))];

          // Get sender names from metadata events (kind 0)
          const senderNames: Record<string, string> = {};
          for (const senderPubkey of senderPubkeys) {
            try {
              const metaFilter: Filter = {
                kinds: [0],
                authors: [senderPubkey],
                limit: 1,
              };
              const metaEvents = (await pool.querySync(relays, metaFilter, {
                maxWait: 2000,
              })) as NostrToolsEvent[];
              if (metaEvents && metaEvents.length > 0) {
                const content = JSON.parse(metaEvents[0].content);
                senderNames[senderPubkey] =
                  content.display_name || content.name || "Kontakt";
              }
            } catch {
              senderNames[senderPubkey] = "Kontakt";
            }
          }

          // Build notification payload
          const uniqueSenders = Object.values(senderNames);
          const senderText =
            uniqueSenders.length === 1
              ? uniqueSenders[0]
              : `${uniqueSenders.length} kontaktů`;

          const title = `${senderText} píše`;
          const body = `Máš ${events.length} novou$ events.length === 1 ? "" : events.length < 5 ? " zprávy" : " zpráv"}`;

          // Call notify endpoint to send push
          const notifyUrl = `${process.env.VERCEL_URL || "http://localhost:3000"}/api/notify`;
          const notifyResponse = await fetch(notifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              npub,
              payload: {
                title,
                body,
                data: {
                  type: "dm",
                  contactNpub: await hexToNpub(events[0].pubkey),
                },
              },
            }),
          });

          results.push({
            npub,
            newMessages: events.length,
            notifySuccess: notifyResponse.ok,
          });

          // Update last check timestamp
          await kv.set(key, {
            ...data,
            lastCheck: now,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error(`Error processing subscription ${key}:`, error);
        results.push({ key, error: String(error) });
      }
    }

    res.status(200).json({
      processed: keys.length,
      results,
    });
  } catch (error) {
    console.error("Cron check messages error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
