-- Read-only inventory for an operator's linked Literature project.
-- This is not Supabase Security Advisor and does not establish runtime RLS behavior.
-- Run with psql -X -v ON_ERROR_STOP=1 -f supabase/audits/profile_security.sql
-- using existing, TLS-verified libpq connection settings. Keep output private:
-- legacy function definitions may contain configuration absent from Git.
begin read only;
set local statement_timeout = '15s';

select current_database() as database_name, current_user as inspection_role;

-- Core relations predate the committed migration boundary. Missing names here
-- mean that the current repository is not a complete bootstrap of this project.
select name, to_regclass('public.' || name) as relation
from unnest(array[
  'lit_profiles', 'lit_works', 'lit_work_versions', 'lit_assets',
  'lit_author_verification_requests'
]) as required(name);

-- Inspect every public SECURITY DEFINER function, including shared-project
-- functions, without changing any grants. PUBLIC EXECUTE is shown separately
-- from the effective permissions inherited by each API role.
select p.oid::regprocedure::text as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.proconfig as function_settings,
       exists (
         select 1
         from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE'
       ) as public_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by signature;

-- Do not infer the legacy resolver's signature, return type or admin checks
-- from its frontend call. Every overload and its complete body need review.
select count(*) as author_verification_resolver_overloads
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'lit_resolve_author_verification';

select p.oid::regprocedure::text as signature, p.prosecdef as security_definer,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'lit_resolve_author_verification'
order by signature;

-- RLS flags and effective table privileges are separate controls. Inspect both.
select c.relname as relation, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and left(c.relname, 4) = 'lit_'
  and c.relkind in ('r', 'p')
order by relation;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and left(tablename, 4) = 'lit_')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- Owner-row RLS alone cannot distinguish a text edit from self-verification.
-- A table-level UPDATE grant requires a tested privilege-field guard as well.
select a.attname as profile_column,
       has_column_privilege('authenticated', c.oid, a.attnum, 'UPDATE') as authenticated_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public' and c.relname = 'lit_profiles'
  and a.attnum > 0 and not a.attisdropped
order by a.attnum;

select t.tgname as trigger_name, pg_get_triggerdef(t.oid) as trigger_definition,
       p.oid::regprocedure::text as trigger_function,
       pg_get_functiondef(p.oid) as trigger_function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname in ('lit_profiles', 'lit_author_verification_requests')
  and not t.tgisinternal
order by c.relname, t.tgname;

-- Public media reads are intentional; all writes must retain the owner's
-- bucket/path restriction. Inspect all storage policies above because permissive
-- policies combine with OR, including policies not created by Literature.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('lit-avatars', 'lit-profile-banners', 'lit-work-assets', 'lit-post-media')
order by id;

commit;
