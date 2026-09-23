-- QuizMe initial schema. Every table is owned per user and protected by RLS.
-- Child tables carry user_id too, so policies never need joins.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.quiz_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'flashcard')),
  source_text text not null,
  generation_options jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  is_graded boolean not null default false,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  created_at timestamptz not null default now()
);
create index quiz_sets_user_created_idx on public.quiz_sets (user_id, kind, created_at desc);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null,
  type text not null check (type in ('multiple_choice', 'ox', 'short_answer')),
  question text not null,
  options jsonb,
  answer text not null,
  accepted_answers jsonb,
  explanation text,
  concept text
);
create index questions_set_idx on public.questions (set_id, position);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.quiz_sets (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null,
  term text not null,
  definition text not null
);
create index flashcards_set_idx on public.flashcards (set_id, position);

-- One row per grading. Kept even when its quiz set is deleted, so history and stats survive.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid references public.quiz_sets (id) on delete set null,
  generation_options jsonb not null,
  created_at timestamptz not null default now()
);
create index attempts_user_created_idx on public.attempts (user_id, created_at desc);

-- Question text/concept are copied in, so analytics don't depend on the set still existing.
create table public.attempt_answers (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null,
  question_id uuid references public.questions (id) on delete set null,
  question text not null,
  type text not null check (type in ('multiple_choice', 'ox', 'short_answer')),
  concept text,
  user_answer text not null,
  correct_answer text not null,
  is_correct boolean not null
);
create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id, position);
create index attempt_answers_user_concept_idx on public.attempt_answers (user_id, concept);

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.quiz_sets enable row level security;
alter table public.questions enable row level security;
alter table public.flashcards enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "quiz_sets: own rows" on public.quiz_sets
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Children must also point at a parent the user owns, otherwise rows could be attached to someone else's set.
create policy "questions: own rows" on public.questions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.quiz_sets s where s.id = set_id and s.user_id = (select auth.uid()))
  );

create policy "flashcards: own rows" on public.flashcards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.quiz_sets s where s.id = set_id and s.user_id = (select auth.uid()))
  );

create policy "attempts: own rows" on public.attempts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (set_id is null or exists (select 1 from public.quiz_sets s where s.id = set_id and s.user_id = (select auth.uid())))
  );

create policy "attempt_answers: own rows" on public.attempt_answers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = (select auth.uid()))
  );
