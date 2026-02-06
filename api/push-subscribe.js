import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const { npub, subscription, relays } = req.body;

    if (!npub?.startsWith('npub1') || npub.length < 20) {
      return res.status(400).json({ error: 'Invalid npub' });
    }

    await kv.set(`push:sub:${npub}`, {
      subscription,
      relays: relays?.slice(0, 3) || [],
      lastCheck: Math.floor(Date.now() / 1000),
      updatedAt: Date.now(),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
