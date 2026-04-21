export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'missing_anthropic_api_key' });
  try {
    const { image_base64, image_mime_type } = req.body || {};
    if (!image_base64 || !image_mime_type) return res.status(400).json({ error: 'missing_image_payload' });
    const prompt = 'Extract ALL products from this menu image and return ONLY a JSON object. Shape: {"categories":[{"name":"string","products":[{"name":"string","price":number}]}]}. No markdown, no comments, numbers only for price.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1800,
        system: 'You are a menu parser. RULE: All pizza types regardless of size or name (Pizza Medium, Miga Pizza, etc.) must go into ONE single category named exactly "Pizza". Apply same logic for other food types.',
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image_mime_type, data: image_base64 } }, { type: 'text', text: prompt }] }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'anthropic_error' });
    const text = (data?.content || []).filter(c => c?.type === 'text').map(c => c?.text || '').join('\n').trim();
    let parsed = { categories: [] };
    try { parsed = JSON.parse(text); } catch {
      const s = text.indexOf('{'); const e = text.lastIndexOf('}');
      if (s >= 0 && e > s) parsed = JSON.parse(text.slice(s, e + 1));
    }
    const raw = Array.isArray(parsed?.categories) ? parsed.categories : [];
    const map = { pizza: 'Pizza', sandwich: 'Sandwich', burger: 'Burger', plat: 'Plats', box: 'Box', boisson: 'Boissons', dessert: 'Desserts' };
    const merged = {};
    for (const cat of raw) {
      const lower = cat.name.toLowerCase();
      const key = Object.keys(map).find(k => lower.includes(k));
      const name = key ? map[key] : cat.name;
      if (!merged[name]) merged[name] = { name, products: [] };
      for (const p of (cat.products || [])) {
        merged[name].products.push({ ...p, name: key ? `${p.name} (${cat.name})` : p.name });
      }
    }
    return res.status(200).json({ categories: Object.values(merged) });
  } catch (err) { return res.status(500).json({ error: err?.message || 'server_error' }); }
}
