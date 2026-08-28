-- Contract step for migration 008. Apply only after the five-argument API has
-- passed its live actor-quota smoke test. Reapplying this migration is safe.

begin;

update public.celeste_generation_policy
set actor_schema_version = 9,
    actor_legacy_reserve_disabled = true,
    updated_at = now()
where singleton = true;

create or replace function public.celeste_reserve_generation_credit(
  p_user_id uuid,
  p_request_id text,
  p_operation text,
  p_units integer
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('allowed', false, 'reason', 'actor_required');
$$;

revoke all on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
from public, anon, authenticated;
grant execute on function public.celeste_reserve_generation_credit(uuid, text, text, integer)
to service_role;
notify pgrst, 'reload schema';

commit;
