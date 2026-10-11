-- FRAKTUM Literature frontend schema reconciliation.
-- This migration is intentionally additive/idempotent and consolidates every
-- v0.19 relation used by the browser so production cannot be repaired one
-- missing taxonomy table at a time.
begin;

-- These are the pre-v0.19 production relations. Their shape is authoritative;
-- abort rather than guessing or rebuilding tables that contain user data.
do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'lit_profiles','lit_works','lit_work_versions','lit_reviews','lit_review_reactions',
    'lit_posts','lit_post_media','lit_post_reactions','lit_comments','lit_comment_reactions',
    'lit_conversations','lit_conversation_members','lit_messages','lit_calls','lit_call_signals',
    'lit_notifications','lit_reading_progress','lit_reports','lit_author_verification_requests'
  ] loop
    if to_regclass('public.'||relation_name) is null then
      raise exception 'Missing required production baseline relation: public.%',relation_name;
    end if;
  end loop;
end $$;

-- Reconciled from 202610040001_identity_discovery.sql
-- FRAKTUM Literature v0.19: identity and discovery. Additive and data preserving.

alter table public.lit_profiles add column if not exists bio text not null default '' check (char_length(bio) <= 2000);
alter table public.lit_profiles add column if not exists current_status text not null default '' check (char_length(current_status) <= 160);
alter table public.lit_profiles add column if not exists banner_path text;
alter table public.lit_profiles add column if not exists interests text[] not null default '{}';
alter table public.lit_profiles add column if not exists favorite_topics text[] not null default '{}';
alter table public.lit_works add column if not exists writing_status text not null default 'draft'
  check (writing_status in ('draft','writing','editing','paused','completed'));

create table if not exists public.lit_genres (
  id bigint generated always as identity primary key, slug text not null unique, name text not null unique,
  parent_id bigint references public.lit_genres(id) on delete set null, active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.lit_topics (
  id bigint generated always as identity primary key, slug text not null unique, name text not null unique,
  group_name text not null default 'Other', active boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.lit_profile_genre_preferences (
  user_id uuid not null references public.lit_profiles(id) on delete cascade,
  genre_id bigint not null references public.lit_genres(id) on delete cascade,
  preference text not null check (preference in ('wanted','unwanted')), created_at timestamptz not null default now(),
  primary key (user_id,genre_id)
);
create table if not exists public.lit_profile_topic_preferences (
  user_id uuid not null references public.lit_profiles(id) on delete cascade,
  topic_id bigint not null references public.lit_topics(id) on delete cascade,
  preference text not null check (preference in ('wanted','unwanted')), created_at timestamptz not null default now(),
  primary key (user_id,topic_id)
);
create table if not exists public.lit_profile_favorite_books (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.lit_profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240), author_name text not null default '',
  cover_path text, external_url text check (external_url is null or external_url ~ '^https?://'),
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.lit_profile_social_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.lit_profiles(id) on delete cascade,
  platform text not null, label text not null, url text not null check (url ~ '^https?://'),
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.lit_follows (
  follower_id uuid not null references public.lit_profiles(id) on delete cascade,
  following_id uuid not null references public.lit_profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(follower_id,following_id),
  check (follower_id <> following_id)
);
create table if not exists public.lit_work_external_links (
  id uuid primary key default gen_random_uuid(), work_id uuid not null references public.lit_works(id) on delete cascade,
  author_id uuid not null references public.lit_profiles(id) on delete cascade,
  link_type text not null check(link_type in ('purchase','read','website','other')),
  platform text not null, label text not null, url text not null check(url ~ '^https?://'), sort_order integer not null default 0
);

alter table public.lit_genres enable row level security;
alter table public.lit_topics enable row level security;
alter table public.lit_profile_genre_preferences enable row level security;
alter table public.lit_profile_topic_preferences enable row level security;
alter table public.lit_profile_favorite_books enable row level security;
alter table public.lit_profile_social_links enable row level security;
alter table public.lit_follows enable row level security;
alter table public.lit_work_external_links enable row level security;

drop policy if exists "genres readable" on public.lit_genres;
create policy "genres readable" on public.lit_genres for select using (active);
drop policy if exists "topics readable" on public.lit_topics;
create policy "topics readable" on public.lit_topics for select using (active);

-- Profile details are public to authenticated readers, but only owners can mutate them.
do $$ declare t text; begin
  foreach t in array array['lit_profile_favorite_books','lit_profile_social_links'] loop
    execute format('drop policy if exists "authenticated read" on public.%I',t);
    execute format('create policy "authenticated read" on public.%I for select to authenticated using (true)',t);
    execute format('drop policy if exists "owner insert" on public.%I',t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id=auth.uid())',t);
    execute format('drop policy if exists "owner update" on public.%I',t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
    execute format('drop policy if exists "owner delete" on public.%I',t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id=auth.uid())',t);
  end loop;
  foreach t in array array['lit_profile_genre_preferences','lit_profile_topic_preferences'] loop
    execute format('drop policy if exists "owner read" on public.%I',t);
    execute format('create policy "owner read" on public.%I for select to authenticated using (user_id=auth.uid())',t);
    execute format('drop policy if exists "owner write" on public.%I',t);
    execute format('create policy "owner write" on public.%I for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid())',t);
  end loop;
end $$;
drop policy if exists "follows readable" on public.lit_follows;
create policy "follows readable" on public.lit_follows for select to authenticated using(true);
drop policy if exists "follower manages" on public.lit_follows;
create policy "follower manages" on public.lit_follows for all to authenticated using(follower_id=auth.uid()) with check(follower_id=auth.uid());
drop policy if exists "work links readable" on public.lit_work_external_links;
create policy "work links readable" on public.lit_work_external_links for select using(true);
drop policy if exists "author manages work links" on public.lit_work_external_links;
create policy "author manages work links" on public.lit_work_external_links for all to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());

create index if not exists lit_works_author_idx on public.lit_works(author_id);
create index if not exists lit_works_status_idx on public.lit_works(status,writing_status);
create index if not exists lit_profile_books_user_idx on public.lit_profile_favorite_books(user_id,sort_order);
create index if not exists lit_profile_social_user_idx on public.lit_profile_social_links(user_id,sort_order);
create index if not exists lit_follows_following_idx on public.lit_follows(following_id,created_at desc);
create index if not exists lit_work_links_work_idx on public.lit_work_external_links(work_id,sort_order);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lit-profile-banners','lit-profile-banners',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lit-avatars','lit-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select using(bucket_id='lit-avatars');
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects for insert to authenticated with check(bucket_id='lit-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update to authenticated using(bucket_id='lit-avatars' and owner_id=auth.uid()::text);

drop policy if exists "profile banners public read" on storage.objects;
create policy "profile banners public read" on storage.objects for select using(bucket_id='lit-profile-banners');
drop policy if exists "profile banners owner write" on storage.objects;
create policy "profile banners owner write" on storage.objects for insert to authenticated
with check(bucket_id='lit-profile-banners' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "profile banners owner update" on storage.objects;
create policy "profile banners owner update" on storage.objects for update to authenticated
using(bucket_id='lit-profile-banners' and owner_id=auth.uid()::text);

-- Seed is idempotent. Parent links are applied after all roots exist.
insert into public.lit_genres(slug,name,sort_order) values
('fantasy','Фэнтези',10),('high-fantasy','Высокое фэнтези',11),('dark-fantasy','Тёмное фэнтези',12),('urban-fantasy','Городское фэнтези',13),('historical-fantasy','Историческое фэнтези',14),
('science-fiction','Научная фантастика',20),('hard-sf','Твёрдая научная фантастика',21),('space-opera','Космоопера',22),('cyberpunk','Киберпанк',23),('steampunk','Стимпанк',24),('biopunk','Биопанк',25),
('post-apocalypse','Постапокалипсис',30),('apocalypse','Апокалипсис',31),('dystopia','Антиутопия',32),('utopia','Утопия',33),('alternate-history','Альтернативная история',34),
('historical-fiction','Исторический роман',40),('war-prose','Военная проза',41),('detective','Детектив',50),('crime-detective','Криминальный детектив',51),('historical-detective','Исторический детектив',52),
('thriller','Триллер',60),('psychological-thriller','Психологический триллер',61),('horror','Хоррор',70),('psychological-horror','Психологический хоррор',71),('body-horror','Боди-хоррор',72),('mysticism','Мистика',73),
('romance','Романтика',80),('romantic-drama','Романтическая драма',81),('drama','Драма',90),('tragedy','Трагедия',91),('comedy','Комедия',92),('satire','Сатира',93),('absurd','Абсурд',94),
('adventure','Приключения',100),('action','Боевик',101),('western','Вестерн',102),('political-prose','Политическая проза',110),('philosophical-prose','Философская проза',111),('existential-prose','Экзистенциальная проза',112),('social-prose','Социальная проза',113),
('slice-of-life','Повседневность',120),('coming-of-age','Coming-of-age',121),('biography','Биография',130),('autobiography','Автобиография',131),('memoir','Мемуары',132),('documentary-prose','Документальная проза',133),('essay','Эссе',134),
('poetry','Поэзия',140),('prose-poetry','Прозаическая поэзия',141),('folklore','Фольклор',150),('fairy-tale','Сказка',151),('mythology','Мифология',152),('litrpg','ЛитRPG',160),('gamelit','GameLit',161),
('magical-realism','Магический реализм',170),('surrealism','Сюрреализм',171),('noir','Нуар',172),('gothic','Готика',173),('young-adult','Young Adult',174),('childrens','Детская литература',175),('humor','Юмор',176),('short-prose','Малая проза',177)
on conflict(slug) do update set name=excluded.name,sort_order=excluded.sort_order,active=true;
update public.lit_genres child set parent_id=parent.id from public.lit_genres parent where
 (parent.slug='fantasy' and child.slug in ('high-fantasy','dark-fantasy','urban-fantasy','historical-fantasy')) or
 (parent.slug='science-fiction' and child.slug in ('hard-sf','space-opera','cyberpunk','steampunk','biopunk')) or
 (parent.slug='detective' and child.slug in ('crime-detective','historical-detective')) or
 (parent.slug='horror' and child.slug in ('psychological-horror','body-horror'));

insert into public.lit_topics(slug,name,group_name,sort_order) values
('friendship','Дружба','Relationships',10),('betrayal','Предательство','Relationships',11),('loneliness','Одиночество','Psychology',12),('family','Семья','Relationships',13),('parents-children','Отношения родителей и детей','Relationships',14),('love-triangle','Любовный треугольник','Relationships',15),('toxic-relationships','Токсичные отношения','Relationships',16),
('politics','Политика','Society',20),('religion','Религия','Society',21),('war','Война','Conflict',22),('bullying','Буллинг','Society',23),('mental-health','Ментальное здоровье','Psychology',24),('death','Смерть','Content',25),('moral-choice','Моральный выбор','Psychology',26),('revenge','Месть','Conflict',27),
('artificial-intelligence','Искусственный интеллект','Setting',30),('space','Космос','Setting',31),('magic','Магия','Setting',32),('school','Школа','Setting',33),('university','Университет','Setting',34),('travel','Путешествия','Setting',35),('survival','Выживание','Conflict',36),('inequality','Социальное неравенство','Society',37),
('found-family','Обретённая семья','Tropes',40),('enemies-to-lovers','От врагов к возлюбленным','Tropes',41),('chosen-one','Избранный','Tropes',42),('time-travel','Путешествия во времени','Tropes',43),('identity','Поиск идентичности','Psychology',44),('memory','Память','Psychology',45),('freedom','Свобода','Society',46),('power','Власть','Society',47),('ecology','Экология','Society',48),('crime','Преступление','Conflict',49),('addiction','Зависимость','Content',50),('disability','Инвалидность','Content',51),('migration','Миграция','Society',52),('technology','Технологии','Setting',53),('art','Искусство','Other',54),('sport','Спорт','Other',55),('work','Работа','Society',56),('coming-of-age-topic','Взросление','Psychology',57)
on conflict(slug) do update set name=excluded.name,group_name=excluded.group_name,sort_order=excluded.sort_order,active=true;

-- Safely migrate legacy arrays where names match the catalogue.
insert into public.lit_profile_genre_preferences(user_id,genre_id,preference)
select p.id,g.id,'wanted' from public.lit_profiles p cross join lateral unnest(coalesce(p.wanted_genres,'{}')) n(name) join public.lit_genres g on lower(g.name)=lower(n.name)
on conflict(user_id,genre_id) do nothing;
insert into public.lit_profile_genre_preferences(user_id,genre_id,preference)
select p.id,g.id,'unwanted' from public.lit_profiles p cross join lateral unnest(coalesce(p.unwanted_genres,'{}')) n(name) join public.lit_genres g on lower(g.name)=lower(n.name)
on conflict(user_id,genre_id) do nothing;


create or replace function public.lit_replace_my_profile_details(
  p_books jsonb default '[]'::jsonb, p_links jsonb default '[]'::jsonb,
  p_wanted_genres bigint[] default '{}', p_unwanted_genres bigint[] default '{}',
  p_wanted_topics bigint[] default '{}', p_unwanted_topics bigint[] default '{}'
) returns void language plpgsql security invoker set search_path=public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'authentication required'; end if;
  delete from lit_profile_favorite_books where user_id=me;
  delete from lit_profile_social_links where user_id=me;
  delete from lit_profile_genre_preferences where user_id=me;
  delete from lit_profile_topic_preferences where user_id=me;
  insert into lit_profile_favorite_books(user_id,title,author_name,external_url,sort_order)
    select me,x->>'title',coalesce(x->>'authorName',''),nullif(x->>'externalUrl',''),ordinality-1
    from jsonb_array_elements(p_books) with ordinality as rows(x,ordinality) where coalesce(x->>'title','')<>'';
  insert into lit_profile_social_links(user_id,platform,label,url,sort_order)
    select me,x->>'platform',x->>'label',x->>'url',ordinality-1
    from jsonb_array_elements(p_links) with ordinality as rows(x,ordinality) where coalesce(x->>'url','') ~ '^https?://';
  insert into lit_profile_genre_preferences(user_id,genre_id,preference)
    select me,id,'wanted' from unnest(p_wanted_genres) id
    union all select me,id,'unwanted' from unnest(p_unwanted_genres) id where not(id=any(p_wanted_genres));
  insert into lit_profile_topic_preferences(user_id,topic_id,preference)
    select me,id,'wanted' from unnest(p_wanted_topics) id
    union all select me,id,'unwanted' from unnest(p_unwanted_topics) id where not(id=any(p_wanted_topics));
end $$;
revoke all on function public.lit_replace_my_profile_details(jsonb,jsonb,bigint[],bigint[],bigint[],bigint[]) from public;
grant execute on function public.lit_replace_my_profile_details(jsonb,jsonb,bigint[],bigint[],bigint[],bigint[]) to authenticated;


-- Reconciled from 202610040002_evaluation_fragments.sql
-- FRAKTUM Literature v0.19: evaluation sessions and public fragments.
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

-- Reconciled from 202610040003_annotations_feedback.sql
create table if not exists public.lit_review_annotations (
 id uuid primary key default gen_random_uuid(), reviewer_id uuid not null references public.lit_profiles(id) on delete cascade,
 work_id uuid references public.lit_works(id) on delete cascade, version_id uuid references public.lit_work_versions(id) on delete cascade,
 fragment_id uuid references public.lit_fragments(id) on delete cascade, review_id uuid references public.lit_reviews(id) on delete set null,
 annotation_type text not null check(annotation_type in ('unclear','strange','disputed','comment')),
 block_id text, start_offset integer, end_offset integer, selected_text text not null,
 prefix_text text, suffix_text text, body text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(work_id is not null or fragment_id is not null), check(start_offset is null or start_offset>=0), check(end_offset is null or end_offset>=start_offset)
);
alter table public.lit_review_annotations enable row level security;
drop policy if exists "annotation participant read" on public.lit_review_annotations;
create policy "annotation participant read" on public.lit_review_annotations for select to authenticated using(reviewer_id=auth.uid() or exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid()) or exists(select 1 from public.lit_fragments f where f.id=fragment_id and f.author_id=auth.uid()));
drop policy if exists "reviewer inserts annotation" on public.lit_review_annotations;
create policy "reviewer inserts annotation" on public.lit_review_annotations for insert to authenticated with check(reviewer_id=auth.uid() and not exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid()));
drop policy if exists "reviewer updates annotation" on public.lit_review_annotations;
create policy "reviewer updates annotation" on public.lit_review_annotations for update to authenticated using(reviewer_id=auth.uid()) with check(reviewer_id=auth.uid());
drop policy if exists "reviewer deletes annotation" on public.lit_review_annotations;
create policy "reviewer deletes annotation" on public.lit_review_annotations for delete to authenticated using(reviewer_id=auth.uid());
create index if not exists lit_annotations_work_version_idx on public.lit_review_annotations(work_id,version_id,created_at desc);
create index if not exists lit_annotations_fragment_idx on public.lit_review_annotations(fragment_id,created_at desc);
create index if not exists lit_annotations_reviewer_idx on public.lit_review_annotations(reviewer_id,created_at desc);

-- Reconciled from 202610040004_achievements.sql
create table if not exists public.lit_achievements(id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,description text not null,category text not null check(category in ('reader','author','reviewer','social','special')),icon text not null,rarity text not null default 'common',condition_type text not null,condition_value integer not null check(condition_value>0),active boolean not null default true);
create table if not exists public.lit_user_achievements(user_id uuid not null references public.lit_profiles(id) on delete cascade,achievement_id uuid not null references public.lit_achievements(id) on delete cascade,earned_at timestamptz,progress integer not null default 0 check(progress>=0),showcase_order integer check(showcase_order between 1 and 5),primary key(user_id,achievement_id));
alter table public.lit_achievements enable row level security;alter table public.lit_user_achievements enable row level security;
drop policy if exists "achievements readable" on public.lit_achievements;create policy "achievements readable" on public.lit_achievements for select using(active);drop policy if exists "user achievements readable" on public.lit_user_achievements;create policy "user achievements readable" on public.lit_user_achievements for select to authenticated using(true);
-- Deliberately no client INSERT/UPDATE/DELETE policy on awards.
create index if not exists lit_user_achievements_user_idx on public.lit_user_achievements(user_id,earned_at desc);
insert into public.lit_achievements(slug,name,description,category,icon,condition_type,condition_value,rarity) values
('first-work','Первый текст','Опубликовать первое произведение','author','✒','published_works',1,'common'),('first-review','Первый критик','Написать первую рецензию','reviewer','◆','reviews',1,'common'),('critic','Критик','Написать 10 рецензий','reviewer','◇','reviews',10,'rare'),('observer','Наблюдатель','Создать 25 inline-пометок','reviewer','◉','annotations',25,'rare'),('first-readers','Первые читатели','Получить 10 подписчиков','social','✦','followers',10,'rare') on conflict(slug) do update set name=excluded.name,description=excluded.description,active=true;
create or replace function public.lit_evaluate_my_achievements() returns void language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); achievement record; current_value integer;
begin if me is null then raise exception 'authentication required';end if;
 for achievement in select * from lit_achievements where active loop
  current_value:=case achievement.condition_type when 'published_works' then (select count(*) from lit_works where author_id=me and status='published') when 'reviews' then (select count(*) from lit_reviews where reviewer_id=me) when 'annotations' then (select count(*) from lit_review_annotations where reviewer_id=me) when 'followers' then (select count(*) from lit_follows where following_id=me) else 0 end;
  insert into lit_user_achievements(user_id,achievement_id,progress,earned_at) values(me,achievement.id,least(current_value,achievement.condition_value),case when current_value>=achievement.condition_value then now() else null end)
  on conflict(user_id,achievement_id) do update set progress=excluded.progress,earned_at=coalesce(lit_user_achievements.earned_at,excluded.earned_at);
 end loop;end $$;
revoke all on function public.lit_evaluate_my_achievements() from public;grant execute on function public.lit_evaluate_my_achievements() to authenticated;

-- Reconciled from 202610110003_taxonomy_v2_production_reconciliation.sql
-- Reconcile Taxonomy v2 in production when 202610110001 was not applied.
-- Additive and idempotent: no legacy columns or user data are removed.

-- The existing Literature schema uses UUID work/profile identifiers and bigint
-- genre identifiers. Abort before any DDL if the linked project differs.
do $$
declare
  actual_type text;
begin
  if to_regclass('public.lit_works') is null
     or to_regclass('public.lit_profiles') is null
     or to_regclass('public.lit_genres') is null then
    raise exception 'Taxonomy v2 prerequisites are missing: lit_works, lit_profiles and lit_genres must exist';
  end if;

  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_works' and column_name='id';
  if actual_type is distinct from 'uuid' then raise exception 'Expected lit_works.id uuid, found %',coalesce(actual_type,'missing'); end if;
  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_works' and column_name='author_id';
  if actual_type is distinct from 'uuid' then raise exception 'Expected lit_works.author_id uuid, found %',coalesce(actual_type,'missing'); end if;
  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_works' and column_name='genres';
  if actual_type is distinct from '_text' then raise exception 'Expected lit_works.genres text[], found %',coalesce(actual_type,'missing'); end if;
  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_works' and column_name='status';
  if actual_type is distinct from 'text' then raise exception 'Expected lit_works.status text, found %',coalesce(actual_type,'missing'); end if;
  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_profiles' and column_name='id';
  if actual_type is distinct from 'uuid' then raise exception 'Expected lit_profiles.id uuid, found %',coalesce(actual_type,'missing'); end if;
  select udt_name into actual_type from information_schema.columns
   where table_schema='public' and table_name='lit_genres' and column_name='id';
  if actual_type is distinct from 'int8' then raise exception 'Expected lit_genres.id bigint, found %',coalesce(actual_type,'missing'); end if;
end $$;

create table if not exists public.lit_work_formats (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0
);
create table if not exists public.lit_audience_segments (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0
);
create table if not exists public.lit_tags (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  group_name text not null,
  adult_only boolean not null default false,
  content_warning boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  aliases text[] not null default '{}',
  unique(group_name,name)
);
create table if not exists public.lit_work_genres (
  work_id uuid not null references public.lit_works(id) on delete cascade,
  genre_id bigint not null references public.lit_genres(id) on delete restrict,
  is_primary boolean not null default false,
  primary key(work_id,genre_id)
);
create table if not exists public.lit_work_audiences (
  work_id uuid not null references public.lit_works(id) on delete cascade,
  audience_id bigint not null references public.lit_audience_segments(id) on delete restrict,
  primary key(work_id,audience_id)
);
create table if not exists public.lit_work_tags (
  work_id uuid not null references public.lit_works(id) on delete cascade,
  tag_id bigint not null references public.lit_tags(id) on delete restrict,
  primary key(work_id,tag_id)
);
create table if not exists public.lit_profile_format_preferences (
  user_id uuid not null references public.lit_profiles(id) on delete cascade,
  format_id bigint not null references public.lit_work_formats(id) on delete cascade,
  preference text not null check(preference in ('wanted','unwanted','blocked')),
  primary key(user_id,format_id)
);
create table if not exists public.lit_profile_audience_preferences (
  user_id uuid not null references public.lit_profiles(id) on delete cascade,
  audience_id bigint not null references public.lit_audience_segments(id) on delete cascade,
  preference text not null check(preference in ('wanted','unwanted','blocked')),
  primary key(user_id,audience_id)
);
create table if not exists public.lit_profile_tag_preferences (
  user_id uuid not null references public.lit_profiles(id) on delete cascade,
  tag_id bigint not null references public.lit_tags(id) on delete cascade,
  preference text not null check(preference in ('wanted','unwanted','blocked')),
  primary key(user_id,tag_id)
);

alter table public.lit_works add column if not exists format_id bigint references public.lit_work_formats(id) on delete set null;
alter table public.lit_works add column if not exists content_rating text not null default 'general'
  check(content_rating in ('general','teen','mature','adult_18'));
alter table public.lit_profiles add column if not exists adult_content_enabled boolean not null default false;

alter table public.lit_work_formats enable row level security;
alter table public.lit_audience_segments enable row level security;
alter table public.lit_tags enable row level security;
alter table public.lit_work_genres enable row level security;
alter table public.lit_work_audiences enable row level security;
alter table public.lit_work_tags enable row level security;
alter table public.lit_profile_format_preferences enable row level security;
alter table public.lit_profile_audience_preferences enable row level security;
alter table public.lit_profile_tag_preferences enable row level security;

do $$ declare t text; begin
  foreach t in array array['lit_work_formats','lit_audience_segments','lit_tags'] loop
    execute format('drop policy if exists "active taxonomy read" on public.%I',t);
    execute format('create policy "active taxonomy read" on public.%I for select to anon, authenticated using(active)',t);
  end loop;
  foreach t in array array['lit_work_genres','lit_work_audiences','lit_work_tags'] loop
    execute format('drop policy if exists "published taxonomy read" on public.%I',t);
    execute format('create policy "published taxonomy read" on public.%I for select to anon, authenticated using(exists(select 1 from public.lit_works w where w.id=work_id and (w.status=''published'' or w.author_id=auth.uid())))',t);
    execute format('drop policy if exists "author taxonomy write" on public.%I',t);
    execute format('create policy "author taxonomy write" on public.%I for all to authenticated using(exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid())) with check(exists(select 1 from public.lit_works w where w.id=work_id and w.author_id=auth.uid()))',t);
  end loop;
  foreach t in array array['lit_profile_format_preferences','lit_profile_audience_preferences','lit_profile_tag_preferences'] loop
    execute format('drop policy if exists "owner preferences" on public.%I',t);
    execute format('create policy "owner preferences" on public.%I for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',t);
  end loop;
end $$;

grant select on public.lit_work_formats,public.lit_audience_segments,public.lit_tags to anon,authenticated;
grant select on public.lit_work_genres,public.lit_work_audiences,public.lit_work_tags to anon,authenticated;
grant insert,update,delete on public.lit_work_genres,public.lit_work_audiences,public.lit_work_tags to authenticated;
grant select,insert,update,delete on public.lit_profile_format_preferences,public.lit_profile_audience_preferences,public.lit_profile_tag_preferences to authenticated;

create unique index if not exists lit_work_one_primary_genre_idx on public.lit_work_genres(work_id) where is_primary;
create index if not exists lit_work_genres_genre_idx on public.lit_work_genres(genre_id,work_id);
create index if not exists lit_work_audiences_audience_idx on public.lit_work_audiences(audience_id,work_id);
create index if not exists lit_work_tags_tag_idx on public.lit_work_tags(tag_id,work_id);
create index if not exists lit_profile_format_pref_user_idx on public.lit_profile_format_preferences(user_id,preference);
create index if not exists lit_profile_audience_pref_user_idx on public.lit_profile_audience_preferences(user_id,preference);
create index if not exists lit_profile_tag_pref_user_idx on public.lit_profile_tag_preferences(user_id,preference);

insert into public.lit_work_formats(slug,name,sort_order) values
 ('book','Обычная книга',1),('novel','Роман',2),('novella','Повесть',3),('story','Рассказ',4),('collection','Сборник',5),
 ('manga','Манга',10),('manhwa','Манхва',11),('manhua','Маньхуа',12),('light-novel','Ранобэ',13),('web-novel','Веб-новелла',14),
 ('comic','Комикс',15),('graphic-novel','Графический роман',16),('fanfic','Фанфик',17),('poetry','Поэзия',18),('essay','Эссе',19)
on conflict(slug) do update set name=excluded.name,active=true,sort_order=excluded.sort_order;
insert into public.lit_audience_segments(slug,name,sort_order) values
 ('all','Для всех',1),('middle-grade','Middle Grade',2),('young-adult','Young Adult',3),('new-adult','New Adult',4),('adult','Взрослая аудитория',5),
 ('shonen','Сёнэн',10),('seinen','Сэйнэн',11),('shojo','Сёдзё',12),('josei','Дзёсэй',13)
on conflict(slug) do update set name=excluded.name,active=true,sort_order=excluded.sort_order;
insert into public.lit_tags(slug,name,group_name,adult_only,content_warning,sort_order) values
 ('antihero','Антигерой','Главный герой',false,false,1),('unreliable-narrator','Ненадёжный рассказчик','Главный герой',false,false,2),('strong-heroine','Сильная героиня','Главный герой',false,false,3),
 ('friendship','Дружба','Отношения',false,false,10),('family','Семья','Отношения',false,false,11),('found-family','Обретённая семья','Отношения',false,false,12),('betrayal','Предательство','Отношения',false,false,13),('enemies-to-lovers','От врагов к возлюбленным','Отношения',false,false,14),
 ('loneliness','Одиночество','Темы',false,false,20),('moral-choice','Моральный выбор','Темы',false,false,21),('revenge','Месть','Темы',false,false,22),('freedom','Свобода','Темы',false,false,23),('power','Власть','Темы',false,false,24),('memory','Память','Темы',false,false,25),
 ('investigation','Расследование','Сюжетные элементы',false,false,30),('journey','Путешествие','Сюжетные элементы',false,false,31),('survival','Выживание','Сюжетные элементы',false,false,32),('conspiracy','Заговор','Сюжетные элементы',false,false,33),('mystery','Тайна','Сюжетные элементы',false,false,34),('time-travel','Путешествия во времени','Сюжетные элементы',false,false,35),
 ('space','Космос','Сеттинг',false,false,40),('school','Школа','Сеттинг',false,false,41),('university','Университет','Сеттинг',false,false,42),('metropolis','Мегаполис','Сеттинг',false,false,43),('future','Далёкое будущее','Сеттинг',false,false,44),
 ('first-person','От первого лица','Стиль',false,false,50),('multiple-pov','Несколько точек зрения','Стиль',false,false,51),('nonlinear','Нелинейное повествование','Стиль',false,false,52),
 ('dark-tone','Мрачный','Тон',false,false,60),('cozy','Уютный','Тон',false,false,61),('melancholic','Меланхоличный','Тон',false,false,62),
 ('magic','Магия','Мир',false,false,70),('ai','Искусственный интеллект','Мир',false,false,71),('dragons','Драконы','Мир',false,false,72),('vampires','Вампиры','Мир',false,false,73),
 ('violence','Сцены насилия','Жестокость',false,true,80),('graphic-violence','Графическое насилие','Жестокость',true,true,81),
 ('character-death','Смерть персонажа','Предупреждения',false,true,90),('sexual-violence','Сексуальное насилие','Предупреждения',true,true,91),('coercion','Принуждение','Предупреждения',true,true,92),('self-harm','Самоповреждение','Предупреждения',false,true,93),('suicide','Суицидальные темы','Предупреждения',false,true,94),('addiction','Зависимость','Предупреждения',false,true,95),
 ('happy-ending','Счастливый финал','Финал',false,false,100),('open-ending','Открытый финал','Финал',false,false,101),('tragic-ending','Трагический финал','Финал',false,false,102),
 ('mythology','Мифология','Вдохновение',false,false,110),('folklore','Фольклор','Вдохновение',false,false,111),('history','Исторические события','Вдохновение',false,false,112)
on conflict(slug) do update set name=excluded.name,group_name=excluded.group_name,adult_only=excluded.adult_only,content_warning=excluded.content_warning,active=true,sort_order=excluded.sort_order;

create or replace function public.lit_replace_work_taxonomy(p_work uuid,p_format bigint,p_genres bigint[] default '{}',p_audiences bigint[] default '{}',p_tags bigint[] default '{}') returns void
language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from lit_works where id=p_work and author_id=auth.uid()) then raise exception 'work not found'; end if;
  update lit_works set format_id=p_format where id=p_work;
  delete from lit_work_genres where work_id=p_work; delete from lit_work_audiences where work_id=p_work; delete from lit_work_tags where work_id=p_work;
  insert into lit_work_genres(work_id,genre_id,is_primary) select p_work,id,ordinality=1 from unnest(p_genres[1:3]) with ordinality x(id,ordinality);
  insert into lit_work_audiences(work_id,audience_id) select p_work,id from unnest(p_audiences) id;
  insert into lit_work_tags(work_id,tag_id) select p_work,id from unnest(p_tags[1:30]) id;
end $$;
revoke all on function public.lit_replace_work_taxonomy(uuid,bigint,bigint[],bigint[],bigint[]) from public,anon;
grant execute on function public.lit_replace_work_taxonomy(uuid,bigint,bigint[],bigint[],bigint[]) to authenticated;

create or replace function public.lit_replace_my_taxonomy_v2_preferences(p_formats jsonb default '[]',p_audiences jsonb default '[]',p_tags jsonb default '[]') returns void
language plpgsql security invoker set search_path=public as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'authentication required'; end if;
  delete from lit_profile_format_preferences where user_id=me; delete from lit_profile_audience_preferences where user_id=me; delete from lit_profile_tag_preferences where user_id=me;
  insert into lit_profile_format_preferences(user_id,format_id,preference) select me,(x->>'id')::bigint,x->>'preference' from jsonb_array_elements(p_formats) x where x->>'preference' in ('wanted','unwanted','blocked');
  insert into lit_profile_audience_preferences(user_id,audience_id,preference) select me,(x->>'id')::bigint,x->>'preference' from jsonb_array_elements(p_audiences) x where x->>'preference' in ('wanted','unwanted','blocked');
  insert into lit_profile_tag_preferences(user_id,tag_id,preference) select me,(x->>'id')::bigint,x->>'preference' from jsonb_array_elements(p_tags) x where x->>'preference' in ('wanted','unwanted','blocked');
end $$;
revoke all on function public.lit_replace_my_taxonomy_v2_preferences(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.lit_replace_my_taxonomy_v2_preferences(jsonb,jsonb,jsonb) to authenticated;

-- Preserve the legacy text[] genres while backfilling normalized links.
insert into public.lit_work_genres(work_id,genre_id,is_primary)
select w.id,g.id,false from public.lit_works w
cross join lateral unnest(coalesce(w.genres,'{}')) n(name)
join public.lit_genres g on lower(g.name)=lower(n.name)
on conflict do nothing;

-- Force PostgREST to see the newly created relations immediately after commit.
notify pgrst, 'reload schema';

-- Explicit API privileges. RLS remains the authorization boundary.
grant select on public.lit_genres,public.lit_topics,public.lit_achievements to anon,authenticated;
grant select on public.lit_profile_favorite_books,public.lit_profile_social_links,public.lit_follows,public.lit_work_external_links to authenticated;
grant select,insert,update,delete on public.lit_profile_favorite_books,public.lit_profile_social_links,public.lit_profile_genre_preferences,public.lit_profile_topic_preferences,public.lit_follows,public.lit_work_external_links to authenticated;
grant select on public.lit_fragments to anon,authenticated;
grant insert,update,delete on public.lit_fragments to authenticated;
grant select,insert,update,delete on public.lit_evaluation_preferences,public.lit_evaluation_sessions,public.lit_evaluation_session_items,public.lit_review_annotations to authenticated;
grant select on public.lit_user_achievements to authenticated;

-- Validate the complete static frontend contract after reconciliation.
do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'lit_profiles','lit_works','lit_work_versions','lit_reviews','lit_review_reactions',
    'lit_posts','lit_post_media','lit_post_reactions','lit_comments','lit_comment_reactions',
    'lit_conversations','lit_conversation_members','lit_messages','lit_calls','lit_call_signals',
    'lit_notifications','lit_reading_progress','lit_reports','lit_author_verification_requests',
    'lit_genres','lit_topics','lit_profile_genre_preferences','lit_profile_topic_preferences',
    'lit_profile_favorite_books','lit_profile_social_links','lit_follows','lit_work_external_links',
    'lit_fragments','lit_evaluation_preferences','lit_evaluation_sessions','lit_evaluation_session_items',
    'lit_review_annotations','lit_achievements','lit_user_achievements',
    'lit_work_formats','lit_audience_segments','lit_tags','lit_work_genres','lit_work_audiences','lit_work_tags',
    'lit_profile_format_preferences','lit_profile_audience_preferences','lit_profile_tag_preferences'
  ] loop
    if to_regclass('public.'||relation_name) is null then
      raise exception 'Frontend schema reconciliation failed: public.% is absent',relation_name;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
