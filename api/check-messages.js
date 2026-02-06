import { createClient } from "@vercel/kv";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const getSharedNostrPool = async () => {
  const { SimplePool } = await import("nostr-tools");
  const pool = new SimplePool();
  return pool;
};

const hexToNpub = async (hex) => {
  const { nip19 } = await import("nostr-tools");
  return nip19.npubEncode(hex);
};

const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
];

export default async function handler(req, res) {
  const isCron = req.headers["x-vercel-cron"] === "1";
  const hasValidSecret = req.query.secret === process.env.CRON_SECRET;

  if (!isCron && !hasValidSecret && process.env.NODE_ENV !== "development") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const keys = await kv.keys("push:sub:*");
    const results = [];

    const pool = await getSharedNostrPool();
    const now = Math.floor(Date.now() / 1000);

    for (const key of keys) {
      try {
        const data = await kv.get(key);
        if (!data) continue;

        const npub = key.replace("push:sub:", "");

        let pubkey;
        try {
          const { nip19 } = await import("nostr-tools");
          const decoded = nip19.decode(npub);
          if (decoded.type !== "npub") continue;
          pubkey = decoded.data;
        } catch {
          continue;
        }

        const relays =
          data.relays.length > 0 ? data.relays.slice(0, 3) : DEFAULT_RELAYS;

        const filter = {
          kinds: [4, 1059],
          "#p": [pubkey],
          since: data.lastCheck,
        };

        const events = await pool.querySync(relays, filter, {
          maxWait: 5000,
        });

        if (events && events.length > 0) {
          const senderPubkeys = [...new Set(events.map((e) => e.pubkey))];

          const senderNames = {};
          for (const senderPubkey of senderPubkeys) {
            try {
              const metaFilter = {
                kinds: [0],
                authors: [senderPubkey],
                limit: 1,
              };
              const metaEvents = await pool.querySync(relays, metaFilter, {
                maxWait: 2000,
              });
              if (metaEvents && metaEvents.length > 0) {
                const content = JSON.parse(metaEvents[0].content);
                senderNames[senderPubkey] =
                  content.display_name || content.name || "Kontakt";
              }
            } catch {
              senderNames[senderPubkey] = "Kontakt";
            }
          }

          const uniqueSenders = Object.values(senderNames);
          const senderText =
            uniqueSenders.length === 1
              ? uniqueSenders[0]
              : `${uniqueSenders.length} kontaktů`;

          const title = `${senderText} píše`;
          const body = `Máš ${events.length} nových zpráv`;

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
