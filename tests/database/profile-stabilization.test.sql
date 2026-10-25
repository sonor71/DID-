\set ON_ERROR_STOP on
-- Disposable local baseline fixture, not a claim about the shared production schema.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
grant usage on schema auth to anon,authenticated,service_role;

create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
grant usage on schema storage to anon,authenticated;
grant select on storage.objects to anon;
grant select,insert,update,delete on storage.objects to authenticated;

create table public.lit_profiles(
 id uuid primary key,username text unique not null,nickname text not null default '',first_name text not null default '',last_name text not null default '',
 account_role text not null default 'reader',author_verified boolean not null default false,is_admin boolean not null default false,
 xp integer not null default 0,reviewer_reputation integer not null default 0,wanted_genres text[] not null default '{}',unwanted_genres text[] not null default '{}',avatar_path text,updated_at timestamptz default now()
);
create policy "baseline profile public read" on public.lit_profiles for select using(true);
create policy "baseline profile owner insert" on public.lit_profiles for insert to authenticated with check(id=auth.uid());
-- Deliberately broad legacy UPDATE policy proves the new restrictive boundary works.
create policy "baseline broad profile update" on public.lit_profiles for update to authenticated using(true) with check(true);
grant select on public.lit_profiles to anon,authenticated;
grant insert on public.lit_profiles to authenticated;
create table public.lit_works(id uuid primary key,author_id uuid references public.lit_profiles(id),title text,status text,genres text[] default '{}');
grant select on public.lit_works to anon,authenticated;
create table public.lit_work_versions(id uuid primary key,work_id uuid references public.lit_works(id),evaluation_open boolean default false,plain_text text,evaluation_excerpt text,created_at timestamptz default now());
create table public.lit_reviews(id uuid primary key,reviewer_id uuid references public.lit_profiles(id),version_id uuid references public.lit_work_versions(id));
create table public.lit_verification_fixture_requests(id uuid primary key,status text);
-- Deliberately unsafe legacy resolver: reject and no-op branches must be guarded too.
create function public.lit_resolve_author_verification(p_request uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.lit_verification_fixture_requests set status=p_status where id=p_request;
  if p_status='approved' then update public.lit_profiles set author_verified=true where id=p_request; end if;
end $$;

\ir ../../supabase/migrations/202610040001_identity_discovery.sql
\ir ../../supabase/migrations/202610040002_evaluation_fragments.sql
\ir ../../supabase/migrations/202610040003_annotations_feedback.sql
\ir ../../supabase/migrations/202610040004_achievements.sql
\ir ../../supabase/migrations/202610110001_taxonomy_v2.sql
\ir ../../supabase/migrations/202610110002_rpc_security_hardening.sql
\ir ../../supabase/migrations/202610110003_taxonomy_v2_production_reconciliation.sql
\ir ../../supabase/migrations/202610250001_profile_stabilization.sql
-- Verify the additive repair itself can be reapplied safely.
\ir ../../supabase/migrations/202610250001_profile_stabilization.sql
\ir ../../supabase/migrations/202610250003_editor_assets.sql
\ir ../../supabase/migrations/202610250003_editor_assets.sql

-- Model an unsafe historical shared storage policy; scoped restrictive repairs
-- must still prevent other-owner writes without rewriting unrelated policies.
create policy "legacy broad storage insert" on storage.objects for insert to authenticated with check(true);
create policy "legacy broad storage update" on storage.objects for update to authenticated using(true) with check(true);
create policy "legacy broad storage delete" on storage.objects for delete to authenticated using(true);

create function public.test_assert(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function public.test_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'ASSERT: expected insufficient_privilege for %',statement;
end $$;
insert into public.lit_profiles(id,username,nickname,is_admin) values
 ('11111111-1111-4111-8111-111111111111','owner','Before',false),
 ('22222222-2222-4222-8222-222222222222','other','Other',false),
 ('33333333-3333-4333-8333-333333333333','admin','Admin',true);
insert into public.lit_works(id,author_id,title,status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Private','draft'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Published','published');

insert into public.lit_verification_fixture_requests values('11111111-1111-4111-8111-111111111111','pending'),('22222222-2222-4222-8222-222222222222','pending');
set role authenticated;
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
update public.lit_profiles set nickname='Before' where id=auth.uid();
select public.test_denied($$update public.lit_profiles set is_admin=true where id=auth.uid()$$);
select public.test_denied($$update public.lit_profiles set author_verified=true where id=auth.uid()$$);
select public.test_denied($$update public.lit_profiles set xp=99999 where id=auth.uid()$$);
select public.test_denied($$select public.lit_resolve_author_verification(auth.uid(),'approved')$$);
select public.test_denied($$select public.lit_resolve_author_verification('22222222-2222-4222-8222-222222222222','rejected')$$);
select public.test_denied($$select public.lit_resolve_author_verification_admin(auth.uid(),'approved')$$);
select public.test_denied($$select public.lit_resolve_author_verification_admin('22222222-2222-4222-8222-222222222222','rejected')$$);
select public.test_denied($$select public.lit_resolve_author_verification_admin('99999999-9999-4999-8999-999999999999','rejected')$$);
select public.test_denied($$insert into public.lit_profiles(id,username,is_admin) values('44444444-4444-4444-8444-444444444444','fake-admin',true)$$);
select public.test_denied($$insert into public.lit_profiles(id,username,xp) values(auth.uid(),'fake-award',9999)$$);
update public.lit_profiles set nickname='Illegal' where id='22222222-2222-4222-8222-222222222222';
select public.test_assert((select nickname='Other' from public.lit_profiles where id='22222222-2222-4222-8222-222222222222'),'other profile remains unchanged');

select public.lit_update_my_profile('{"nickname":"Saved","username":"owner","first_name":"","last_name":"","bio":"","current_status":"","interests":["Books"],"favorite_topics":[]}',
 '[{"title":"Persistent book","authorName":"Writer"}]','[{"platform":"Website","label":"Site","url":"https://example.com"}]',array[(select min(id) from public.lit_genres)],'{}',array[(select min(id) from public.lit_topics)],'{}');
select public.test_assert((select nickname='Saved' and interests=array['Books'] from public.lit_profiles where id=auth.uid()),'profile core fields saved');
select public.test_assert((select count(*)=1 from public.lit_profile_favorite_books where user_id=auth.uid()),'book saved');
select public.test_assert((select count(*)=1 from public.lit_profile_genre_preferences where user_id=auth.uid()),'genre preference saved');
do $$ begin
  begin
    perform public.lit_update_my_profile('{"nickname":"Must rollback","username":"owner"}',jsonb_build_array(jsonb_build_object('title',repeat('x',241))));
    raise exception 'ASSERT: invalid favorite book should fail';
  exception when check_violation then null; end;
  perform public.test_assert((select nickname='Saved' from public.lit_profiles where id=auth.uid()),'atomic core field rollback');
  perform public.test_assert((select count(*)=1 from public.lit_profile_favorite_books where user_id=auth.uid()),'atomic normalized details rollback');
end $$;

insert into storage.objects(bucket_id,name,owner_id) values('lit-avatars',auth.uid()::text||'/avatar-first.webp',auth.uid()::text);
select public.test_denied($$insert into storage.objects(bucket_id,name) values('lit-avatars','22222222-2222-4222-8222-222222222222/stolen.webp')$$);
select public.test_denied($$update storage.objects set name='22222222-2222-4222-8222-222222222222/moved.webp' where name=auth.uid()::text||'/avatar-first.webp'$$);
update public.lit_profiles set avatar_path=auth.uid()::text||'/avatar-first.webp',banner_path=null where id=auth.uid();
update public.lit_profiles set avatar_path=null where id=auth.uid();
delete from storage.objects where name=auth.uid()::text||'/avatar-first.webp';
select public.test_assert((select count(*)=0 from storage.objects where name=auth.uid()::text||'/avatar-first.webp'),'owner storage delete');

select public.test_denied($$insert into public.lit_work_external_links(work_id,author_id,link_type,platform,label,url) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',auth.uid(),'website','Site','Forged','https://example.com')$$);
insert into public.lit_work_external_links(work_id,author_id,link_type,platform,label,url) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',auth.uid(),'website','Site','Private','https://example.com');
insert into public.lit_editor_assets(id,owner_id,storage_path,original_name,mime_type,byte_size) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),auth.uid()::text||'/draft/image.webp','image.webp','image/webp',20);
select public.test_assert((select count(*)=1 from public.lit_editor_assets),'owner sees persistent editor asset record');
select public.test_denied($$insert into public.lit_editor_assets(owner_id,storage_path,original_name,mime_type,byte_size) values('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222/draft/forged.webp','forged.webp','image/webp',20)$$);
insert into storage.objects(bucket_id,name,owner_id) values('lit-work-assets',auth.uid()::text||'/draft/image.webp',auth.uid()::text);
select public.test_denied($$insert into storage.objects(bucket_id,name) values('lit-work-assets','22222222-2222-4222-8222-222222222222/draft/forged.webp')$$);
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select public.test_assert((select count(*)=0 from public.lit_work_external_links where work_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'private draft links hidden from other user');
select public.test_assert((select count(*)=0 from public.lit_editor_assets),'other user cannot read private asset records');
delete from public.lit_editor_assets where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
delete from storage.objects where bucket_id='lit-work-assets' and name='11111111-1111-4111-8111-111111111111/draft/image.webp';
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.test_assert((select count(*)=1 from public.lit_editor_assets),'other user cannot delete asset record');
select public.test_assert((select count(*)=1 from storage.objects where bucket_id='lit-work-assets'),'other user cannot delete asset object');
delete from public.lit_editor_assets where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
delete from storage.objects where bucket_id='lit-work-assets' and name=auth.uid()::text||'/draft/image.webp';
select public.test_assert((select count(*)=0 from public.lit_editor_assets),'owner can clean up asset record');
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select public.lit_resolve_author_verification_admin('11111111-1111-4111-8111-111111111111','approved');
select public.lit_resolve_author_verification_admin('22222222-2222-4222-8222-222222222222','rejected');
select public.test_assert((select author_verified from public.lit_profiles where id='11111111-1111-4111-8111-111111111111'),'existing admin resolver still works');
reset role;
select public.test_assert((select status='rejected' from public.lit_verification_fixture_requests where id='22222222-2222-4222-8222-222222222222'),'admin rejection delegated successfully');
set role anon;
set request.jwt.claim.role='anon';
set request.jwt.claim.sub='';
select public.test_denied($$select * from public.lit_editor_assets$$);
reset role;
select public.test_assert(not has_function_privilege('anon','public.lit_resolve_author_verification(uuid,text)','EXECUTE'),'anon resolver execute revoked');
select public.test_assert(not has_function_privilege('authenticated','public.lit_resolve_author_verification(uuid,text)','EXECUTE'),'unsafe direct resolver access revoked');
select public.test_assert(has_function_privilege('authenticated','public.lit_resolve_author_verification_admin(uuid,text)','EXECUTE'),'checked admin workflow retained');
select 'PROFILE AND EDITOR DATABASE REGRESSIONS PASSED' as result;
