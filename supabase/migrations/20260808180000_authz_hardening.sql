-- Authentication and authorization hardening for paid AI resources.

create table if not exists public.provider_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.storyboard_shots(id) on delete cascade,
  provider text not null check (provider in ('heygen_lipsync')),
  created_at timestamptz not null default now()
);

create index if not exists provider_jobs_owner_idx
  on public.provider_jobs(user_id, resource_id, created_at desc);

alter table public.provider_jobs enable row level security;
revoke all on table public.provider_jobs from anon, authenticated;
grant select, insert, update, delete on table public.provider_jobs to service_role;

-- Credits are readable by their owner, but can only be changed by trusted
-- database functions or the service role. Remove any legacy permissive policy.
alter table public.profiles enable row level security;

do $$
declare existing_policy record;
begin
  for existing_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', existing_policy.policyname);
  end loop;
end $$;

create policy "users read own profile" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

revoke all on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

-- A browser must never be able to reserve or refund its own credits. These
-- functions are called only by server code after getUser() succeeds.
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_kind text,
  p_cost integer,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_recent integer;
  v_event uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'unauthorized';
  end if;
  if p_cost <= 0 or p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'invalid usage policy';
  end if;

  insert into public.profiles (id, email, credits)
  select id, email, 100 from auth.users where id = p_user_id
  on conflict (id) do nothing;

  select count(*) into v_recent
  from public.usage_events
  where user_id = p_user_id
    and kind = p_kind
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_recent >= p_limit then
    return jsonb_build_object('ok', false, 'reason', 'rate_limit');
  end if;

  select credits into v_credits
  from public.profiles
  where id = p_user_id
  for update;

  if v_credits is null then
    return jsonb_build_object('ok', false, 'reason', 'profile_missing');
  end if;
  if v_credits < p_cost then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'credits', v_credits);
  end if;

  update public.profiles
  set credits = credits - p_cost
  where id = p_user_id
  returning credits into v_credits;

  insert into public.usage_events(user_id, kind, credits)
  values (p_user_id, p_kind, p_cost)
  returning id into v_event;

  return jsonb_build_object('ok', true, 'event_id', v_event, 'credits', v_credits);
end;
$$;

create or replace function public.finish_usage(
  p_user_id uuid,
  p_event_id uuid,
  p_success boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost integer;
  v_status text;
  v_balance integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'unauthorized';
  end if;

  select credits, status into v_cost, v_status
  from public.usage_events
  where id = p_event_id and user_id = p_user_id
  for update;

  if not found then raise exception 'usage event not found'; end if;

  if v_status = 'reserved' and p_success then
    update public.usage_events set status = 'completed' where id = p_event_id;
  elsif v_status = 'reserved' and not p_success then
    update public.usage_events set status = 'refunded' where id = p_event_id;
    update public.profiles set credits = credits + v_cost where id = p_user_id;
  end if;

  select credits into v_balance from public.profiles where id = p_user_id;
  return v_balance;
end;
$$;

revoke all on function public.reserve_credits(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_usage(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, text, integer, integer, integer) to service_role;
grant execute on function public.finish_usage(uuid, uuid, boolean) to service_role;

-- Enforce ownership of referenced resources even when users bypass the app and
-- call Supabase directly with the public key.
drop policy if exists "users insert own messages" on public.messages;
create policy "users insert own messages" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = auth.uid()
    )
  );

drop policy if exists "users insert own works" on public.works;
drop policy if exists "users update own works" on public.works;
create policy "users insert own works" on public.works
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations
        where conversations.id = works.conversation_id
          and conversations.user_id = auth.uid()
      )
    )
  );
create policy "users update own works" on public.works
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations
        where conversations.id = works.conversation_id
          and conversations.user_id = auth.uid()
      )
    )
  );

drop policy if exists "users own storyboard shots" on public.storyboard_shots;
create policy "users own storyboard shots" on public.storyboard_shots
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.storyboard_projects
      where storyboard_projects.id = storyboard_shots.project_id
        and storyboard_projects.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.storyboard_projects
      where storyboard_projects.id = storyboard_shots.project_id
        and storyboard_projects.user_id = auth.uid()
    )
  );
