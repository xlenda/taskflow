-- Capacity for one secondary visual in each of the six personal visions.
--
-- Full first-day visual path: 1 anchor + 6 primary visions + 6 secondary
-- visions + 6 affirmations = 19 images, at 8 weighted units each. The limits
-- below keep the previous headroom of three additional images while the
-- aggregate ceilings from migration 010 remain unchanged.

begin;

insert into public.celeste_generation_operation_policy (
  operation,
  user_daily_units,
  actor_daily_units,
  allowed_units,
  enabled
)
values ('visual', 176, 352, array[8]::smallint[], true)
on conflict (operation) do update
set user_daily_units = greatest(
      public.celeste_generation_operation_policy.user_daily_units,
      excluded.user_daily_units
    ),
    actor_daily_units = greatest(
      public.celeste_generation_operation_policy.actor_daily_units,
      excluded.actor_daily_units
    ),
    allowed_units = excluded.allowed_units,
    updated_at = now();

commit;
