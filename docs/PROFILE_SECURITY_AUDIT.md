# Profile and Supabase security verification

The repository audit found missing profile-update migration history, incomplete
avatar/banner deletion policies, and insufficient ownership checks on external
work links. A table-level `UPDATE` grant on `lit_profiles` also needs a database
guard: owner-row RLS alone does not stop an account from changing its own
`is_admin` or `author_verified` fields. The stabilization migration addresses
these specific paths; it does not replace the production baseline.

The production schema, production upload behavior and Supabase Security Advisor
have **not** been verified in this environment. No Supabase management token,
database connection or two authenticated production test accounts were available.
Static SQL inspection and application tests are separate evidence from a live
advisor report or successful real-account operations.

## Existing function responsibilities

| Function | Intended caller and checks |
| --- | --- |
| `lit_create_evaluation_session(integer)` | Authenticated user; requires `auth.uid()`, a bounded count and eligible items. |
| `lit_complete_evaluation_item(uuid,integer)` | Authenticated owner of an active evaluation session. |
| `lit_evaluate_my_achievements()` | Authenticated user; derives that user's award progress from server records. |
| `lit_replace_my_profile_details(...)` | Authenticated user; security invoker and owner RLS. |
| `lit_replace_my_taxonomy_v2_preferences(...)` | Authenticated user; security invoker and owner RLS. |
| `lit_replace_work_taxonomy(...)` | Authenticated author of the target work; security invoker and author RLS. |
| `lit_resolve_author_verification(...)` | An authenticated **administrator**, checked in the database. Signature, return type and original body belong to the missing legacy baseline. |

The first three are the `SECURITY DEFINER` RPCs defined in the committed history.
Their API execution grants are restricted to `authenticated`; their authentication
and ownership checks remain necessary. Do not revoke every project's function
indiscriminately. Other applications share this Supabase project.

Administrators use the same `authenticated` database role as ordinary users.
All original resolver overloads are therefore revoked from `PUBLIC`, `anon` and
`authenticated`, retaining trusted `service_role` access. Browser admin operations
call `lit_resolve_author_verification_admin(uuid,text)`, which checks the actor's
existing admin profile before delegating the known `(uuid,text)` legacy signature.
Approval, rejection and no-op branches share this check. An absent or unsupported
legacy signature fails explicitly and requires baseline reconciliation. The real
legacy resolver's transitions and other side effects still need an exported-body
review. The profile privilege trigger independently blocks flag escalation.

The editor asset migration scopes restrictive Storage write boundaries to
`lit-work-assets`, including when an older permissive policy exists. Asset paths
are immutable; replacements insert a new object. An existing private work-assets
bucket stays private and requires a supported private URL design before this
frontend's public-object URLs can be used; do not silently change its visibility.

## Read-only checks

Use an operator's existing secure libpq settings, including verified TLS. Do not
put passwords in Git, command arguments or pasted logs. Store raw audit exports
outside the checkout with restrictive permissions; function definitions can
contain legacy configuration.

```bash
umask 077
export FRAKTUM_AUDIT_DIR=/tmp/fraktum-security-audit
mkdir -p "$FRAKTUM_AUDIT_DIR"
psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --file=supabase/audits/profile_security.sql \
  --output="$FRAKTUM_AUDIT_DIR/database-inventory.txt"
```

The SQL only inventories relations, effective function/table/column privileges,
all public `SECURITY DEFINER` functions, every resolver overload/body, RLS flags,
policies, privilege triggers and media bucket settings. It runs in a read-only
transaction. The output is **not** a Security Advisor report or a behavioral RLS
test. All `storage.objects` policies must be checked together because permissive
policies combine with OR.

Run the actual Supabase Security Advisor through the dashboard or Management API
after securely supplying `SUPABASE_ACCESS_TOKEN` and `FRAKTUM_PROJECT_REF`:

```bash
python3 - <<'PY_ADVISOR'
import os
from pathlib import Path
from urllib.request import Request, urlopen
project = os.environ['FRAKTUM_PROJECT_REF']
request = Request(f'https://api.supabase.com/v1/projects/{project}/advisors/security',
                  headers={'Authorization': 'Bearer ' + os.environ['SUPABASE_ACCESS_TOKEN']})
with urlopen(request, timeout=30) as response:
    Path(os.environ['FRAKTUM_AUDIT_DIR'], 'security-advisor.json').write_bytes(response.read())
PY_ADVISOR
```

Do not enable shell tracing for this command. `supabase db lint` is useful SQL
validation, but it does not substitute for the project's Security Advisor.
Review findings on function search paths, function execution grants, RLS-disabled
tables and broad policies; classify Literature objects separately from unrelated
shared-project objects before making changes.

## Reconcile and deploy the database

The committed history starts at the additive v0.19 boundary. It does not define
the original `lit_profiles`, `lit_works`, `lit_work_versions` or legacy resolver.
See [the baseline boundary](../supabase/baseline/README.md) and
[the migration manifest](../supabase/baseline/MIGRATION_MANIFEST.md).
Never run `supabase db reset` against the shared project or manufacture a baseline
from assumptions about those missing definitions.

From the repository root, using the operator's configured Supabase CLI:

```bash
supabase link --project-ref "${FRAKTUM_PROJECT_REF:?}"
supabase migration list --linked
supabase db dump --linked --schema public,storage \
  --file "${FRAKTUM_AUDIT_DIR:?}/live-schema.sql"
supabase db push --linked --dry-run
```

The raw schema dump is an inspection artifact, **not** a new migration. It can
include non-Literature objects from the shared project's `public` and `storage`
schemas; do not commit or replay it as a Literature baseline. Compare actual SQL
effects and migration-history rows. If a historical migration was applied
manually, reconcile its exact version with `supabase migration repair` only after
verifying those effects; no universal repair command is safe to prescribe here.

Review the dry-run so only intended, unapplied migrations will execute. Test them
against a staging copy with the same baseline and record the RLS matrix below.
Only then execute the reviewed deployment command:

```bash
supabase db push --linked
```

Repeat the read-only inventory and real Security Advisor, compare before/after
outputs, and confirm PostgREST sees the new schema. These commands were documented
for the operator; they were not executed against production during this task.

## Required live regression evidence

Use two separate ordinary accounts plus an existing administrator in staging.
Do not create fake local production records or use a service-role key in the
browser. Record successful and denied operations separately.

| Area | Expected evidence |
| --- | --- |
| Profile text/preferences | Owner update survives refresh and second-browser login; another user cannot update the owner. |
| Avatar/banner | Upload, replacement and removal persist after refresh and on the second device; no 403, stale URL or broken image. |
| Storage ownership | Another account cannot insert/update/delete an object under the owner's path or move it into another bucket/path. Public reads remain available for public profile media. |
| Privilege flags | Ordinary user cannot set `is_admin` or `author_verified` by direct REST insert/update or by calling any resolver overload. |
| Verification | Admin can approve/reject the intended request; non-admin and anonymous callers cannot; duplicate and invalid transitions are rejected or idempotent as documented by the exported function. |
| Work links/taxonomy | Author controls links and classifier relations only on their own work; private draft links are not visible to another ordinary account or anon. |
| RLS/ACL matrix | Verify anon, owner, other authenticated user, admin and trusted service responsibilities for profile, taxonomy, work/version, asset and verification tables. |

Until this evidence and the missing baseline review exist, production schema
equivalence, live RLS correctness, successful production profile uploads and a
clean Security Advisor remain unverified.
