-- Per-operation daily quotas for paid generation.
--
-- The 6+6 journey needs 12 weighted units for its text suite and 13 personal
-- visuals at 8 units each (116 units before the first narration). The legacy
-- aggregate limits (64 user / 96 actor) therefore blocked the product's own
-- happy path. This migration keeps the weighted global ceiling and adds
-- atomic user/actor limits per operation, while raising the aggregate safety
-- ceilings enough for one complete journey.
--
-- Rollout order:
--   1. apply this backward-compatible migration while the schema-9 API is live;
--   2. verify celeste_generation_actor_quota_version without spending credit;
--   3. deploy the API/guard that requires schema 10 and operationQuota=true.

begin;

alter table public.celeste_generation_policy
  drop constraint if exists celeste_generation_policy_actor_daily_units_check;

alter table public.celeste_generation_policy
  add constraint celeste_generation_policy_actor_daily_units_check
  check (actor_daily_units between 20 and 2000);

alter table public.celeste_generation_policy
  drop constraint if exists celeste_generation_policy_actor_schema_version_check;

alter table public.celeste_generation_policy
  add constraint celeste_generation_policy_actor_schema_version_check
  check (actor_schema_version between 8 and 10);

-- Aggregate limits remain a second safety ceiling. The per-operation limits
-- below are the product-facing quotas; global_daily_units remains weighted and
-- deliberately unchanged.
update public.celeste_generation_policy
set per_user_daily_units = greatest(per_user_daily_units, 480),
    actor_daily_units = greatest(actor_daily_units, 960),
    actor_schema_version = 10,
    updated_at = now()
where singleton = true;

create table if not exists public.celeste_generation_operation_policy (
  operation text primary key
    check (operation in ('scene', 'translation', 'dream', 'audio', 'visual')),
  user_daily_units integer not null check (user_daily_units between 1 and 2000),
  actor_daily_units integer not null check (actor_daily_units between 1 and 4000),
  allowed_units smallint[] not null
    check (cardinality(allowed_units) between 1 and 20),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.celeste_generation_operation_policy (
  operation, user_daily_units, actor_daily_units, allowed_units
)
values
  ('scene', 32, 64, array[4, 12]::smallint[]),
  ('visual', 128, 256, array[8]::smallint[]),
  ('audio', 320, 640, array[1, 4, 8, 12, 16, 20]::smallint[]),
  ('dream', 24, 48, array[3]::smallint[]),
  ('translation', 24, 48, array[3]::smallint[])
on conflict (operation) do update
set user_daily_units = excluded.user_daily_units,
    actor_daily_units = excluded.actor_daily_units,
    allowed_units = excluded.allowed_units,
    updated_at = now();

create table if not exists public.celeste_generation_user_operation_usage (
  usage_day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null
    references public.celeste_generation_operation_policy(operation),
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_day, user_id, operation)
);

create table if not exists public.celeste_generation_actor_operation_usage (
  usage_day date not null,
  actor_hash text not null,
  operation text not null
    references public.celeste_generation_operation_policy(operation),
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_day, actor_hash, operation),
  constraint celeste_generation_actor_operation_usage_hash_check
    check (actor_hash ~ '^[0-9a-f]{64}$')
);

alter table public.celeste_generation_operation_policy enable row level security;
alter table public.celeste_generation_user_operation_usage enable row level security;
alter table public.celeste_generation_actor_operation_usage enable row level security;

revoke all on table public.celeste_generation_operation_policy
from public, anon, authenticated;
revoke all on table public.celeste_generation_user_operation_usage
from public, anon, authenticated;
revoke all on table public.celeste_generation_actor_operation_usage
from public, anon, authenticated;

-- Existing active receipts are backfilled atomically. The marker makes future
-- releases decrement operation counters only when those counters were charged.
alter table public.celeste_generation_receipts
  add column if not exists operation_quota_counted boolean not null default false;

insert into public.celeste_generation_user_operation_usage (
  usage_day, user_id, operation, units, updated_at
)
select
  r.usage_day,
  r.user_id,
  r.operation,
  sum(r.units)::integer,
  now()
from public.celeste_generation_receipts r
where r.status in ('reserved', 'committed')
group by r.usage_day, r.user_id, r.operation
on conflict (usage_day, user_id, operation) do update
set units = excluded.units,
    updated_at = now();

insert into public.celeste_generation_actor_operation_usage (
  usage_day, actor_hash, operation, units, updated_at
)
select
  r.usage_day,
  r.actor_hash,
  r.operation,
  sum(r.units)::integer,
  now()
from public.celeste_generation_receipts r
where r.status in ('reserved', 'committed')
  and r.actor_hash is not null
group by r.usage_day, r.actor_hash, r.operation
on conflict (usage_day, actor_hash, operation) do update
set units = excluded.units,
    updated_at = now();

update public.celeste_generation_receipts
set operation_quota_counted = true
where status in ('reserved', 'committed');

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
  -- Every counter mutation follows policy -> receipt -> global -> actor ->
  -- actor/operation -> user -> user/operation.
  perform 1
  from public.celeste_generation_policy
  where singleton = true
  for update;

  for v_receipt in
    select
      r.user_id,
      r.request_id,
      r.usage_day,
      r.operation,
      r.units,
      r.actor_hash,
      r.operation_quota_counted
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

      if v_receipt.actor_hash is not null then
        update public.celeste_generation_actor_usage a
        set units = greatest(0, a.units - v_receipt.units), updated_at = now()
        where a.usage_day = v_receipt.usage_day
          and a.actor_hash = v_receipt.actor_hash;

        if v_receipt.operation_quota_counted then
          update public.celeste_generation_actor_operation_usage a
          set units = greatest(0, a.units - v_receipt.units), updated_at = now()
          where a.usage_day = v_receipt.usage_day
            and a.actor_hash = v_receipt.actor_hash
            and a.operation = v_receipt.operation;
        end if;
      end if;

      update public.celeste_generation_user_usage u
      set units = greatest(0, u.units - v_receipt.units), updated_at = now()
      where u.usage_day = v_receipt.usage_day
        and u.user_id = v_receipt.user_id;

      if v_receipt.operation_quota_counted then
        update public.celeste_generation_user_operation_usage u
        set units = greatest(0, u.units - v_receipt.units), updated_at = now()
        where u.usage_day = v_receipt.usage_day
          and u.user_id = v_receipt.user_id
          and u.operation = v_receipt.operation;
      end if;

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
  p_units integer,
  p_actor_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_day date := timezone('utc', now())::date;
  v_policy public.celeste_generation_policy%rowtype;
  v_operation_policy public.celeste_generation_operation_policy%rowtype;
  v_user_units integer;
  v_user_operation_units integer;
  v_actor_units integer;
  v_actor_operation_units integer;
  v_global_units integer;
  v_receipt public.celeste_generation_receipts%rowtype;
begin
  if p_user_id is null
    or p_request_id !~ '^[A-Za-z0-9._:-]{16,96}$'
    or p_operation not in ('scene', 'translation', 'dream', 'audio', 'visual')
    or p_units not between 1 and 20
    or p_actor_hash is null
    or p_actor_hash !~ '^[0-9a-f]{64}$' then
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

  select * into v_operation_policy
  from public.celeste_generation_operation_policy p
  where p.operation = p_operation
  for update;

  if not found or not v_operation_policy.enabled then
    return jsonb_build_object('allowed', false, 'reason', 'operation_disabled');
  end if;

  if not (p_units = any(v_operation_policy.allowed_units)) then
    return jsonb_build_object('allowed', false, 'reason', 'invalid');
  end if;

  insert into public.celeste_generation_global_usage (usage_day)
  values (v_day)
  on conflict (usage_day) do nothing;

  insert into public.celeste_generation_actor_usage (usage_day, actor_hash)
  values (v_day, p_actor_hash)
  on conflict (usage_day, actor_hash) do nothing;

  insert into public.celeste_generation_actor_operation_usage (
    usage_day, actor_hash, operation
  ) values (
    v_day, p_actor_hash, p_operation
  ) on conflict (usage_day, actor_hash, operation) do nothing;

  insert into public.celeste_generation_user_usage (usage_day, user_id)
  values (v_day, p_user_id)
  on conflict (usage_day, user_id) do nothing;

  insert into public.celeste_generation_user_operation_usage (
    usage_day, user_id, operation
  ) values (
    v_day, p_user_id, p_operation
  ) on conflict (usage_day, user_id, operation) do nothing;

  select units into v_global_units
  from public.celeste_generation_global_usage
  where usage_day = v_day
  for update;

  select units into v_actor_units
  from public.celeste_generation_actor_usage
  where usage_day = v_day and actor_hash = p_actor_hash
  for update;

  select units into v_actor_operation_units
  from public.celeste_generation_actor_operation_usage
  where usage_day = v_day
    and actor_hash = p_actor_hash
    and operation = p_operation
  for update;

  select units into v_user_units
  from public.celeste_generation_user_usage
  where usage_day = v_day and user_id = p_user_id
  for update;

  select units into v_user_operation_units
  from public.celeste_generation_user_operation_usage
  where usage_day = v_day
    and user_id = p_user_id
    and operation = p_operation
  for update;

  if v_user_operation_units + p_units > v_operation_policy.user_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'user_operation_limit');
  end if;

  if v_actor_operation_units + p_units > v_operation_policy.actor_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'actor_operation_limit');
  end if;

  if v_user_units + p_units > v_policy.per_user_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit');
  end if;

  if v_actor_units + p_units > v_policy.actor_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'actor_limit');
  end if;

  if v_global_units + p_units > v_policy.global_daily_units then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit');
  end if;

  update public.celeste_generation_global_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day;

  update public.celeste_generation_actor_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day and actor_hash = p_actor_hash;

  update public.celeste_generation_actor_operation_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day
    and actor_hash = p_actor_hash
    and operation = p_operation;

  update public.celeste_generation_user_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day and user_id = p_user_id;

  update public.celeste_generation_user_operation_usage
  set units = units + p_units, updated_at = now()
  where usage_day = v_day
    and user_id = p_user_id
    and operation = p_operation;

  insert into public.celeste_generation_receipts (
    user_id,
    request_id,
    usage_day,
    operation,
    units,
    status,
    expires_at,
    actor_hash,
    operation_quota_counted
  ) values (
    p_user_id,
    p_request_id,
    v_day,
    p_operation,
    p_units,
    case when p_operation in ('scene', 'visual') then 'reserved' else 'committed' end,
    case when p_operation in ('scene', 'visual') then now() + interval '5 minutes' else null end,
    p_actor_hash,
    true
  );

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'reserved', p_operation in ('scene', 'visual'),
    'actorQuota', true,
    'operationQuota', true,
    'state', case when p_operation in ('scene', 'visual') then 'reserved' else 'committed' end,
    'usageDay', v_day,
    'userRemaining', v_policy.per_user_daily_units - v_user_units - p_units,
    'actorRemaining', v_policy.actor_daily_units - v_actor_units - p_units,
    'userOperationRemaining',
      v_operation_policy.user_daily_units - v_user_operation_units - p_units,
    'actorOperationRemaining',
      v_operation_policy.actor_daily_units - v_actor_operation_units - p_units,
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

  perform 1
  from public.celeste_generation_policy
  where singleton = true
  for update;

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

  if v_receipt.actor_hash is not null then
    update public.celeste_generation_actor_usage a
    set units = greatest(0, a.units - v_receipt.units), updated_at = now()
    where a.usage_day = v_receipt.usage_day
      and a.actor_hash = v_receipt.actor_hash;

    if v_receipt.operation_quota_counted then
      update public.celeste_generation_actor_operation_usage a
      set units = greatest(0, a.units - v_receipt.units), updated_at = now()
      where a.usage_day = v_receipt.usage_day
        and a.actor_hash = v_receipt.actor_hash
        and a.operation = v_receipt.operation;
    end if;
  end if;

  update public.celeste_generation_user_usage u
  set units = greatest(0, u.units - v_receipt.units), updated_at = now()
  where u.usage_day = v_receipt.usage_day
    and u.user_id = v_receipt.user_id;

  if v_receipt.operation_quota_counted then
    update public.celeste_generation_user_operation_usage u
    set units = greatest(0, u.units - v_receipt.units), updated_at = now()
    where u.usage_day = v_receipt.usage_day
      and u.user_id = v_receipt.user_id
      and u.operation = v_receipt.operation;
  end if;

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

create or replace function public.celeste_generation_actor_quota_version()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'schemaVersion', p.actor_schema_version,
    'actorDailyUnits', p.actor_daily_units,
    'perUserDailyUnits', p.per_user_daily_units,
    'globalDailyUnits', p.global_daily_units,
    'reserveSignature',
      to_regprocedure('public.celeste_reserve_generation_credit(uuid,text,text,integer,text)')
        is not null,
    'legacyReserveDisabled', p.actor_legacy_reserve_disabled,
    'operationQuota', true,
    'operationQuotaVersion', 1,
    'weightedGlobalQuota', true,
    'operationPolicies', coalesce((
      select jsonb_object_agg(
        op.operation,
        jsonb_build_object(
          'userDailyUnits', op.user_daily_units,
          'actorDailyUnits', op.actor_daily_units,
          'allowedUnits', to_jsonb(op.allowed_units),
          'enabled', op.enabled
        ) order by op.operation
      )
      from public.celeste_generation_operation_policy op
    ), '{}'::jsonb)
  )
  from public.celeste_generation_policy p
  where p.singleton = true;
$$;

revoke all on function public.celeste_release_stale_generation_reservations(integer)
from public, anon, authenticated;
revoke all on function public.celeste_reserve_generation_credit(uuid, text, text, integer, text)
from public, anon, authenticated;
revoke all on function public.celeste_finalize_generation_credit(uuid, text, boolean)
from public, anon, authenticated;
revoke all on function public.celeste_generation_actor_quota_version()
from public, anon, authenticated;

grant execute on function public.celeste_release_stale_generation_reservations(integer)
to service_role;
grant execute on function public.celeste_reserve_generation_credit(uuid, text, text, integer, text)
to service_role;
grant execute on function public.celeste_finalize_generation_credit(uuid, text, boolean)
to service_role;
grant execute on function public.celeste_generation_actor_quota_version()
to service_role;

notify pgrst, 'reload schema';

commit;
