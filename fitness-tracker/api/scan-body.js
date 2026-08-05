const Anthropic = require('@anthropic-ai/sdk');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You read numbers off photos of bathroom scale displays, smart scale companion apps, or body composition scanner screens/printouts. Respond with ONLY a JSON object (no markdown fences, no explanation) matching this exact shape:
{"weightLb": number|null, "bodyFatPct": number|null, "heartRate": number|null, "muscleMass": number|null, "fatFreeWeight": number|null, "skeletalMuscle": number|null, "subcutaneousFat": number|null, "bodyWater": number|null, "boneMass": number|null, "protein": number|null, "bmr": number|null, "visceralFat": number|null, "metabolicAge": number|null}
Field meanings: weightLb/muscleMass/fatFreeWeight/boneMass are in pounds (convert from kg using 1 kg = 2.20462 lb if shown in kg); bodyFatPct/skeletalMuscle/subcutaneousFat/bodyWater/protein are percentages; heartRate is in bpm; bmr is in kcal; visceralFat and metabolicAge are the plain numbers/ratings the scale shows (no unit conversion). Match each field to whichever label the screen uses (e.g. "Skeletal Muscles" -> skeletalMuscle, "Fat-Free Body Weight" -> fatFreeWeight). Do not compute or return a "bmi" value even if the screen shows one — omit it; the app calculates its own. If a field truly cannot be read or isn't shown on this particular screen, use null for it rather than guessing.
IMPORTANT: If the image is a photo of a person rather than a display/screen showing numbers, return every field as null. Never visually estimate body composition from how someone looks in a photo — only read digits that are actually printed or displayed.`;

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
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Read all the measurements shown on this display and return the JSON.' }
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
      bodyFatPct: numOrNull(parsed.bodyFatPct),
      heartRate: numOrNull(parsed.heartRate),
      muscleMass: numOrNull(parsed.muscleMass),
      fatFreeWeight: numOrNull(parsed.fatFreeWeight),
      skeletalMuscle: numOrNull(parsed.skeletalMuscle),
      subcutaneousFat: numOrNull(parsed.subcutaneousFat),
      bodyWater: numOrNull(parsed.bodyWater),
      boneMass: numOrNull(parsed.boneMass),
      protein: numOrNull(parsed.protein),
      bmr: numOrNull(parsed.bmr),
      visceralFat: numOrNull(parsed.visceralFat),
      metabolicAge: numOrNull(parsed.metabolicAge)
    });
  } catch (err) {
    console.error('Body scan error', err);
    res.status(500).json({ error: 'Scan failed' });
  }
};
