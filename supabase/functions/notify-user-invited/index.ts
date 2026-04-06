import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: userRes } = await admin.auth.getUser(token);
    const user = userRes?.user;
    if (!user) throw new Error('Not authenticated.');

    const body = await req.json();
    const restaurantId = String(body?.restaurant_id || '').trim();
    const invitedEmail = String(body?.email || '').trim().toLowerCase();
    const role = String(body?.role || 'staff').trim().toLowerCase();
    if (!restaurantId || !invitedEmail) throw new Error('Invalid payload.');

    const { data: roleOk } = await admin.rpc('has_restaurant_role', {
      p_restaurant_id: restaurantId,
      p_roles: ['owner', 'admin'],
    });
    if (!roleOk) throw new Error('Forbidden.');

    const { data: restaurant } = await admin
      .from('restaurants')
      .select('name')
      .eq('id', restaurantId)
      .maybeSingle();

    await sendEmail({
      to: invitedEmail,
      subject: `You were invited to ${restaurant?.name || 'a restaurant'} on OneTap`,
      html: `
        <h2>Restaurant invitation</h2>
        <p>You were invited to join <strong>${restaurant?.name || 'a restaurant'}</strong> on OneTap.</p>
        <p><strong>Role:</strong> ${role}</p>
        <p>If you already have an account, login to access your role. Otherwise, create an account with this email.</p>
      `,
      text: `You were invited to ${restaurant?.name || 'a restaurant'} as ${role}.`,
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
