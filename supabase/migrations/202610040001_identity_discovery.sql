-- FRAKTUM Literature v0.19: identity and discovery. Additive and data preserving.
begin;

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

commit;
