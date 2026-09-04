-- Server-gated AI content reporting. The legacy authenticated RPC remains
-- available during this expansion migration and is disabled by migration 014.

begin;

create extension if not exists pg_cron;

create table if not exists public.celeste_ai_report_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  user_daily_limit integer not null default 10 check (user_daily_limit = 10),
  actor_daily_limit integer not null default 20 check (actor_daily_limit = 20),
  global_daily_limit integer not null default 1000 check (global_daily_limit = 1000),
  retention_days integer not null default 180 check (retention_days = 180),
  schema_version integer not null default 1 check (schema_version between 1 and 1000),
  legacy_direct_submit_disabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.celeste_ai_report_policy (
  singleton,
  enabled,
  user_daily_limit,
  actor_daily_limit,
  global_daily_limit,
  retention_days,
  schema_version,
  legacy_direct_submit_disabled
) values (true, true, 10, 20, 1000, 180, 1, false)
on conflict (singleton) do nothing;

create table if not exists public.celeste_ai_report_user_usage (
  report_day date not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  report_count integer not null check (report_count between 1 and 100000),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (report_day, reporter_id)
);

create table if not exists public.celeste_ai_report_actor_usage (
  report_day date not null,
  actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
  report_count integer not null check (report_count between 1 and 100000),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (report_day, actor_hash)
);

create table if not exists public.celeste_ai_report_global_usage (
  report_day date primary key,
  report_count integer not null check (report_count between 1 and 1000000),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.celeste_ai_report_policy enable row level security;
alter table public.celeste_ai_report_user_usage enable row level security;
alter table public.celeste_ai_report_actor_usage enable row level security;
alter table public.celeste_ai_report_global_usage enable row level security;

revoke all on table public.celeste_ai_report_policy from public, anon, authenticated;
revoke all on table public.celeste_ai_report_user_usage from public, anon, authenticated;
revoke all on table public.celeste_ai_report_actor_usage from public, anon, authenticated;
revoke all on table public.celeste_ai_report_global_usage from public, anon, authenticated;

alter table public.ai_content_reports
  add column if not exists expires_at timestamptz;

update public.ai_content_reports
   set expires_at = created_at + interval '180 days'
 where expires_at is null
    or expires_at > created_at + interval '180 days';

create or replace function public.celeste_cap_ai_report_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.expires_at is null
     or new.expires_at > new.created_at + interval '180 days' then
    new.expires_at := new.created_at + interval '180 days';
  end if;
  return new;
end;
$$;

drop trigger if exists celeste_cap_ai_report_expiry on public.ai_content_reports;
create trigger celeste_cap_ai_report_expiry
before insert or update of created_at, expires_at on public.ai_content_reports
for each row execute function public.celeste_cap_ai_report_expiry();

alter table public.ai_content_reports
  alter column expires_at drop default,
  alter column expires_at set not null;

alter table public.ai_content_reports
  drop constraint if exists ai_content_reports_retention_window;
alter table public.ai_content_reports
  add constraint ai_content_reports_retention_window
  check (expires_at <= created_at + interval '180 days');

create index if not exists ai_content_reports_expiry_idx
  on public.ai_content_reports (expires_at, id);

revoke all on function public.celeste_cap_ai_report_expiry() from public, anon, authenticated;

create or replace function public.celeste_submit_ai_content_report_server(
  p_reporter_id uuid,
  p_actor_hash text,
  p_content_type text,
  p_content_ref text,
  p_reason text,
  p_content_text text,
  p_visual_ref text,
  p_user_note text,
  p_locale text,
  p_generation_source text,
  p_generation_model text,
  p_prompt_version text,
  p_platform text,
  p_app_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_content_type text := btrim(coalesce(p_content_type, ''));
  safe_content_ref text := btrim(coalesce(p_content_ref, ''));
  safe_reason text := btrim(coalesce(p_reason, ''));
  safe_content text := btrim(regexp_replace(coalesce(p_content_text, ''), '[[:cntrl:][:space:]]+', ' ', 'g'));
  safe_visual_ref text := btrim(regexp_replace(coalesce(p_visual_ref, ''), '[[:cntrl:][:space:]]+', '', 'g'));
  safe_note text := btrim(regexp_replace(coalesce(p_user_note, ''), '[[:cntrl:][:space:]]+', ' ', 'g'));
  safe_locale text := btrim(coalesce(p_locale, ''));
  safe_generation_source text := btrim(coalesce(p_generation_source, ''));
  safe_generation_model text := btrim(coalesce(p_generation_model, ''));
  safe_prompt_version text := btrim(coalesce(p_prompt_version, ''));
  safe_platform text := btrim(coalesce(p_platform, ''));
  safe_app_version text := btrim(coalesce(p_app_version, ''));
  evidence_hash text;
  existing_report_id uuid;
  new_report_id uuid;
  v_now timestamptz := clock_timestamp();
  v_day date;
  v_enabled boolean;
  v_user_limit integer;
  v_actor_limit integer;
  v_global_limit integer;
  v_user_count integer;
  v_actor_count integer;
  v_global_count integer;
begin
  if p_reporter_id is null
     or p_actor_hash is null
     or p_actor_hash !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from auth.users as users where users.id = p_reporter_id)
     or safe_content_type not in ('scene', 'dream', 'vision', 'affirmation')
     or safe_reason not in (
       'unsafe_harmful', 'hate_harassment', 'sexual', 'violence_self_harm',
       'privacy', 'misleading', 'other'
     )
     or safe_content_ref !~ '^[A-Za-z0-9._:-]{1,180}$'
     or safe_visual_ref !~ '^[A-Za-z0-9._:-]{0,180}$'
     or (safe_content = '' and safe_visual_ref = '')
     or safe_locale not in ('pt', 'en')
     or safe_platform not in ('android', 'ios', 'web', 'native')
     or char_length(coalesce(p_content_ref, '')) > 180
     or char_length(coalesce(p_content_text, '')) > 4000
     or char_length(coalesce(p_visual_ref, '')) > 180
     or char_length(coalesce(p_user_note, '')) > 500
     or char_length(safe_generation_source) not between 1 and 40
     or char_length(safe_generation_model) not between 1 and 100
     or char_length(safe_prompt_version) not between 1 and 80
     or char_length(safe_app_version) not between 1 and 40 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;

  v_day := (v_now at time zone 'UTC')::date;
  evidence_hash := md5(
    safe_content_type || chr(10) || safe_content_ref || chr(10) ||
    safe_content || chr(10) || safe_visual_ref
  );

  -- Serialize a user's submit/delete operations and every global quota update.
  perform pg_advisory_xact_lock(
    hashtextextended('celeste-ai-report-user:' || p_reporter_id::text, 0)
  );
  select policy.enabled,
         policy.user_daily_limit,
         policy.actor_daily_limit,
         policy.global_daily_limit
    into v_enabled, v_user_limit, v_actor_limit, v_global_limit
    from public.celeste_ai_report_policy as policy
   where policy.singleton = true
   for update;
  if not found or v_enabled is not true then
    return jsonb_build_object('accepted', false, 'reason', 'disabled');
  end if;

  select reports.id
    into existing_report_id
    from public.ai_content_reports as reports
   where reports.reporter_id = p_reporter_id
     and reports.content_hash = evidence_hash
     and reports.reason = safe_reason
     and reports.created_at >= v_now - interval '24 hours'
   order by reports.created_at desc
   limit 1;
  if existing_report_id is not null then
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'reportId', existing_report_id,
      'userQuota', true,
      'actorQuota', true,
      'globalQuota', true
    );
  end if;

  select coalesce((
    select usage.report_count
      from public.celeste_ai_report_user_usage as usage
     where usage.report_day = v_day and usage.reporter_id = p_reporter_id
  ), 0) into v_user_count;
  select coalesce((
    select usage.report_count
      from public.celeste_ai_report_actor_usage as usage
     where usage.report_day = v_day and usage.actor_hash = p_actor_hash
  ), 0) into v_actor_count;
  select coalesce((
    select usage.report_count
      from public.celeste_ai_report_global_usage as usage
     where usage.report_day = v_day
  ), 0) into v_global_count;

  if v_user_count >= v_user_limit then
    return jsonb_build_object('accepted', false, 'reason', 'user_limit');
  end if;
  if v_actor_count >= v_actor_limit then
    return jsonb_build_object('accepted', false, 'reason', 'actor_limit');
  end if;
  if v_global_count >= v_global_limit then
    return jsonb_build_object('accepted', false, 'reason', 'global_limit');
  end if;

  insert into public.celeste_ai_report_user_usage as usage (
    report_day, reporter_id, report_count, updated_at
  ) values (v_day, p_reporter_id, 1, v_now)
  on conflict (report_day, reporter_id) do update
    set report_count = usage.report_count + 1,
        updated_at = excluded.updated_at;

  insert into public.celeste_ai_report_actor_usage as usage (
    report_day, actor_hash, report_count, updated_at
  ) values (v_day, p_actor_hash, 1, v_now)
  on conflict (report_day, actor_hash) do update
    set report_count = usage.report_count + 1,
        updated_at = excluded.updated_at;

  insert into public.celeste_ai_report_global_usage as usage (
    report_day, report_count, updated_at
  ) values (v_day, 1, v_now)
  on conflict (report_day) do update
    set report_count = usage.report_count + 1,
        updated_at = excluded.updated_at;

  insert into public.ai_content_reports (
    reporter_id,
    content_type,
    content_ref,
    reason,
    content_text,
    content_hash,
    visual_ref,
    user_note,
    locale,
    generation_source,
    generation_model,
    prompt_version,
    client_platform,
    app_version,
    created_at,
    expires_at
  ) values (
    p_reporter_id,
    safe_content_type,
    safe_content_ref,
    safe_reason,
    safe_content,
    evidence_hash,
    safe_visual_ref,
    safe_note,
    safe_locale,
    safe_generation_source,
    safe_generation_model,
    safe_prompt_version,
    safe_platform,
    safe_app_version,
    v_now,
    v_now + interval '180 days'
  ) returning id into new_report_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'reportId', new_report_id,
    'userQuota', true,
    'actorQuota', true,
    'globalQuota', true
  );
end;
$$;

revoke all on function public.celeste_submit_ai_content_report_server(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.celeste_submit_ai_content_report_server(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

create or replace function public.celeste_delete_all_ai_content_reports_server(
  p_reporter_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reporter_id is null then
    return jsonb_build_object('deleted', false, 'reason', 'invalid');
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('celeste-ai-report-user:' || p_reporter_id::text, 0)
  );
  delete from public.ai_content_reports as reports
   where reports.reporter_id = p_reporter_id;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.celeste_delete_all_ai_content_reports_server(uuid)
  from public, anon, authenticated;
grant execute on function public.celeste_delete_all_ai_content_reports_server(uuid)
  to service_role;

create or replace function public.celeste_purge_expired_ai_content_reports(
  p_limit integer default 1000
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
  cutoff_day date := ((clock_timestamp() at time zone 'UTC')::date - 2);
begin
  with expired as (
    select reports.id
      from public.ai_content_reports as reports
     where reports.expires_at <= clock_timestamp()
     order by reports.expires_at, reports.id
     limit least(greatest(coalesce(p_limit, 1000), 1), 10000)
     for update skip locked
  )
  delete from public.ai_content_reports as reports
  using expired
  where reports.id = expired.id;
  get diagnostics deleted_count = row_count;

  delete from public.celeste_ai_report_user_usage as usage
   where usage.report_day < cutoff_day;
  delete from public.celeste_ai_report_actor_usage as usage
   where usage.report_day < cutoff_day;
  delete from public.celeste_ai_report_global_usage as usage
   where usage.report_day < cutoff_day;

  return deleted_count;
end;
$$;

revoke all on function public.celeste_purge_expired_ai_content_reports(integer)
  from public, anon, authenticated, service_role;

select cron.schedule(
  'celeste-ai-report-retention',
  '17 3 * * *',
  $cron$select public.celeste_purge_expired_ai_content_reports(10000);$cron$
);

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
