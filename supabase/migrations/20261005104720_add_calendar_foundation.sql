-- ============================================================
-- A2 CALENDAR FOUNDATION
-- Phase 11A
-- ============================================================


-- ============================================================
-- UPDATED_AT HELPER
-- ============================================================

create or replace function
  public.set_calendar_updated_at()
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


-- ============================================================
-- CALENDAR CONNECTIONS
-- ============================================================

create table if not exists
  public.calendar_connections (
    id uuid primary key
      default gen_random_uuid(),

    user_id uuid not null
      references auth.users(id)
      on delete cascade,

    provider text not null,

    provider_account_id text,

    provider_account_email text,

    calendar_id text,

    calendar_name text
      default 'Calendar',

    is_primary boolean not null
      default true,

    is_active boolean not null
      default true,

    connection_status text not null
      default 'connected'
      check (
        connection_status in (
          'connected',
          'needs_reauth',
          'disconnected',
          'error'
        )
      ),

    last_synced_at timestamptz,

    provider_metadata jsonb not null
      default '{}'::jsonb,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now()
  );


create index if not exists
  calendar_connections_user_idx
on public.calendar_connections (
  user_id,
  is_active
);


create unique index if not exists
  calendar_connections_one_primary_idx
on public.calendar_connections (
  user_id
)
where
  is_primary = true
  and is_active = true;


drop trigger if exists
  calendar_connections_updated_at
on public.calendar_connections;


create trigger
  calendar_connections_updated_at
before update
on public.calendar_connections
for each row
execute function
  public.set_calendar_updated_at();


-- ============================================================
-- CALENDAR EVENTS
-- ============================================================

create table if not exists
  public.calendar_events (
    id uuid primary key
      default gen_random_uuid(),

    user_id uuid not null
      references auth.users(id)
      on delete cascade,

    connection_id uuid not null
      references public.calendar_connections(id)
      on delete cascade,

    provider_event_id text not null,

    title text not null
      default 'Untitled event',

    description text,

    location text,

    start_at timestamptz,

    end_at timestamptz,

    start_date date,

    end_date date,

    timezone text,

    all_day boolean not null
      default false,

    status text not null
      default 'confirmed'
      check (
        status in (
          'confirmed',
          'tentative',
          'cancelled'
        )
      ),

    busy_status text not null
      default 'busy'
      check (
        busy_status in (
          'busy',
          'free',
          'unknown'
        )
      ),

    event_type text not null
      default 'unknown'
      check (
        event_type in (
          'work',
          'personal',
          'focus',
          'a2_block',
          'unknown'
        )
      ),

    organizer_email text,

    attendees jsonb not null
      default '[]'::jsonb,

    recurrence jsonb not null
      default '[]'::jsonb,

    conference_url text,

    source text not null
      default 'provider'
      check (
        source in (
          'provider',
          'a2'
        )
      ),

    provider_created_at timestamptz,

    provider_updated_at timestamptz,

    last_synced_at timestamptz not null
      default now(),

    metadata jsonb not null
      default '{}'::jsonb,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now(),

    unique (
      connection_id,
      provider_event_id
    ),

    constraint
      calendar_events_time_check
    check (
      (
        all_day = false
        and start_at is not null
        and end_at is not null
        and end_at > start_at
      )
      or
      (
        all_day = true
        and start_date is not null
        and end_date is not null
        and end_date >= start_date
      )
    )
  );


create index if not exists
  calendar_events_user_time_idx
on public.calendar_events (
  user_id,
  start_at
);


create index if not exists
  calendar_events_connection_idx
on public.calendar_events (
  connection_id
);


create index if not exists
  calendar_events_provider_idx
on public.calendar_events (
  connection_id,
  provider_event_id
);


create index if not exists
  calendar_events_active_idx
on public.calendar_events (
  user_id,
  status,
  start_at
);


drop trigger if exists
  calendar_events_updated_at
on public.calendar_events;


create trigger
  calendar_events_updated_at
before update
on public.calendar_events
for each row
execute function
  public.set_calendar_updated_at();


-- ============================================================
-- CALENDAR SYNC STATE
--
-- Server-only table.
-- OAuth/watch/sync information will live here.
-- Browser clients never need direct access.
-- ============================================================

create table if not exists
  public.calendar_sync_state (
    id uuid primary key
      default gen_random_uuid(),

    connection_id uuid not null
      unique
      references public.calendar_connections(id)
      on delete cascade,

    sync_token text,

    watch_channel_id text,

    watch_resource_id text,

    watch_expires_at timestamptz,

    last_full_sync_at timestamptz,

    last_incremental_sync_at timestamptz,

    last_error text,

    cursor_data jsonb not null
      default '{}'::jsonb,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now()
  );


drop trigger if exists
  calendar_sync_state_updated_at
on public.calendar_sync_state;


create trigger
  calendar_sync_state_updated_at
before update
on public.calendar_sync_state
for each row
execute function
  public.set_calendar_updated_at();


-- ============================================================
-- CALENDAR PREFERENCES
--
-- Deliberately minimal.
-- We are NOT building a complicated scheduling profile.
-- ============================================================

create table if not exists
  public.calendar_preferences (
    user_id uuid primary key
      references auth.users(id)
      on delete cascade,

    confirm_conversational_add boolean not null
      default true,

    confirm_destructive_changes boolean not null
      default true,

    travel_buffer_enabled boolean not null
      default true,

    default_buffer_minutes integer not null
      default 15
      check (
        default_buffer_minutes
        between 0 and 180
      ),

    infer_work_hours_from_events boolean not null
      default true,

    single_calendar_mode boolean not null
      default true,

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now()
  );


drop trigger if exists
  calendar_preferences_updated_at
on public.calendar_preferences;


create trigger
  calendar_preferences_updated_at
before update
on public.calendar_preferences
for each row
execute function
  public.set_calendar_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table
  public.calendar_connections
enable row level security;


alter table
  public.calendar_events
enable row level security;


alter table
  public.calendar_sync_state
enable row level security;


alter table
  public.calendar_preferences
enable row level security;


-- ============================================================
-- CONNECTION POLICIES
--
-- Client may read connection information.
-- Connection mutations happen server-side.
-- ============================================================

drop policy if exists
  "Users can read own calendar connections"
on public.calendar_connections;


create policy
  "Users can read own calendar connections"
on public.calendar_connections
for select
to authenticated
using (
  (select auth.uid()) =
  user_id
);


-- ============================================================
-- EVENT POLICIES
--
-- Client may read normalized events.
-- Writes go through A2 calendar tools/server.
-- ============================================================

drop policy if exists
  "Users can read own calendar events"
on public.calendar_events;


create policy
  "Users can read own calendar events"
on public.calendar_events
for select
to authenticated
using (
  (select auth.uid()) =
  user_id
);


-- ============================================================
-- PREFERENCE POLICIES
-- ============================================================

drop policy if exists
  "Users can read own calendar preferences"
on public.calendar_preferences;


create policy
  "Users can read own calendar preferences"
on public.calendar_preferences
for select
to authenticated
using (
  (select auth.uid()) =
  user_id
);


drop policy if exists
  "Users can create own calendar preferences"
on public.calendar_preferences;


create policy
  "Users can create own calendar preferences"
on public.calendar_preferences
for insert
to authenticated
with check (
  (select auth.uid()) =
  user_id
);


drop policy if exists
  "Users can update own calendar preferences"
on public.calendar_preferences;


create policy
  "Users can update own calendar preferences"
on public.calendar_preferences
for update
to authenticated
using (
  (select auth.uid()) =
  user_id
)
with check (
  (select auth.uid()) =
  user_id
);


-- ============================================================
-- PERMISSIONS
-- ============================================================

revoke all
on public.calendar_connections
from anon,
     authenticated;


revoke all
on public.calendar_events
from anon,
     authenticated;


revoke all
on public.calendar_sync_state
from anon,
     authenticated;


revoke all
on public.calendar_preferences
from anon,
     authenticated;


grant select
on public.calendar_connections
to authenticated;


grant select
on public.calendar_events
to authenticated;


grant
  select,
  insert,
  update
on public.calendar_preferences
to authenticated;


-- calendar_sync_state deliberately gets
-- no client grants.


-- ============================================================
-- DEFAULT PREFERENCES FOR EXISTING USERS
-- ============================================================

insert into
  public.calendar_preferences (
    user_id
  )
select
  id
from
  auth.users
on conflict (
  user_id
)
do nothing;