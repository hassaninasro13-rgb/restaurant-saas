type WebhookPayload = {
  provider?: 'stripe' | 'paddle' | string;
  event_type?: string;
  restaurant_id?: string;
  external_customer_id?: string;
  external_subscription_id?: string;
  plan_slug?: string;
  status?: string;
  current_period_end?: string;
  raw?: unknown;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const body = (await req.json()) as WebhookPayload;
    const provider = String(body?.provider || '').toLowerCase();
    if (provider && !['stripe', 'paddle'].includes(provider)) {
      return new Response(JSON.stringify({ error: 'Unsupported provider' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Placeholder only: no billing integration yet.
    return new Response(JSON.stringify({
      ok: true,
      received: true,
      provider: provider || null,
      message: 'handlePaymentWebhook placeholder ready for Stripe/Paddle integration.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
