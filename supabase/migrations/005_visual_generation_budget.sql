-- Adds image generation to installations that already applied migration 004.

begin;

alter table public.celeste_generation_receipts
  drop constraint if exists celeste_generation_receipts_operation_check;

alter table public.celeste_generation_receipts
  add constraint celeste_generation_receipts_operation_check
  check (operation in ('scene', 'translation', 'dream', 'audio', 'visual'));

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
