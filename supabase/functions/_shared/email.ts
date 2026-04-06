export type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

function normalizeRecipients(input: string | string[]) {
  const arr = Array.isArray(input) ? input : [input];
  return arr.map((x) => String(x || '').trim()).filter(Boolean);
}

export async function sendEmail(payload: EmailPayload) {
  const apiKey = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('EMAIL_FROM');
  if (!from?.trim()) {
    throw new Error('EMAIL_FROM is missing. Set it in Supabase Edge Function secrets (e.g. OneTapMenu <noreply@onetapmenu.online>).');
  }
  if (!apiKey) throw new Error('RESEND_API_KEY is missing.');
  const to = normalizeRecipients(payload.to);
  if (!to.length) throw new Error('No recipients.');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from.trim(),
      to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
  return res.json();
}

export function parseAdminEmailsFromEnv() {
  const raw = Deno.env.get('PLATFORM_ADMIN_EMAILS') || Deno.env.get('PLATFORM_ADMIN_EMAIL') || '';
  return raw
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
