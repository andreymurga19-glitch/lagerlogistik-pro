// Updated: 20260609-fallback
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt' });

  const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash'
  ];

  async function tryModel(model) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512,
            ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {})
          }
        })
      }
    );
    const data = await response.json();
    if (!response.ok) {
      const msg = data.error?.message || '';
      // Якщо overloaded або 503 - пробуємо наступну модель
      if (msg.includes('high demand') || msg.includes('overloaded') || response.status === 503 || response.status === 429) {
        return null;
      }
      throw new Error('Gemini: ' + msg);
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  }

  try {
    for (const model of MODELS) {
      const result = await tryModel(model);
      if (result !== null) {
        return res.status(200).json({ text: result });
      }
    }
    return res.status(200).json({ error: 'Gemini: всі моделі перевантажені. Спробуй через хвилину.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
