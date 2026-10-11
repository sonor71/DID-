# FRAKTUM Literature v0.19.2

## Deployment and Supabase authentication

- Vercel now explicitly builds the static application with `npm run build` and publishes only `dist`; SPA navigation falls back to `index.html` after static-file lookup.
- Build-time browser configuration is generated from the Vercel `VITE_*` environment and validated before `dist` is replaced.
- Local development reads ignored `.env` and `.env.local` files, while process environment values retain precedence.
- The browser has a single Supabase configuration source: `/runtime-config.js`, loaded before the application module.
- OTP requests go directly to Supabase Auth with the configured publishable key and now expose useful, sanitized Supabase error messages.
- Runtime diagnostics report whether the URL and publishable key are configured without printing their values.
- Added an additive Taxonomy v2 production reconciliation migration with prerequisite type checks, explicit grants/RLS, indexes, idempotent seed data, RPC grants, legacy genre backfill, and a PostgREST schema-cache reload.
