-- Reconcile Taxonomy v2 in production when 202610110001 was not applied.
-- Additive and idempotent: no legacy columns or user data are removed.
begin;

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
commit;
