-- ============================================================
-- A2 CALENDAR OAUTH STORAGE
-- Phase 11B1
-- ============================================================


-- ============================================================
-- OAUTH STATES
--
-- Short-lived CSRF/nonces used only during OAuth handshakes.
-- Entirely server-only.
-- ============================================================

create table if not exists
  public.calendar_oauth_states (
    state_hash text primary key,

    user_id uuid not null
      references auth.users(id)
      on delete cascade,

    provider text not null,

    expires_at timestamptz not null,

    created_at timestamptz not null
      default now()
  );


create index if not exists
  calendar_oauth_states_expiry_idx
on public.calendar_oauth_states (
  expires_at
);


alter table
  public.calendar_oauth_states
enable row level security;


revoke all
on public.calendar_oauth_states
from anon,
     authenticated;


-- ============================================================
-- CALENDAR CREDENTIALS
--
-- Refresh tokens are NEVER exposed to the browser.
-- Access tokens are intentionally not stored long-term.
-- ============================================================

create table if not exists
  public.calendar_credentials (
    connection_id uuid primary key
      references public.calendar_connections(id)
      on delete cascade,

    refresh_token text not null,

    token_type text,

    granted_scopes text[] not null
      default '{}'::text[],

    created_at timestamptz not null
      default now(),

    updated_at timestamptz not null
      default now()
  );


drop trigger if exists
  calendar_credentials_updated_at
on public.calendar_credentials;


create trigger
  calendar_credentials_updated_at
before update
on public.calendar_credentials
for each row
execute function
  public.set_calendar_updated_at();


alter table
  public.calendar_credentials
enable row level security;


revoke all
on public.calendar_credentials
from anon,
     authenticated;