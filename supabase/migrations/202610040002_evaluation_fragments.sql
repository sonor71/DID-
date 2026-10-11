-- FRAKTUM Literature v0.19: evaluation sessions and public fragments.
begin;
create table if not exists public.lit_fragments (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.lit_profiles(id) on delete cascade,
 work_id uuid references public.lit_works(id) on delete set null, version_id uuid references public.lit_work_versions(id) on delete set null,
 title text not null check(char_length(title) between 1 and 240), content jsonb not null default '{"type":"doc","content":[]}',
 plain_text text not null default '', visibility text not null default 'private' check(visibility in ('private','public','unlisted')),
 evaluation_open boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz
);
create table if not exists public.lit_evaluation_preferences (
 user_id uuid primary key references public.lit_profiles(id) on delete cascade,
 default_mode text not null default 'session' check(default_mode in ('session','catalog')),
 default_batch_size integer not null default 5 check(default_batch_size between 1 and 50), updated_at timestamptz not null default now()
);
create table if not exists public.lit_evaluation_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.lit_profiles(id) on delete cascade,
 target_count integer not null check(target_count between 1 and 50), completed_count integer not null default 0,
 status text not null default 'active' check(status in ('active','completed','cancelled')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.lit_evaluation_session_items (
 session_id uuid not null references public.lit_evaluation_sessions(id) on delete cascade, position integer not null,
 work_id uuid references public.lit_works(id) on delete cascade, version_id uuid references public.lit_work_versions(id) on delete cascade,
 fragment_id uuid references public.lit_fragments(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','in_progress','completed','skipped')),
 primary key(session_id,position), check(work_id is not null or fragment_id is not null)
);
alter table public.lit_fragments enable row level security;alter table public.lit_evaluation_preferences enable row level security;
alter table public.lit_evaluation_sessions enable row level security;alter table public.lit_evaluation_session_items enable row level security;
drop policy if exists "public fragments read" on public.lit_fragments;create policy "public fragments read" on public.lit_fragments for select using(visibility='public' and published_at is not null or author_id=auth.uid());
drop policy if exists "authors manage fragments" on public.lit_fragments;create policy "authors manage fragments" on public.lit_fragments for all to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
drop policy if exists "owner evaluation preferences" on public.lit_evaluation_preferences;create policy "owner evaluation preferences" on public.lit_evaluation_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "owner evaluation sessions" on public.lit_evaluation_sessions;create policy "owner evaluation sessions" on public.lit_evaluation_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "owner evaluation items" on public.lit_evaluation_session_items;create policy "owner evaluation items" on public.lit_evaluation_session_items for select to authenticated using(exists(select 1 from public.lit_evaluation_sessions s where s.id=session_id and s.user_id=auth.uid()));
create index if not exists lit_fragments_author_idx on public.lit_fragments(author_id,created_at desc);create index if not exists lit_fragments_public_idx on public.lit_fragments(visibility,published_at desc) where visibility='public';
create index if not exists lit_eval_sessions_user_idx on public.lit_evaluation_sessions(user_id,created_at desc);create index if not exists lit_eval_items_work_version_idx on public.lit_evaluation_session_items(work_id,version_id);

create or replace function public.lit_create_evaluation_session(p_target_count integer)
returns table(session_id uuid,item_id integer,work_id uuid,version_id uuid,title text,plain_text text)
language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); sid uuid; available integer;
begin
 if me is null then raise exception 'authentication required'; end if;
 if p_target_count not between 1 and 50 then raise exception 'target count must be 1..50'; end if;
 select count(*) into available from lit_work_versions v join lit_works w on w.id=v.work_id where v.evaluation_open and w.author_id<>me;
 if available<p_target_count then raise exception 'not enough evaluation items'; end if;
 insert into lit_evaluation_sessions(user_id,target_count) values(me,p_target_count) returning id into sid;
 insert into lit_evaluation_session_items(session_id,position,work_id,version_id,status)
 select sid,row_number() over(order by coalesce(review_stats.total,0),v.created_at desc)::integer,w.id,v.id,'pending'
 from lit_work_versions v join lit_works w on w.id=v.work_id
 left join lateral(select count(*) total from lit_reviews r where r.version_id=v.id) review_stats on true
 where v.evaluation_open and w.author_id<>me order by coalesce(review_stats.total,0),v.created_at desc limit p_target_count;
 insert into lit_evaluation_preferences(user_id,default_mode,default_batch_size) values(me,'session',p_target_count)
 on conflict(user_id) do update set default_batch_size=excluded.default_batch_size,default_mode='session',updated_at=now();
 return query select sid,i.position,i.work_id,i.version_id,w.title,v.coalesce_plain from lit_evaluation_session_items i join lit_works w on w.id=i.work_id join lateral(select coalesce(vv.evaluation_excerpt,vv.plain_text,'') coalesce_plain from lit_work_versions vv where vv.id=i.version_id) v on true where i.session_id=sid order by i.position;
end $$;
revoke all on function public.lit_create_evaluation_session(integer) from public;grant execute on function public.lit_create_evaluation_session(integer) to authenticated;

create or replace function public.lit_complete_evaluation_item(p_session uuid,p_position integer)
returns public.lit_evaluation_sessions language plpgsql security definer set search_path=public as $$
declare result lit_evaluation_sessions;
begin
 if not exists(select 1 from lit_evaluation_sessions where id=p_session and user_id=auth.uid() and status='active') then raise exception 'session not found'; end if;
 update lit_evaluation_session_items set status='completed' where session_id=p_session and position=p_position;
 update lit_evaluation_sessions s set completed_count=(select count(*) from lit_evaluation_session_items i where i.session_id=s.id and i.status='completed'),status=case when (select count(*) from lit_evaluation_session_items i where i.session_id=s.id and i.status='completed')>=target_count then 'completed' else 'active' end,completed_at=case when (select count(*) from lit_evaluation_session_items i where i.session_id=s.id and i.status='completed')>=target_count then now() else null end where id=p_session returning * into result;return result;
end $$;
revoke all on function public.lit_complete_evaluation_item(uuid,integer) from public;grant execute on function public.lit_complete_evaluation_item(uuid,integer) to authenticated;
commit;
