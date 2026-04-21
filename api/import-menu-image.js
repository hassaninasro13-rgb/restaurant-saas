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
      'You are a menu parser. Extract ALL categories and products from this menu image.',
      'Return ONLY a strict JSON object. No markdown, no comments.',
      'JSON shape: {"categories":[{"name":"string","products":[{"name":"string","price":number}]}]}',
      'CRITICAL RULES FOR CATEGORIES:',
      '- Group products by their FOOD TYPE only.',
      '- If the product is any kind of pizza → category = "Pizza"',
      '- If the product is any kind of sandwich or burger → category = "Sandwich"',
      '- If the product is a main dish (plat) → category = "Plats"',
      '- If the product is a box or meal deal → category = "Box"',
      '- If the product is a dessert or pastry → category = "Desserts"',
      '- If the product is a drink → category = "Boissons"',
      '- NEVER create a category based on size (Medium, Large, Family)',
      '- price must be a number only, no currency',
    ].join(" ");

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        system: 'You are a menu parser. IGNORE all section headers and titles in the image. Your job is to identify the FOOD TYPE of each product and group them. RULES: If a product is pizza (any size, any section) → put it in ONE category called exactly "Pizza" and include the size in the product name. Example: product "3 Saison" from section "Pizza Medium" becomes name: "3 Saison Medium", category: "Pizza". Product "3 Saison" from "Miga Pizza" becomes name: "3 Saison Miga", category: "Pizza". Apply same logic for all food types. Output ONE category per food type only.',
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
    // --- Merge similar categories by food type ---
    const mergeMap = {
      'pizza': 'Pizza',
      'sandwich': 'Sandwich',
      'burger': 'Burger',
      'plat': 'Plats',
      'box': 'Box',
      'boisson': 'Boissons',
      'dessert': 'Desserts',
      'gratin': 'Gratins',
    };
    const merged = {};
    for (const cat of categories) {
      const key = Object.keys(mergeMap).find(k => cat.name.toLowerCase().includes(k)) || cat.name.toLowerCase();
      const finalName = mergeMap[key] || cat.name;
      if (!merged[finalName]) merged[finalName] = { name: finalName, products: [] };
      for (const p of (cat.products || [])) {
        merged[finalName].products.push({
          ...p,
          name: cat.name !== finalName ? `${p.name} (${cat.name})` : p.name
        });
      }
    }
    const mergedCategories = Object.values(merged);
    // --- End merge ---
    return res.status(200).json({ categories: mergedCategories });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'server_error' });
  }
}
