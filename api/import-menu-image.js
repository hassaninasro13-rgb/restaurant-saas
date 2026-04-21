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
      'Extract menu categories and their items from this image.',
      'Return strict JSON only (no markdown, no comments).',
      'Use this exact shape: {"categories":[{"name":"string","products":[{"name":"string","price":number}]}]}',
      'Price must be a plain number without currency symbol.',
      'If an item has no category, group it under a category named "Other".',
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

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ }
      }
    }

    const rawCategories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    const mergeMap = {
      'pizza': 'Pizza',
      'sandwich': 'Sandwich',
      'burger': 'Burger',
      'plat': 'Plats',
      'box': 'Box',
      'boisson': 'Boissons',
      'dessert': 'Desserts',
    };
    const merged = {};
    for (const cat of rawCategories) {
      const lower = cat.name.toLowerCase();
      const key = Object.keys(mergeMap).find(k => lower.includes(k));
      const finalName = key ? mergeMap[key] : cat.name;
      if (!merged[finalName]) merged[finalName] = { name: finalName, products: [] };
      for (const p of (cat.products || [])) {
        merged[finalName].products.push({ ...p, name: key && finalName !== cat.name ? `${p.name} (${cat.name})` : p.name });
      }
    }
    const categories = Object.values(merged);
    return res.status(200).json({ categories });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'server_error' });
  }
}
