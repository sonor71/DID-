-- Persistent editor asset records for all work and fragment layouts.
begin;
create table if not exists public.lit_editor_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.lit_profiles(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 12000000),
  created_at timestamptz not null default now(),
  constraint editor_asset_owner_path check (split_part(storage_path,'/',1)=owner_id::text)
);
alter table public.lit_editor_assets enable row level security;
grant select,insert,delete on public.lit_editor_assets to authenticated;
revoke all on public.lit_editor_assets from anon;
drop policy if exists "editor asset owner read" on public.lit_editor_assets;
create policy "editor asset owner read" on public.lit_editor_assets for select to authenticated using(owner_id=auth.uid());
drop policy if exists "editor asset owner insert" on public.lit_editor_assets;
create policy "editor asset owner insert" on public.lit_editor_assets for insert to authenticated with check(owner_id=auth.uid());
drop policy if exists "editor asset owner delete" on public.lit_editor_assets;
create policy "editor asset owner delete" on public.lit_editor_assets for delete to authenticated using(owner_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lit-work-assets','lit-work-assets',true,12000000,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Keep the existing bucket's visibility when reconciling an installed project.
drop policy if exists "editor assets owner insert" on storage.objects;
create policy "editor assets owner insert" on storage.objects for insert to authenticated
with check(bucket_id='lit-work-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "editor assets owner delete" on storage.objects;
create policy "editor assets owner delete" on storage.objects for delete to authenticated
using(bucket_id='lit-work-assets' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "editor assets owner read" on storage.objects;
create policy "editor assets owner read" on storage.objects for select to authenticated
using(bucket_id='lit-work-assets' and (storage.foldername(name))[1]=auth.uid()::text);
-- Existing permissive storage policies combine with OR. These boundaries apply
-- only to this bucket and preserve unrelated applications' storage behavior.
drop policy if exists "editor storage insert boundary" on storage.objects;
create policy "editor storage insert boundary" on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'lit-work-assets' or (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "editor storage delete boundary" on storage.objects;
create policy "editor storage delete boundary" on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'lit-work-assets' or (storage.foldername(name))[1]=auth.uid()::text);
-- Editor objects are immutable: replacements receive a new path and asset ID.
-- Deny both mutating an existing work asset and moving another object into it.
drop policy if exists "editor storage immutable objects" on storage.objects;
create policy "editor storage immutable objects" on storage.objects as restrictive for update to authenticated
using(bucket_id<>'lit-work-assets') with check(bucket_id<>'lit-work-assets');
commit;
