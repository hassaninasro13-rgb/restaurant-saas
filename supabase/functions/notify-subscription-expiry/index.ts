import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function ownerEmailForRestaurant(restaurantId: string) {
  const { data: owner } = await admin
    .from('restaurant_users')
    .select('user_id, email')
    .eq('restaurant_id', restaurantId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!owner) return null;
  if (owner.user_id) {
    const { data } = await admin.auth.admin.getUserById(owner.user_id);
    if (data?.user?.email) return data.user.email;
  }
  return owner.email || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const daysBefore = Math.max(1, Number(body?.days_before || 3));
    const nowIso = new Date().toISOString();
    const soonIso = new Date(Date.now() + daysBefore * 24 * 60 * 60 * 1000).toISOString();

    const { data: restaurants, error } = await admin
      .from('restaurants')
      .select('id, name, slug, subscription_expires_at')
      .not('subscription_expires_at', 'is', null)
      .gte('subscription_expires_at', nowIso)
      .lte('subscription_expires_at', soonIso)
      .eq('is_active', true)
      .order('subscription_expires_at', { ascending: true });
    if (error) throw error;

    let sent = 0;
    for (const r of restaurants || []) {
      const to = await ownerEmailForRestaurant(r.id);
      if (!to) continue;
      await sendEmail({
        to,
        subject: `Subscription expiring soon - ${r.name}`,
        html: `
          <h2>Subscription expiring soon</h2>
          <p>Your restaurant <strong>${r.name}</strong> subscription is about to expire.</p>
          <p><strong>Expiry date:</strong> ${new Date(r.subscription_expires_at).toLocaleDateString('fr-FR')}</p>
          <p>Please renew to keep your public menu active.</p>
        `,
        text: `Subscription expiring soon for ${r.name}. Expiry: ${r.subscription_expires_at}`,
      });
      sent += 1;
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
