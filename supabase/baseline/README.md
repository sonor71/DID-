# Supabase schema reconciliation

The shared production project predates this repository and also contains non-Literature schemas. Never run `db reset` against it.

Safe reconciliation procedure:

1. Export production **schema only** with the Supabase CLI using a read-only/operator credential.
2. Compare `supabase migration list --linked` with the committed manifest below.
3. Mark already-applied historical migrations as repaired only after matching their SQL effects; never replay them blindly.
4. Apply the additive Literature migrations in timestamp order with `supabase db push --dry-run`, review the diff, then push.
5. Do not include or alter TCG/game objects in a Literature baseline.

The repository snapshot has no Supabase access token or database password, so a trustworthy live-schema dump cannot be generated here. `MIGRATION_MANIFEST.md` records the known boundary explicitly rather than fabricating production history.
