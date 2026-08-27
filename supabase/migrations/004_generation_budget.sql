-- Distributed spend authorization for every paid Gemini operation.
-- Apply only after anonymous Supabase Auth is enabled for the Celeste project.

begin;

create table if not exists public.celeste_generation_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  per_user_daily_units integer not null default 24 check (per_user_daily_units between 1 and 1000),
  global_daily_units integer not null default 1200 check (global_daily_units between 1 and 1000000),
  updated_at timestamptz not null default now()
);

insert into public.celeste_generation_policy (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.celeste_generation_user_usage (
  usage_day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_day, user_id)
);

create table if not exists public.celeste_generation_global_usage (
  usage_day date primary key,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.celeste_generation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9._:-]{16,96}$'),
  usage_day date not null,
  operation text not null check (operation in ('scene', 'translation', 'dream', 'audio', 'visual')),
  units integer not null check (units between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.celeste_generation_policy enable row level security;
alter table public.celeste_generation_user_usage enable row level security;
alter table public.celeste_generation_global_usage enable row level security;
alter table public.celeste_generation_receipts enable row level security;

revoke all on public.celeste_generation_policy from public, anon, authenticated;
revoke all on public.celeste_generation_user_usage from public, anon, authenticated;
revoke all on public.celeste_generation_global_usage from public, anon, authenticated;
revoke all on public.celeste_generation_receipts from public, anon, authenticated;

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

  select * into v_receipt
  from public.celeste_generation_receipts
  where user_id = p_user_id and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate',
      'duplicate', true,
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
    user_id,
    request_id,
    usage_day,
    operation,
    units
  ) values (
    p_user_id,
    p_request_id,
    v_day,
    p_operation,
    p_units
  );

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
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

revoke all on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
from public, anon, authenticated;
grant execute on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
to service_role;

commit;
