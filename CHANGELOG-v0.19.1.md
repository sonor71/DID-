# FRAKTUM Literature v0.19.1 — Production Core & Taxonomy checkpoint

## Production correctness

- Production state now starts without seed works, posts, reviews, communities, people or chat threads; known v0.17 demo records are removed from existing local caches without deleting real local drafts.
- Fake Specialists and static Journal routes were removed from production navigation/dispatch instead of leaving non-working buttons.
- Supabase URL and publishable key moved from feature code to runtime environment configuration; `.env.example` contains no secrets.
- Added CSP, referrer, MIME-sniffing and permissions headers for the local server and Vercel.
- Added allowlist HTML sanitization on editor paste, serialization and reader/editor rendering, including scriptable URL and event-handler removal.
- Added CI workflow and aggregate `test:all` / integration scripts. Dependency lock regeneration remains blocked in the current restricted registry environment and is not claimed complete.

## Database reconciliation and security

- Added a non-destructive reconciliation manifest and documented linked-project baseline procedure; no production reset or fabricated historical migration was performed.
- Added an RPC hardening migration that revokes anonymous execution from authenticated Literature RPCs.

## Taxonomy v2

- Added additive formats, audiences, microtags, normalized work relations, profile wanted/unwanted/blocked preferences, indexes and RLS without deleting legacy genre/topic fields.
- Added `general`, `teen`, `mature`, `adult_18` content ratings and an explicit profile opt-in field as server-side schema foundations.
- Added idempotent format/audience/tag seed and safe legacy work-genre backfill.
- Registration, Read, Evaluate and work publication now consume server genre catalogs instead of the hardcoded `GENRES` array.
- Work publication persists format, up to three genres, audiences and up to thirty microtags/content warnings through an owner-checked RPC.
- Production taxonomy selectors are searchable and bounded by server query limits.

## Tests

- Added production-empty-state, environment-config, sanitizer URL policy, taxonomy search/grouping/conflict/content-gate, migration and mocked Supabase integration coverage.
