# D20 Platform — next steps after v0.3

Current priority: validate product flows before polishing visuals.

## v0.3 — local architecture prototype
- roles and onboarding
- reader discovery flow
- reader annotations and full reviews
- XP / reviewer reputation
- author Book Studio
- work versions
- profile: written / read / reviews / later
- communities
- social posts
- project messages
- specialists
- review analytics and local summary prototype

## v0.4 — backend foundation
1. Supabase/Postgres schema from `ARCHITECTURE.md`.
2. Auth: email first; phone as second registration/login method.
3. Row Level Security by role/capability.
4. Real work/version persistence.
5. Storage for covers and manuscript assets.
6. Real review + annotation API.
7. Reading progress sync.

## v0.5 — collaboration
- realtime messages
- author replies / reports
- community roles and moderation
- specialist project invites
- notifications

## v0.6 — verification + AI aggregation
- external identity verification provider
- store only verification result/reference where possible
- AI review summary with source traceability

## Later
- monetization, if needed
- advanced Book Studio formatting/export
- mobile app/PWA polish
- final visual system


## v0.10
- D20 Studio expanded to use nearly all available desktop width.
- Illustrations can be dragged vertically through the text and between left/right/center positions.
- Text reflows around left/right floated illustrations.
- Selected illustrations can be resized to 25/40/55/70/100%.
- Image selection/drag handling was rebuilt to avoid the interaction lock after clicking an image.
