## Email notification functions

Deploy:

1. `supabase functions deploy notify-new-restaurant`
2. `supabase functions deploy notify-new-order --no-verify-jwt`
3. `supabase functions deploy notify-user-invited`
4. `supabase functions deploy notify-subscription-expiry`

Required secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM` (example: `OneTap <noreply@yourdomain.com>`)
- `PLATFORM_ADMIN_EMAILS` (comma-separated) or `PLATFORM_ADMIN_EMAIL`

Provider:

- Resend API is used directly via fetch in `_shared/email.ts`.

Expiry reminders:

- Run `notify-subscription-expiry` with a cron/scheduler once per day.
