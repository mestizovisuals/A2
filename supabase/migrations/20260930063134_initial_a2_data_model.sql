-- ============================================================
-- A2 INITIAL DATA MODEL
-- Conversations, messages, and durable memories
-- ============================================================


-- ------------------------------------------------------------
-- CONVERSATIONS
-- Invisible conversation/session organization underneath
-- A2's continuous assistant experience.
-- ------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  title text,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  last_message_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- MESSAGES
-- Individual user and A2 messages.
-- ------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null
    references public.conversations(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  role text not null
    check (
      role in (
        'user',
        'assistant',
        'system',
        'tool'
      )
    ),

  content text not null
    check (char_length(trim(content)) > 0),

  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- MEMORIES
-- Durable information A2 learns about the user.
-- Automatic extraction will be added later.
-- ------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  category text not null,

  subject text not null,

  content text not null
    check (char_length(trim(content)) > 0),

  importance smallint not null default 3
    check (importance between 1 and 5),

  confidence numeric(4,3) not null default 1.000
    check (
      confidence >= 0
      and confidence <= 1
    ),

  source_conversation_id uuid
    references public.conversations(id)
    on delete set null,

  source_message_id uuid
    references public.messages(id)
    on delete set null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  last_accessed_at timestamptz,

  metadata jsonb not null default '{}'::jsonb
);


-- ============================================================
-- INDEXES
-- These keep common A2 queries fast as the database grows.
-- ============================================================

create index conversations_user_id_idx
  on public.conversations(user_id);

create index conversations_last_message_at_idx
  on public.conversations(
    user_id,
    last_message_at desc
  );

create index messages_conversation_id_idx
  on public.messages(
    conversation_id,
    created_at
  );

create index messages_user_id_idx
  on public.messages(user_id);

create index memories_user_id_idx
  on public.memories(user_id);

create index memories_user_active_idx
  on public.memories(
    user_id,
    is_active
  );

create index memories_category_idx
  on public.memories(
    user_id,
    category
  );


-- ============================================================
-- AUTOMATIC UPDATED_AT SUPPORT
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create trigger conversations_set_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();


create trigger memories_set_updated_at
before update on public.memories
for each row
execute function public.set_updated_at();


-- ============================================================
-- ROW LEVEL SECURITY
-- A signed-in user may access only their own A2 data.
-- ============================================================

alter table public.conversations
enable row level security;

alter table public.messages
enable row level security;

alter table public.memories
enable row level security;


-- Remove public / anonymous access entirely.

revoke all
on table public.conversations
from anon, authenticated;

revoke all
on table public.messages
from anon, authenticated;

revoke all
on table public.memories
from anon, authenticated;


-- Authenticated A2 users receive normal CRUD capabilities.
-- RLS policies below determine which rows they may touch.

grant select, insert, update, delete
on table public.conversations
to authenticated;

grant select, insert, update, delete
on table public.messages
to authenticated;

grant select, insert, update, delete
on table public.memories
to authenticated;


-- ============================================================
-- CONVERSATION POLICIES
-- ============================================================

create policy "Users can read their own conversations"
on public.conversations
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users can create their own conversations"
on public.conversations
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);


create policy "Users can update their own conversations"
on public.conversations
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


create policy "Users can delete their own conversations"
on public.conversations
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- MESSAGE POLICIES
-- ============================================================

create policy "Users can read their own messages"
on public.messages
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users can create their own messages"
on public.messages
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);


create policy "Users can update their own messages"
on public.messages
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


create policy "Users can delete their own messages"
on public.messages
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);


-- ============================================================
-- MEMORY POLICIES
-- ============================================================

create policy "Users can read their own memories"
on public.memories
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users can create their own memories"
on public.memories
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);


create policy "Users can update their own memories"
on public.memories
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);


create policy "Users can delete their own memories"
on public.memories
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);