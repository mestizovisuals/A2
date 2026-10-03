create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  title text not null
    check (char_length(trim(title)) > 0),

  notes text,

  status text not null default 'open'
    check (
      status in (
        'open',
        'in_progress',
        'completed',
        'cancelled'
      )
    ),

  priority integer not null default 3
    check (priority between 1 and 5),

  due_at timestamptz,

  completed_at timestamptz,

  source text not null default 'manual'
    check (
      source in (
        'manual',
        'a2',
        'calendar',
        'email',
        'project'
      )
    ),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index if not exists
  tasks_user_status_idx
on public.tasks (
  user_id,
  status
);

create index if not exists
  tasks_user_due_at_idx
on public.tasks (
  user_id,
  due_at
);

create index if not exists
  tasks_user_priority_idx
on public.tasks (
  user_id,
  priority desc
);

alter table public.tasks
  enable row level security;

revoke all
on table public.tasks
from anon, authenticated;

grant
  select,
  insert,
  update,
  delete
on table public.tasks
to authenticated;

create policy
  "Users can read their own tasks"
on public.tasks
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy
  "Users can create their own tasks"
on public.tasks
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

create policy
  "Users can update their own tasks"
on public.tasks
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy
  "Users can delete their own tasks"
on public.tasks
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

drop trigger if exists
  set_tasks_updated_at
on public.tasks;

create trigger
  set_tasks_updated_at
before update
on public.tasks
for each row
execute function public.set_updated_at();