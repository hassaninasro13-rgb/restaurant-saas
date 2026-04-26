export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'missing_anthropic_api_key' });
  try {
    const { image_base64, image_mime_type } = req.body || {};
    if (!image_base64 || !image_mime_type) return res.status(400).json({ error: 'missing_image_payload' });
    const prompt = 'Extract all categories and products from the menu image.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        system: 'You are a menu parser. Extract all categories and products from the menu image.\nSTRICT RULES:\n1. Every visual section header = ONE separate category (e.g. Pizza Medium, Miga Pizza, Pizza L are THREE separate categories, NOT subcategories)\n2. Every item listed under a section header = one product inside that category\n3. Clean ALL names: remove any parentheses and content inside them, trim extra spaces\n4. ingredients = comma-separated string of all ingredients listed, empty string if none\n5. price = number only, no currency symbol\n6. category_order starts at 0 and increases by 1\n7. product_order starts at 0 within each category\n8. If you find Supplément section, create separate category named Suppléments\nReturn ONLY valid JSON, no markdown, no backticks:\n{categories:[{name:string,category_order:number,products:[{name:string,price:number,ingredients:string,product_order:number}]}]}',
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
    const cleanName = (name = '') => name.replace(/\s*\(.*?\)\s*/g, '').trim();
    const categories = raw.map((cat, i) => ({
      name: cleanName(cat.name),
      category_order: cat.category_order ?? i,
      products: (cat.products || []).map((p, j) => ({
        name: cleanName(p.name),
        price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 0,
        ingredients: p.ingredients || '',
        product_order: p.product_order ?? j
      }))
    }));
    return res.status(200).json({ categories });
  } catch (err) { return res.status(500).json({ error: err?.message || 'server_error' }); }
}
