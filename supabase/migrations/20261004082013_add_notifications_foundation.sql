-- ============================================================
-- A2 PROACTIVE NOTIFICATIONS FOUNDATION
-- ============================================================

-- ============================================================
-- NOTIFICATION PREFERENCES
-- One row per authenticated user.
-- ============================================================

create table if not exists public.notification_preferences (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade,

  enabled boolean not null
    default true,

  task_reminders boolean not null
    default true,

  overdue_alerts boolean not null
    default true,

  project_followups boolean not null
    default true,

  daily_brief boolean not null
    default true,

  push_enabled boolean not null
    default false,

  task_reminder_minutes integer not null
    default 30
    check (
      task_reminder_minutes >= 0
      and
      task_reminder_minutes <= 10080
    ),

  daily_brief_time time not null
    default '08:00',

  quiet_hours_enabled boolean not null
    default true,

  quiet_hours_start time not null
    default '22:00',

  quiet_hours_end time not null
    default '07:00',

  timezone text not null
    default 'UTC',

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now()
);

-- ============================================================
-- NOTIFICATIONS
-- Persistent notification/inbox events.
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  kind text not null
    check (
      kind in (
        'task_reminder',
        'task_overdue',
        'project_followup',
        'project_missing_next_step',
        'daily_brief',
        'system'
      )
    ),

  title text not null,

  body text not null,

  priority integer not null
    default 3
    check (
      priority >= 1
      and
      priority <= 5
    ),

  task_id uuid
    references public.tasks(id)
    on delete set null,

  project_id uuid
    references public.projects(id)
    on delete set null,

  scheduled_for timestamptz,

  status text not null
    default 'pending'
    check (
      status in (
        'pending',
        'delivered',
        'read',
        'dismissed'
      )
    ),

  dedupe_key text,

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default now(),

  delivered_at timestamptz,

  read_at timestamptz,

  dismissed_at timestamptz,

  constraint notifications_title_not_empty
    check (
      char_length(
        trim(title)
      ) > 0
    ),

  constraint notifications_body_not_empty
    check (
      char_length(
        trim(body)
      ) > 0
    )
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists
  notifications_user_status_idx
on public.notifications (
  user_id,
  status,
  created_at desc
);

create index if not exists
  notifications_user_schedule_idx
on public.notifications (
  user_id,
  scheduled_for
);

create index if not exists
  notifications_user_task_idx
on public.notifications (
  user_id,
  task_id
);

create index if not exists
  notifications_user_project_idx
on public.notifications (
  user_id,
  project_id
);

-- Prevent the same logical notification from being generated twice.

create unique index if not exists
  notifications_user_dedupe_unique_idx
on public.notifications (
  user_id,
  dedupe_key
)
where dedupe_key is not null;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function
  public.set_notification_preferences_updated_at()
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
  notification_preferences_set_updated_at
on public.notification_preferences;

create trigger
  notification_preferences_set_updated_at
before update
on public.notification_preferences
for each row
execute function
  public.set_notification_preferences_updated_at();

-- ============================================================
-- AUTOMATIC DEFAULT PREFERENCES
--
-- Existing users get rows below.
-- Future users will get preferences lazily from the app/function,
-- so we do not need an auth.users trigger.
-- ============================================================

insert into public.notification_preferences (
  user_id
)
select
  id
from auth.users
on conflict (
  user_id
)
do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table
  public.notification_preferences
enable row level security;

alter table
  public.notifications
enable row level security;

-- ------------------------------------------------------------
-- NOTIFICATION PREFERENCES POLICIES
-- ------------------------------------------------------------

drop policy if exists
  "Users can read own notification preferences"
on public.notification_preferences;

create policy
  "Users can read own notification preferences"
on public.notification_preferences
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can create own notification preferences"
on public.notification_preferences;

create policy
  "Users can create own notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can update own notification preferences"
on public.notification_preferences;

create policy
  "Users can update own notification preferences"
on public.notification_preferences
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

-- Preferences should not normally be deleted from the app.

-- ------------------------------------------------------------
-- NOTIFICATION POLICIES
-- ------------------------------------------------------------

drop policy if exists
  "Users can read own notifications"
on public.notifications;

create policy
  "Users can read own notifications"
on public.notifications
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can create own notifications"
on public.notifications;

create policy
  "Users can create own notifications"
on public.notifications
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can update own notifications"
on public.notifications;

create policy
  "Users can update own notifications"
on public.notifications
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can delete own notifications"
on public.notifications;

create policy
  "Users can delete own notifications"
on public.notifications
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

-- ============================================================
-- PRIVILEGES
-- ============================================================

revoke all
on table public.notification_preferences
from anon;

revoke all
on table public.notifications
from anon;

grant
  select,
  insert,
  update
on table public.notification_preferences
to authenticated;

grant
  select,
  insert,
  update,
  delete
on table public.notifications
to authenticated;