const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You read numbers off photos of bathroom scale displays, smart scale companion apps, or body composition scanner screens/printouts. Respond with ONLY a JSON object (no markdown fences, no explanation) matching this exact shape:
{"weightLb": number|null, "bodyFatPct": number|null}
If the display shows weight in kilograms, convert it to pounds (1 kg = 2.20462 lb) before returning it. If a field truly cannot be read, use null for it rather than guessing.
IMPORTANT: If the image is a photo of a person rather than a display/screen showing numbers, return both fields as null. Never visually estimate body composition from how someone looks in a photo — only read digits that are actually printed or displayed.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is not configured with an ANTHROPIC_API_KEY' });
    return;
  }

  const { image } = req.body || {};
  if (typeof image !== 'string') {
    res.status(400).json({ error: 'Missing image' });
    return;
  }

  const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: 'Expected a base64 image data URL' });
    return;
  }
  const [, mediaType, base64Data] = match;

  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Read the weight and/or body fat % off this display and return the JSON.' }
        ]
      }]
    });

    const textBlock = message.content.find(c => c.type === 'text');
    const text = textBlock ? textBlock.text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (parseErr) {
      console.error('Failed to parse model output as JSON:', text);
      res.status(502).json({ error: 'Could not parse scan result' });
      return;
    }

    const numOrNull = (v) => (typeof v === 'number' && !isNaN(v) ? v : null);
    res.status(200).json({
      weightLb: numOrNull(parsed.weightLb),
      bodyFatPct: numOrNull(parsed.bodyFatPct)
    });
  } catch (err) {
    console.error('Body scan error', err);
    res.status(500).json({ error: 'Scan failed' });
  }
};
