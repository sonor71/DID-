# Supabase OTP setup for D20 v0.12

The client in `src/cloud.js` supports passwordless registration/login via:

- email OTP
- phone/SMS OTP

## Email code instead of Magic Link

Supabase email auth is enabled by default, but `signInWithOtp` sends a Magic Link unless the email template contains the OTP token.

In Supabase Dashboard:

1. Auth -> Email Templates.
2. Open the Magic Link template.
3. Include `{{ .Token }}` in the message body, for example:

```html
<h2>D20 login code</h2>
<p>Your one-time code:</p>
<h1>{{ .Token }}</h1>
```

Official guide:
https://supabase.com/docs/guides/auth/auth-email-passwordless

## Phone/SMS OTP

Phone auth additionally requires an SMS provider.

In Supabase Dashboard:

1. Auth -> Providers -> Phone.
2. Enable phone authentication.
3. Configure a supported SMS provider.

Official guide:
https://supabase.com/docs/guides/auth/phone-login

Until an SMS provider is configured, the D20 UI can request a phone OTP, but Supabase cannot deliver the SMS.

## Server indicator

The top bar now distinguishes:

- `server online` — the browser can reach the D20 Supabase backend;
- `server + account` — the browser also has an authenticated Supabase session;
- `offline` — the backend health check failed.

Existing local prototype users can use `Подключить аккаунт` in the top bar to move to the real Supabase auth flow without clearing the rest of local prototype data.
