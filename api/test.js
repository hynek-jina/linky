export default function handler(req, res) {
  res.status(200).json({ 
    message: 'API is working',
    secret: req.query.secret === process.env.CRON_SECRET ? 'valid' : 'invalid',
    env: process.env.NODE_ENV || 'unknown'
  });
}
