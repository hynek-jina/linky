import { createClient } from '@vercel/kv';
import { SimplePool, nip19 } from 'nostr-tools';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:admin@linky.app',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export default async function handler(req, res) {
  const isCron = req.headers['x-vercel-cron'] === '1';
  const hasValidSecret = req.query.secret === process.env.CRON_SECRET;

  if (!isCron && !hasValidSecret && process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const keys = await kv.keys('push:sub:*');
    const results = [];

    const pool = new SimplePool();
    const now = Math.floor(Date.now() / 1000);

    const DEFAULT_RELAYS = [
      'wss://nos.lol',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
    ];

    for (const key of keys) {
      try {
        const data = await kv.get(key);
        if (!data) continue;

        const npub = key.replace('push:sub:', '');

        let pubkey;
        try {
          const decoded = nip19.decode(npub);
          if (decoded.type !== 'npub') continue;
          pubkey = decoded.data;
        } catch {
          continue;
        }

        const relays = data.relays?.length > 0 ? data.relays.slice(0, 3) : DEFAULT_RELAYS;

        const events = await pool.querySync(relays, {
          kinds: [4, 1059],
          '#p': [pubkey],
          since: data.lastCheck || 0,
        }, { maxWait: 5000 });

        if (events && events.length > 0) {
          // Send notification
          const pushPayload = JSON.stringify({
            title: 'Nová zpráva',
            body: `Máš ${events.length} nových zpráv`,
            data: { type: 'dm', contactNpub: npub },
          });

          try {
            await webpush.sendNotification(data.subscription, pushPayload);
            results.push({ npub, newMessages: events.length, notified: true });
          } catch (pushError) {
            if (pushError.statusCode === 404 || pushError.statusCode === 410) {
              await kv.del(key);
              results.push({ npub, error: 'Subscription expired' });
            } else {
              throw pushError;
            }
          }

          await kv.set(key, {
            ...data,
            lastCheck: now,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error('Error:', error);
        results.push({ key, error: String(error) });
      }
    }

    return res.status(200).json({ processed: keys.length, results });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
