-- Two-phase accounting for paid generations. A reservation counts against the
-- short-term limit, but is committed only after the provider returns usable data.

begin;

alter table public.celeste_generation_receipts
  add column if not exists status text not null default 'committed',
  add column if not exists expires_at timestamptz,
  add column if not exists finalized_at timestamptz;

-- Scene and visual use explicit finalization. Translation, dream and audio keep
-- the one-phase behavior until their endpoints adopt it. Deploy the
-- backward-compatible API first, then apply this migration so an old handler
-- never creates a reservation that it cannot finalize.

alter table public.celeste_generation_receipts
  drop constraint if exists celeste_generation_receipts_status_check;

alter table public.celeste_generation_receipts
  add constraint celeste_generation_receipts_status_check
  check (status in ('reserved', 'committed', 'released'));

create index if not exists celeste_generation_receipts_stale_idx
  on public.celeste_generation_receipts (expires_at)
  where status = 'reserved';

update public.celeste_generation_policy
set per_user_daily_units = 64,
    global_daily_units = 1200,
    updated_at = now()
where singleton = true;

create or replace function public.celeste_release_stale_generation_reservations(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_receipt record;
  v_released integer := 0;
begin
  for v_receipt in
    select r.user_id, r.request_id, r.usage_day, r.units
    from public.celeste_generation_receipts r
    where r.status = 'reserved'
      and r.expires_at <= now()
    order by r.expires_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    update public.celeste_generation_receipts r
    set status = 'released', finalized_at = now(), expires_at = null
    where r.user_id = v_receipt.user_id
      and r.request_id = v_receipt.request_id
      and r.status = 'reserved';

    if found then
      update public.celeste_generation_global_usage g
      set units = greatest(0, g.units - v_receipt.units), updated_at = now()
      where g.usage_day = v_receipt.usage_day;

      update public.celeste_generation_user_usage u
      set units = greatest(0, u.units - v_receipt.units), updated_at = now()
      where u.usage_day = v_receipt.usage_day and u.user_id = v_receipt.user_id;

      v_released := v_released + 1;
    end if;
  end loop;
  return v_released;
end;
$$;

create or replace function public.celeste_reserve_generation_credit(
  p_user_id uuid,
  p_request_id text,
  p_operation text,
  p_units integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := timezone('utc', now())::date;
  v_policy public.celeste_generation_policy%rowtype;
  v_user_units integer;
  v_global_units integer;
  v_receipt public.celeste_generation_receipts%rowtype;
begin
  if p_user_id is null
    or p_request_id !~ '^[A-Za-z0-9._:-]{16,96}$'
    or p_operation not in ('scene', 'translation', 'dream', 'audio', 'visual')
    or p_units not between 1 and 20 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  perform public.celeste_release_stale_generation_reservations(100);

  select * into v_receipt
  from public.celeste_generation_receipts r
  where r.user_id = p_user_id and r.request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate',
      'duplicate', true,
      'state', v_receipt.status,
      'usageDay', v_receipt.usage_day
    );
  end if;

  select * into v_policy
  from public.celeste_generation_policy
  where singleton = true
  for update;

  if not found or not v_policy.enabled then
    return jsonb_build_object('allowed', false, 'reason', 'disabled');
  end if;

  insert into public.celeste_generation_global_usage (usage_day)
  values (v_day)
  on conflict (usage_day) do nothing;

  insert into public.celeste_generation_user_usage (usage_day, user_id)
  values (v_day, p_user_id)
  on conflict (usage_day, user_id) do nothing;

  select units into v_global_units
  from public.celeste_generation_global_usage
  where usage_day = v_day
  for update;

  select units into v_user_units
  from public.celeste_generation_user_usage
  where usage_day = v_day and user_id = p_user_id
  for update;

  if v_user_units + p_units > v_policy.per_user_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit');
  end if;

  if v_global_units + p_units > v_policy.global_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit');
  end if;

  update public.celeste_generation_user_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day and user_id = p_user_id;

  update public.celeste_generation_global_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day;

  insert into public.celeste_generation_receipts (
    user_id, request_id, usage_day, operation, units, status, expires_at
  ) values (
    p_user_id,
    p_request_id,
    v_day,
    p_operation,
    p_units,
    case when p_operation in ('scene', 'visual') then 'reserved' else 'committed' end,
    case when p_operation in ('scene', 'visual') then now() + interval '5 minutes' else null end
  );

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'reserved', p_operation in ('scene', 'visual'),
    'state', case when p_operation in ('scene', 'visual') then 'reserved' else 'committed' end,
    'usageDay', v_day,
    'userRemaining', v_policy.per_user_daily_units - v_user_units - p_units,
    'globalRemaining', v_policy.global_daily_units - v_global_units - p_units
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate',
      'duplicate', true,
      'usageDay', v_day
    );
end;
$$;

create or replace function public.celeste_finalize_generation_credit(
  p_user_id uuid,
  p_request_id text,
  p_commit boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_receipt public.celeste_generation_receipts%rowtype;
begin
  if p_user_id is null
    or p_request_id !~ '^[A-Za-z0-9._:-]{16,96}$'
    or p_commit is null then
    return jsonb_build_object('finalized', false, 'reason', 'invalid');
  end if;

  select * into v_receipt
  from public.celeste_generation_receipts r
  where r.user_id = p_user_id and r.request_id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('finalized', false, 'reason', 'missing');
  end if;

  if v_receipt.status = 'committed' then
    return jsonb_build_object(
      'finalized', p_commit,
      'reason', case when p_commit then null else 'committed' end,
      'state', 'committed'
    );
  end if;

  if v_receipt.status = 'released' then
    return jsonb_build_object(
      'finalized', not p_commit,
      'reason', case when p_commit then 'released' else null end,
      'state', 'released'
    );
  end if;

  if p_commit and v_receipt.expires_at > now() then
    update public.celeste_generation_receipts r
    set status = 'committed', finalized_at = now(), expires_at = null
    where r.user_id = p_user_id and r.request_id = p_request_id;
    return jsonb_build_object('finalized', true, 'state', 'committed');
  end if;

  update public.celeste_generation_global_usage g
  set units = greatest(0, g.units - v_receipt.units), updated_at = now()
  where g.usage_day = v_receipt.usage_day;

  update public.celeste_generation_user_usage u
  set units = greatest(0, u.units - v_receipt.units), updated_at = now()
  where u.usage_day = v_receipt.usage_day and u.user_id = v_receipt.user_id;

  update public.celeste_generation_receipts r
  set status = 'released', finalized_at = now(), expires_at = null
  where r.user_id = p_user_id and r.request_id = p_request_id;

  return jsonb_build_object(
    'finalized', not p_commit,
    'reason', case when p_commit then 'released' else null end,
    'state', 'released'
  );
end;
$$;

revoke all on function public.celeste_release_stale_generation_reservations(integer)
from public, anon, authenticated;
revoke all on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
from public, anon, authenticated;
revoke all on function public.celeste_finalize_generation_credit(uuid, text, boolean)
from public, anon, authenticated;

grant execute on function public.celeste_release_stale_generation_reservations(integer)
to service_role;
grant execute on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
to service_role;
grant execute on function public.celeste_finalize_generation_credit(uuid, text, boolean)
to service_role;

commit;
