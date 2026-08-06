insert into public.profiles (id, email, credits)
select id, email, 100
from auth.users
on conflict (id) do nothing;

create or replace function public.reserve_credits(p_user_id uuid, p_kind text, p_cost integer, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_credits integer; v_recent integer; v_event uuid;
begin
  if p_user_id is distinct from auth.uid() then raise exception 'unauthorized'; end if;

  insert into public.profiles (id, email, credits)
  select id, email, 100 from auth.users where id = p_user_id
  on conflict (id) do nothing;

  select count(*) into v_recent from public.usage_events where user_id=p_user_id and kind=p_kind and created_at > now() - make_interval(secs => p_window_seconds);
  if v_recent >= p_limit then return jsonb_build_object('ok',false,'reason','rate_limit'); end if;
  select credits into v_credits from public.profiles where id=p_user_id for update;
  if v_credits is null then return jsonb_build_object('ok',false,'reason','profile_missing'); end if;
  if v_credits < p_cost then return jsonb_build_object('ok',false,'reason','insufficient','credits',v_credits); end if;
  update public.profiles set credits=credits-p_cost where id=p_user_id returning credits into v_credits;
  insert into public.usage_events(user_id,kind,credits) values(p_user_id,p_kind,p_cost) returning id into v_event;
  return jsonb_build_object('ok',true,'event_id',v_event,'credits',v_credits);
end; $$;

revoke all on function public.reserve_credits(uuid,text,integer,integer,integer) from public;
grant execute on function public.reserve_credits(uuid,text,integer,integer,integer) to authenticated;
