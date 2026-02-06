import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const isCron = req.headers['x-vercel-cron'] === '1';
  const hasValidSecret = req.query.secret === process.env.CRON_SECRET;

  if (!isCron && !hasValidSecret && process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Import modules dynamically
    const [{ createClient }, { SimplePool }, { nip19 }] = await Promise.all([
      import('@vercel/kv'),
      import('nostr-tools'),
      import('nostr-tools')
    ]);

    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const keys = await kv.keys('push:sub:*');
    const results: any[] = [];

    const pool = new SimplePool();
    const now = Math.floor(Date.now() / 1000);

    const DEFAULT_RELAYS = [
      'wss://nos.lol',
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
    ];

    for (const key of keys) {
      try {
        const data = await kv.get<any>(key);
        if (!data) continue;

        const npub = key.replace('push:sub:', '');

        let pubkey: string;
        try {
          const decoded = nip19.decode(npub);
          if (decoded.type !== 'npub') continue;
          pubkey = decoded.data as string;
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
          results.push({ npub, newMessages: events.length, notified: true });

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
