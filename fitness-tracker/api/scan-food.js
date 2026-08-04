const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const LABEL_SYSTEM_PROMPT = `You read nutrition facts labels from photos. Respond with ONLY a JSON object (no markdown fences, no explanation) matching this exact shape:
{"name": string|null, "calories": number|null, "protein": number|null, "carbs": number|null, "fat": number|null, "creatine": number|null}
Use the values for ONE serving as printed on the label. "name" is your best guess at the food/product name if visible, otherwise null. "creatine" is grams of creatine (e.g. creatine monohydrate) per serving — most food labels won't list this, so leave it null unless the label explicitly shows a creatine amount (common on supplement tubs). If a field truly cannot be read, use null for it rather than guessing. If the image isn't a nutrition label at all, return all nulls.`;

const MEAL_SYSTEM_PROMPT = `You estimate the nutritional content of a meal from a photo of the food itself (not a label — there are no printed numbers to read). Respond with ONLY a JSON object (no markdown fences, no explanation) matching this exact shape:
{"name": string|null, "calories": number|null, "protein": number|null, "carbs": number|null, "fat": number|null, "creatine": null}
Judge apparent ingredients, portion size, and likely preparation (fried, grilled, sauced, dressed, etc.) to give your best-effort estimate for the WHOLE portion shown in the photo, not a "per serving" amount. This is inherently a rough guess, not a precise reading — use reasonable typical-restaurant-portion judgment, and don't be afraid to give a number even if uncertain. "creatine" is always null since it can't be visually estimated. "name" is your best guess at what the dish is, otherwise null. If the image doesn't show food at all, return all nulls.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Server is not configured with an ANTHROPIC_API_KEY' });
    return;
  }

  const { image, mode } = req.body || {};
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
  const isMealMode = mode === 'meal';

  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      system: isMealMode ? MEAL_SYSTEM_PROMPT : LABEL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: isMealMode ? 'Estimate this meal\'s nutrition and return the JSON.' : 'Read this nutrition facts label and return the JSON.' }
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
      name: typeof parsed.name === 'string' ? parsed.name : null,
      calories: numOrNull(parsed.calories),
      protein: numOrNull(parsed.protein),
      carbs: numOrNull(parsed.carbs),
      fat: numOrNull(parsed.fat),
      creatine: numOrNull(parsed.creatine)
    });
  } catch (err) {
    console.error('Food scan error', err);
    res.status(500).json({ error: 'Scan failed' });
  }
};
