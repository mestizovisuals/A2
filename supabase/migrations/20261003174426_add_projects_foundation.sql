-- ============================================================
-- A2 PROJECTS FOUNDATION
-- ============================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,

  summary text,

  objective text,

  next_step text,

  status text not null
    default 'active'
    check (
      status in (
        'active',
        'on_hold',
        'completed',
        'archived'
      )
    ),

  priority integer not null
    default 3
    check (
      priority >= 1
      and priority <= 5
    ),

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  last_activity_at timestamptz not null
    default now(),

  constraint projects_name_not_empty
    check (
      char_length(
        trim(name)
      ) > 0
    )
);

-- ------------------------------------------------------------
-- PREVENT DUPLICATE PROJECT NAMES PER USER
-- ------------------------------------------------------------

create unique index if not exists
  projects_user_name_unique_idx
on public.projects (
  user_id,
  lower(trim(name))
);

-- ------------------------------------------------------------
-- USEFUL PROJECT INDEXES
-- ------------------------------------------------------------

create index if not exists
  projects_user_status_idx
on public.projects (
  user_id,
  status
);

create index if not exists
  projects_user_activity_idx
on public.projects (
  user_id,
  last_activity_at desc
);

create index if not exists
  projects_user_priority_idx
on public.projects (
  user_id,
  priority desc
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function
  public.set_projects_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();

  return new;
end;
$$;

drop trigger if exists
  projects_set_updated_at
on public.projects;

create trigger
  projects_set_updated_at
before update
on public.projects
for each row
execute function
  public.set_projects_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table
  public.projects
enable row level security;

drop policy if exists
  "Users can read own projects"
on public.projects;

create policy
  "Users can read own projects"
on public.projects
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can create own projects"
on public.projects;

create policy
  "Users can create own projects"
on public.projects
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can update own projects"
on public.projects;

create policy
  "Users can update own projects"
on public.projects
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can delete own projects"
on public.projects;

create policy
  "Users can delete own projects"
on public.projects
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

-- ------------------------------------------------------------
-- TABLE PRIVILEGES
-- ------------------------------------------------------------

revoke all
on table public.projects
from anon;

grant
  select,
  insert,
  update,
  delete
on table public.projects
to authenticated;

-- ============================================================
-- LINK TODAY TASKS TO PROJECTS
-- ============================================================

alter table public.tasks
add column if not exists
  project_id uuid
  references public.projects(id)
  on delete set null;

create index if not exists
  tasks_user_project_idx
on public.tasks (
  user_id,
  project_id
);

-- ============================================================
-- ENSURE TASK AND PROJECT BELONG TO SAME USER
-- ============================================================

create or replace function
  public.validate_task_project_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.projects
    where id = new.project_id
      and user_id = new.user_id
  ) then
    raise exception
      'Task project must belong to the same user';
  end if;

  return new;
end;
$$;

drop trigger if exists
  tasks_validate_project_owner
on public.tasks;

create trigger
  tasks_validate_project_owner
before insert or update
on public.tasks
for each row
execute function
  public.validate_task_project_owner();