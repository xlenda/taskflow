-- Cut over AI content reporting to the verified Vercel gateway. Keeping a
-- fail-closed stub avoids a stale PostgREST schema exposing the old behavior.

begin;

create or replace function public.celeste_submit_ai_content_report(
  p_content_type text,
  p_content_ref text,
  p_reason text,
  p_content_text text default '',
  p_visual_ref text default '',
  p_user_note text default '',
  p_locale text default 'pt',
  p_generation_source text default 'unknown',
  p_generation_model text default 'unknown',
  p_prompt_version text default 'unknown',
  p_platform text default 'native',
  p_app_version text default 'unknown'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ai_report_gateway_required' using errcode = '42501';
end;
$$;

revoke all on function public.celeste_submit_ai_content_report(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

update public.celeste_ai_report_policy
   set schema_version = 2,
       legacy_direct_submit_disabled = true,
       updated_at = clock_timestamp()
 where singleton = true;

create or replace function public.celeste_ai_content_report_gateway_version()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', policy.schema_version,
    'serverGateway', true,
    'userQuota', true,
    'actorQuota', true,
    'globalQuota', true,
    'userDailyLimit', policy.user_daily_limit,
    'actorDailyLimit', policy.actor_daily_limit,
    'globalDailyLimit', policy.global_daily_limit,
    'retentionDays', policy.retention_days,
    'legacyClientSubmitDisabled', policy.legacy_direct_submit_disabled,
    'deleteAll', true
  )
  from public.celeste_ai_report_policy as policy
  where policy.singleton = true;
$$;

revoke all on function public.celeste_ai_content_report_gateway_version()
  from public, anon, authenticated;
grant execute on function public.celeste_ai_content_report_gateway_version()
  to service_role;

notify pgrst, 'reload schema';

commit;
