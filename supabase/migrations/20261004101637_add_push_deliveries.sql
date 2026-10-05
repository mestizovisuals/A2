create table if not exists public.push_deliveries (
  id uuid primary key
    default gen_random_uuid(),

  notification_id uuid not null
    references public.notifications(id)
    on delete cascade,

  subscription_id uuid not null
    references public.push_subscriptions(id)
    on delete cascade,

  status text not null
    default 'pending'
    check (
      status in (
        'pending',
        'delivered',
        'failed',
        'expired'
      )
    ),

  attempts integer not null
    default 0
    check (
      attempts >= 0
    ),

  last_status_code integer,

  last_error text,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  delivered_at timestamptz,

  unique (
    notification_id,
    subscription_id
  )
);

create index if not exists
  push_deliveries_notification_idx
on public.push_deliveries (
  notification_id
);

create index if not exists
  push_deliveries_subscription_idx
on public.push_deliveries (
  subscription_id
);

create or replace function
  public.set_push_deliveries_updated_at()
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
  push_deliveries_set_updated_at
on public.push_deliveries;

create trigger
  push_deliveries_set_updated_at
before update
on public.push_deliveries
for each row
execute function
  public.set_push_deliveries_updated_at();

alter table
  public.push_deliveries
enable row level security;

-- Push delivery history is server-only.
revoke all
on table public.push_deliveries
from anon;

revoke all
on table public.push_deliveries
from authenticated;