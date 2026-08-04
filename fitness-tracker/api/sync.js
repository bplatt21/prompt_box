const { createClient } = require('redis');

const CODE_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const TTL_SECONDS = 60 * 60 * 24 * 365;

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Redis client error', err));
    clientPromise = client.connect().then(() => client).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const code = req.method === 'GET' ? req.query.code : (req.body && req.body.code);

  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
    res.status(400).json({ error: 'Invalid sync code' });
    return;
  }

  const key = `fitness-sync:${code}`;

  try {
    const client = await getClient();

    if (req.method === 'GET') {
      const raw = await client.get(key);
      if (!raw) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).send(raw);
      return;
    }

    const { data, updatedAt } = req.body || {};
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Missing data' });
      return;
    }
    const payload = JSON.stringify({ data, updatedAt: updatedAt || Date.now() });
    await client.set(key, payload, { EX: TTL_SECONDS });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Sync API error', err);
    res.status(500).json({ error: 'Server error' });
  }
};
