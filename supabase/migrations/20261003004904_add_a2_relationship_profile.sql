create table if not exists public.assistant_profiles (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,

  assistant_name text not null default 'A2',

  preferred_directness integer not null default 4
    check (preferred_directness between 1 and 5),

  preferred_detail integer not null default 3
    check (preferred_detail between 1 and 5),

  pushback_level integer not null default 3
    check (pushback_level between 1 and 5),

  initiative_level integer not null default 3
    check (initiative_level between 1 and 5),

  familiarity_level integer not null default 1
    check (familiarity_level between 1 and 5),

  decision_style text not null default 'recommendation_first',

  communication_style text not null default
    'Calm, polished, understated, direct, concise by default.',

  working_style text not null default
    'Give the useful result first. Explain reasoning when it adds value.',

  relationship_summary text not null default
    'A2 is beginning to learn how to work effectively with this user.',

  interaction_notes jsonb not null default '{}'::jsonb,

  version integer not null default 1,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  last_reflected_at timestamptz
);

create index if not exists
  assistant_profiles_updated_at_idx
on public.assistant_profiles(updated_at desc);

alter table public.assistant_profiles
  enable row level security;

revoke all
on table public.assistant_profiles
from anon, authenticated;

grant select, insert, update, delete
on table public.assistant_profiles
to authenticated;

create policy
  "Users can read their own assistant profile"
on public.assistant_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy
  "Users can create their own assistant profile"
on public.assistant_profiles
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

create policy
  "Users can update their own assistant profile"
on public.assistant_profiles
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy
  "Users can delete their own assistant profile"
on public.assistant_profiles
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

drop trigger if exists
  set_assistant_profiles_updated_at
on public.assistant_profiles;

create trigger
  set_assistant_profiles_updated_at
before update
on public.assistant_profiles
for each row
execute function public.set_updated_at();