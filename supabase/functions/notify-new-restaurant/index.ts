export const config = { verify_jwt: false };

import { parseAdminEmailsFromEnv, sendEmail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      });
    }

    const body = await req.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim();
    if (!name) throw new Error('name is required.');
    if (!email) throw new Error('email is required.');

    const restaurant = { name, slug: '-', created_at: '-' };
    const user = { email };

    const recipients = parseAdminEmailsFromEnv();
    if (!recipients.length) throw new Error('PLATFORM_ADMIN_EMAIL(S) is missing.');

    await sendEmail({
      to: recipients,
      subject: `New restaurant signup: ${restaurant.name}`,
      html: `
        <h2>New restaurant signup</h2>
        <p><strong>Name:</strong> ${restaurant.name}</p>
        <p><strong>Slug:</strong> ${restaurant.slug}</p>
        <p><strong>Owner email:</strong> ${user.email || '-'}</p>
        <p><strong>Created at:</strong> ${restaurant.created_at || '-'}</p>
      `,
      text: `New restaurant signup: ${restaurant.name} (${restaurant.slug})`,
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
