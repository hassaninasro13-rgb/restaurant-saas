export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'missing_anthropic_api_key' });
  }

  try {
    const { image_base64, image_mime_type } = req.body || {};
    if (!image_base64 || !image_mime_type) {
      return res.status(400).json({ error: 'missing_image_payload' });
    }

    const prompt = [
      'Extract menu categories and products from this image.',
      'Return strict JSON object only (no markdown, no comments).',
      'JSON shape must be exactly: {"categories":[{"name":"string","products":[{"name":"string","price":number}]}]}',
      'Keep categories separated correctly, price as plain number only.',
    ].join(' ');

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1800,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image_mime_type,
                  data: image_base64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data?.error?.message || 'anthropic_error' });
    }

    const text = (data?.content || [])
      .filter((c) => c?.type === 'text')
      .map((c) => c?.text || '')
      .join('\n')
      .trim();

    let parsed = { categories: [] };
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(text.slice(start, end + 1));
      }
    }

    const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    return res.status(200).json({ categories });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'server_error' });
  }
}
