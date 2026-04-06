import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getRestaurantOwnerEmail(restaurantId: string) {
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
    const body = await req.json();
    const orderId = String(body?.order_id || '').trim();
    if (!orderId) throw new Error('order_id is required.');

    const { data: order } = await admin
      .from('orders')
      .select('id, order_number, restaurant_id, customer_name, customer_phone, total_amount, created_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) throw new Error('Order not found.');

    const { data: restaurant } = await admin
      .from('restaurants')
      .select('name, slug')
      .eq('id', order.restaurant_id)
      .maybeSingle();
    const to = await getRestaurantOwnerEmail(order.restaurant_id);
    if (!to) throw new Error('Restaurant owner email not found.');

    await sendEmail({
      to,
      subject: `New order ${order.order_number} - ${restaurant?.name || 'Restaurant'}`,
      html: `
        <h2>New order received</h2>
        <p><strong>Restaurant:</strong> ${restaurant?.name || '-'}</p>
        <p><strong>Order:</strong> ${order.order_number}</p>
        <p><strong>Customer:</strong> ${order.customer_name || '-'}</p>
        <p><strong>Phone:</strong> ${order.customer_phone || '-'}</p>
        <p><strong>Total:</strong> ${order.total_amount || 0} DZD</p>
      `,
      text: `New order ${order.order_number} for ${restaurant?.name || ''}`,
    });

    return new Response(JSON.stringify({ ok: true }), {
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
