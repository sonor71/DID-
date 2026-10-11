begin;
create table if not exists public.lit_achievements(id uuid primary key default gen_random_uuid(),slug text not null unique,name text not null,description text not null,category text not null check(category in ('reader','author','reviewer','social','special')),icon text not null,rarity text not null default 'common',condition_type text not null,condition_value integer not null check(condition_value>0),active boolean not null default true);
create table if not exists public.lit_user_achievements(user_id uuid not null references public.lit_profiles(id) on delete cascade,achievement_id uuid not null references public.lit_achievements(id) on delete cascade,earned_at timestamptz,progress integer not null default 0 check(progress>=0),showcase_order integer check(showcase_order between 1 and 5),primary key(user_id,achievement_id));
alter table public.lit_achievements enable row level security;alter table public.lit_user_achievements enable row level security;
create policy "achievements readable" on public.lit_achievements for select using(active);create policy "user achievements readable" on public.lit_user_achievements for select to authenticated using(true);
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
commit;
