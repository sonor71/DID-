-- Preserve the production profile UPDATE fix and make its privilege boundary explicit.
-- Additive to the existing pre-v0.19 schema; do not reset or recreate shared data.
begin;

grant select, update on table public.lit_profiles to authenticated;
alter table public.lit_profiles enable row level security;
drop policy if exists "profile owner read stabilization" on public.lit_profiles;
create policy "profile owner read stabilization" on public.lit_profiles for select to authenticated using(id=(select auth.uid()));
drop policy if exists "profile owner update stabilization" on public.lit_profiles;
create policy "profile owner update stabilization" on public.lit_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
-- Restrictive policy also constrains any older permissive UPDATE policy.
drop policy if exists "profile update owner boundary" on public.lit_profiles;
create policy "profile update owner boundary" on public.lit_profiles as restrictive for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

-- A table-level UPDATE grant must not allow direct REST clients to award XP,
-- change IDs, set is_admin or verify themselves. Legitimate SECURITY DEFINER
-- business functions keep their owner execution context; verification is guarded below.
create or replace function public.lit_guard_profile_client_update()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if current_user in ('anon','authenticated') and
       (coalesce((to_jsonb(new)->>'xp')::numeric,0)<>0 or coalesce((to_jsonb(new)->>'reviewer_reputation')::numeric,0)<>0) then
      raise exception 'profile reputation fields must start at zero' using errcode='42501';
    end if;
    return new;
  end if;
  if current_user in ('anon','authenticated') and
     (to_jsonb(new)-array['nickname','username','first_name','last_name','bio','current_status','interests','favorite_topics','wanted_genres','unwanted_genres','avatar_path','banner_path','account_role','updated_at'])
     is distinct from
     (to_jsonb(old)-array['nickname','username','first_name','last_name','bio','current_status','interests','favorite_topics','wanted_genres','unwanted_genres','avatar_path','banner_path','account_role','updated_at']) then
    raise exception 'profile privilege fields cannot be changed directly' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.lit_guard_profile_client_update() from public,anon,authenticated;
drop trigger if exists lit_profiles_10_client_fields on public.lit_profiles;
create trigger lit_profiles_10_client_fields before insert or update on public.lit_profiles for each row execute function public.lit_guard_profile_client_update();

-- Also protect writes made by a legacy SECURITY DEFINER resolver. The signed-in
-- actor must already be an admin; a value in NEW cannot authorize itself.
create or replace function public.lit_guard_profile_verification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare privilege_changed boolean; actor_is_admin boolean;
begin
  if auth.role() not in ('anon','authenticated') or auth.role() is null then return new; end if;
  if tg_op='INSERT' then
    privilege_changed:=coalesce((to_jsonb(new)->>'is_admin')::boolean,false) or coalesce((to_jsonb(new)->>'author_verified')::boolean,false);
  else
    privilege_changed:=(to_jsonb(new)->'is_admin') is distinct from (to_jsonb(old)->'is_admin')
       or (to_jsonb(new)->'author_verified') is distinct from (to_jsonb(old)->'author_verified');
  end if;
  if privilege_changed then
    select coalesce((to_jsonb(p)->>'is_admin')::boolean,false) into actor_is_admin from public.lit_profiles p where p.id=auth.uid();
    if not coalesce(actor_is_admin,false) then raise exception 'administrator verification required' using errcode='42501'; end if;
  end if;
  return new;
end $$;
revoke all on function public.lit_guard_profile_verification() from public,anon,authenticated;
drop trigger if exists lit_profiles_20_verification on public.lit_profiles;
create trigger lit_profiles_20_verification before insert or update on public.lit_profiles for each row execute function public.lit_guard_profile_verification();

grant select on public.lit_genres,public.lit_topics to anon,authenticated;
grant select,insert,update,delete on public.lit_profile_favorite_books,public.lit_profile_social_links,public.lit_profile_genre_preferences,public.lit_profile_topic_preferences,public.lit_follows to authenticated;
grant select on public.lit_achievements,public.lit_user_achievements to authenticated;

-- One transaction for profile text, books, links and preferences. A failed
-- normalized detail write rolls the core field UPDATE back as well.
create or replace function public.lit_update_my_profile(
  p_profile jsonb,p_books jsonb default '[]'::jsonb,p_links jsonb default '[]'::jsonb,
  p_wanted_genres bigint[] default '{}',p_unwanted_genres bigint[] default '{}',
  p_wanted_topics bigint[] default '{}',p_unwanted_topics bigint[] default '{}'
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.lit_profiles;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_profile) is distinct from 'object' or
     p_profile-array['nickname','username','first_name','last_name','bio','current_status','interests','favorite_topics'] <> '{}'::jsonb then
    raise exception 'unexpected profile fields';
  end if;
  if coalesce(btrim(p_profile->>'nickname'),'')='' or coalesce(btrim(p_profile->>'username'),'')='' then raise exception 'nickname and username required'; end if;
  update public.lit_profiles set nickname=p_profile->>'nickname',username=p_profile->>'username',
    first_name=coalesce(p_profile->>'first_name',''),last_name=coalesce(p_profile->>'last_name',''),
    bio=coalesce(p_profile->>'bio',''),current_status=coalesce(p_profile->>'current_status',''),
    interests=array(select jsonb_array_elements_text(coalesce(p_profile->'interests','[]'::jsonb))),
    favorite_topics=array(select jsonb_array_elements_text(coalesce(p_profile->'favorite_topics','[]'::jsonb)))
  where id=auth.uid() returning * into result;
  if not found then raise exception 'profile not found or UPDATE denied' using errcode='42501'; end if;
  perform public.lit_replace_my_profile_details(p_books,p_links,p_wanted_genres,p_unwanted_genres,p_wanted_topics,p_unwanted_topics);
  return to_jsonb(result);
end $$;
revoke all on function public.lit_update_my_profile(jsonb,jsonb,jsonb,bigint[],bigint[],bigint[],bigint[]) from public,anon;
grant execute on function public.lit_update_my_profile(jsonb,jsonb,jsonb,bigint[],bigint[],bigint[],bigint[]) to authenticated;

-- Profile objects are immutable on replacement. Still constrain older UPDATE
-- clients and provide DELETE for safe cleanup after the profile pointer commits.
do $$ declare bucket text; prefix text; begin
  foreach bucket in array array['lit-avatars','lit-profile-banners'] loop
    prefix:=case when bucket='lit-avatars' then 'avatars' else 'profile banners' end;
    execute format('drop policy if exists %I on storage.objects',prefix||' owner update');
    execute format('create policy %I on storage.objects for update to authenticated using(bucket_id=%L and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id=%L and (storage.foldername(name))[1]=auth.uid()::text)',prefix||' owner update',bucket,bucket);
    execute format('drop policy if exists %I on storage.objects',prefix||' owner delete');
    execute format('create policy %I on storage.objects for delete to authenticated using(bucket_id=%L and (storage.foldername(name))[1]=auth.uid()::text)',prefix||' owner delete',bucket);
  end loop;
end $$;
drop policy if exists "profile storage insert boundary" on storage.objects;
create policy "profile storage insert boundary" on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('lit-avatars','lit-profile-banners') or (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "profile storage update boundary" on storage.objects;
create policy "profile storage update boundary" on storage.objects as restrictive for update to authenticated using(bucket_id not in ('lit-avatars','lit-profile-banners') or (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id not in ('lit-avatars','lit-profile-banners') or (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "profile storage delete boundary" on storage.objects;
create policy "profile storage delete boundary" on storage.objects as restrictive for delete to authenticated using(bucket_id not in ('lit-avatars','lit-profile-banners') or (storage.foldername(name))[1]=auth.uid()::text);

-- Bind links to the actual work owner, not a caller-supplied author_id.
drop policy if exists "work links readable" on public.lit_work_external_links;
create policy "work links readable" on public.lit_work_external_links for select using(exists(select 1 from public.lit_works w where w.id=work_id and (w.status='published' or w.author_id=auth.uid())));
drop policy if exists "author manages work links" on public.lit_work_external_links;
create policy "author manages work links" on public.lit_work_external_links for all to authenticated using(author_id=auth.uid() and exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid())) with check(author_id=auth.uid() and exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid()));
grant select on public.lit_work_external_links to anon,authenticated;
grant insert,update,delete on public.lit_work_external_links to authenticated;

-- Known RPCs retain their auth-scoped purpose; no blanket function revocation.
alter function public.lit_create_evaluation_session(integer) set search_path=public,pg_temp;
alter function public.lit_complete_evaluation_item(uuid,integer) set search_path=public,pg_temp;
alter function public.lit_evaluate_my_achievements() set search_path=public,pg_temp;
-- The legacy resolver's signature/body is absent from the repository baseline.
-- Legacy overloads are trusted-service only. Browser admins use the checked entry below.
do $$ declare signature text; begin
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='lit_resolve_author_verification' and p.prokind='f' loop
    execute 'revoke execute on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to service_role';
  end loop;
end $$;


-- Validate the administrator BEFORE any legacy side effect, including rejection
-- and no-op branches that never touch lit_profiles. JWT claims never authorize
-- a caller using an is_admin value supplied in a request body.
create or replace function public.lit_resolve_author_verification_admin(p_request uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare resolved jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.lit_profiles p where p.id=auth.uid() and coalesce(p.is_admin,false)) then
    raise exception 'administrator verification required' using errcode='42501';
  end if;
  if p_status not in ('approved','rejected') or p_status is null then raise exception 'invalid verification status'; end if;
  if to_regprocedure('public.lit_resolve_author_verification(uuid,text)') is null then
    raise exception 'legacy verification resolver baseline must be reconciled before use';
  end if;
  execute 'select to_jsonb(result) from public.lit_resolve_author_verification($1,$2) result' into resolved using p_request,p_status;
  return resolved;
end $$;
revoke all on function public.lit_resolve_author_verification_admin(uuid,text) from public,anon;
grant execute on function public.lit_resolve_author_verification_admin(uuid,text) to authenticated;

commit;
