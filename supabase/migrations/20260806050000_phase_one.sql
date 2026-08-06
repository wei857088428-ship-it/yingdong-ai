create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新对话',
  mode text not null default 'chat' check (mode in ('chat','image','video')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  media_url text,
  media_type text check (media_type is null or media_type in ('image','video')),
  created_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  type text not null check (type in ('image','video')),
  prompt text not null,
  url text,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  provider_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat','image','video')),
  credits integer not null check (credits >= 0),
  status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
  created_at timestamptz not null default now()
);

alter table public.works add column if not exists usage_event_id uuid references public.usage_events(id) on delete set null;

create index if not exists conversations_user_updated_idx on public.conversations(user_id, updated_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists works_user_created_idx on public.works(user_id, created_at desc);
create index if not exists usage_events_user_created_idx on public.usage_events(user_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.works enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "users own conversations" on public.conversations;
create policy "users own conversations" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users own messages" on public.messages;
create policy "users own messages" on public.messages for select using (auth.uid() = user_id);
drop policy if exists "users own works" on public.works;
create policy "users own works" on public.works for select using (auth.uid() = user_id);
drop policy if exists "users read own usage" on public.usage_events;
create policy "users read own usage" on public.usage_events for select using (auth.uid() = user_id);

create or replace function public.reserve_credits(p_user_id uuid, p_kind text, p_cost integer, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_credits integer; v_recent integer; v_event uuid;
begin
  if p_user_id is distinct from auth.uid() then raise exception 'unauthorized'; end if;
  select count(*) into v_recent from public.usage_events where user_id=p_user_id and kind=p_kind and created_at > now() - make_interval(secs => p_window_seconds);
  if v_recent >= p_limit then return jsonb_build_object('ok',false,'reason','rate_limit'); end if;
  select credits into v_credits from public.profiles where id=p_user_id for update;
  if v_credits is null then return jsonb_build_object('ok',false,'reason','profile_missing'); end if;
  if v_credits < p_cost then return jsonb_build_object('ok',false,'reason','insufficient','credits',v_credits); end if;
  update public.profiles set credits=credits-p_cost where id=p_user_id returning credits into v_credits;
  insert into public.usage_events(user_id,kind,credits) values(p_user_id,p_kind,p_cost) returning id into v_event;
  return jsonb_build_object('ok',true,'event_id',v_event,'credits',v_credits);
end; $$;

create or replace function public.finish_usage(p_user_id uuid, p_event_id uuid, p_success boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare v_cost integer; v_status text; v_balance integer;
begin
  if p_user_id is distinct from auth.uid() then raise exception 'unauthorized'; end if;
  select credits,status into v_cost,v_status from public.usage_events where id=p_event_id and user_id=p_user_id for update;
  if not found then raise exception 'usage event not found'; end if;
  if v_status='reserved' and p_success then update public.usage_events set status='completed' where id=p_event_id;
  elsif v_status='reserved' and not p_success then
    update public.usage_events set status='refunded' where id=p_event_id;
    update public.profiles set credits=credits+v_cost where id=p_user_id;
  end if;
  select credits into v_balance from public.profiles where id=p_user_id;
  return v_balance;
end; $$;

revoke all on function public.reserve_credits(uuid,text,integer,integer,integer) from public;
grant execute on function public.reserve_credits(uuid,text,integer,integer,integer) to authenticated;
revoke all on function public.finish_usage(uuid,uuid,boolean) from public;
grant execute on function public.finish_usage(uuid,uuid,boolean) to authenticated;
