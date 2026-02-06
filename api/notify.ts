import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { createClient } = await import('@vercel/kv');
    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    webpush.setVapidDetails(
      'mailto:admin@linky.app',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || ''
    );

    const { npub, payload } = req.body;

    if (!npub?.startsWith('npub1')) {
      return res.status(400).json({ error: 'Invalid npub' });
    }

    const data = await kv.get<any>(`push:sub:${npub}`);
    if (!data) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const pushPayload = JSON.stringify({
      title: payload?.title || 'Nová zpráva',
      body: payload?.body || 'Máš novou zprávu v Linky',
      data: payload?.data || { type: 'dm' },
    });

    await webpush.sendNotification(data.subscription, pushPayload);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      const { npub } = req.body;
      const { createClient } = await import('@vercel/kv');
      const kv = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      await kv.del(`push:sub:${npub}`);
      return res.status(410).json({ error: 'Subscription expired' });
    }
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
