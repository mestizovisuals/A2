create table if not exists public.push_subscriptions (
  id uuid primary key
    default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  endpoint text not null,

  p256dh text not null,

  auth text not null,

  platform text not null
    default 'web',

  user_agent text,

  is_active boolean not null
    default true,

  created_at timestamptz not null
    default now(),

  updated_at timestamptz not null
    default now(),

  last_seen_at timestamptz not null
    default now(),

  unique(endpoint)
);

create index if not exists
  push_subscriptions_user_idx
on public.push_subscriptions (
  user_id,
  is_active
);

create or replace function
  public.set_push_subscriptions_updated_at()
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
  push_subscriptions_set_updated_at
on public.push_subscriptions;

create trigger
  push_subscriptions_set_updated_at
before update
on public.push_subscriptions
for each row
execute function
  public.set_push_subscriptions_updated_at();

alter table
  public.push_subscriptions
enable row level security;

drop policy if exists
  "Users can read own push subscriptions"
on public.push_subscriptions;

create policy
  "Users can read own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can create own push subscriptions"
on public.push_subscriptions;

create policy
  "Users can create own push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can update own push subscriptions"
on public.push_subscriptions;

create policy
  "Users can update own push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

drop policy if exists
  "Users can delete own push subscriptions"
on public.push_subscriptions;

create policy
  "Users can delete own push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

revoke all
on table public.push_subscriptions
from anon;

grant
  select,
  insert,
  update,
  delete
on table public.push_subscriptions
to authenticated;