begin;
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
commit;
