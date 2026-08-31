-- In-app reporting for AI-generated text and visuals.
-- Only the generated output selected by the reporter is retained. Prompts,
-- onboarding answers and raw dream reports are intentionally absent.

create table if not exists public.ai_content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  content_type text not null check (content_type in ('scene', 'dream', 'vision', 'affirmation')),
  content_ref text not null check (char_length(content_ref) between 1 and 180),
  reason text not null check (
    reason in (
      'unsafe_harmful',
      'hate_harassment',
      'sexual',
      'violence_self_harm',
      'privacy',
      'misleading',
      'other'
    )
  ),
  content_text text not null default '' check (char_length(content_text) <= 4000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{32}$'),
  visual_ref text not null default '' check (char_length(visual_ref) <= 180),
  user_note text not null default '' check (char_length(user_note) <= 500),
  locale text not null check (locale in ('pt', 'en')),
  generation_source text not null check (char_length(generation_source) between 1 and 40),
  generation_model text not null check (char_length(generation_model) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  client_platform text not null check (client_platform in ('android', 'ios', 'web', 'native')),
  app_version text not null check (char_length(app_version) between 1 and 40),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),
  moderation_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists ai_content_reports_moderation_queue_idx
  on public.ai_content_reports (status, created_at);
create index if not exists ai_content_reports_reporter_rate_idx
  on public.ai_content_reports (reporter_id, created_at desc);
create index if not exists ai_content_reports_dedup_idx
  on public.ai_content_reports (reporter_id, content_hash, reason, created_at desc);

alter table public.ai_content_reports enable row level security;
revoke all on table public.ai_content_reports from public, anon, authenticated;

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
declare
  report_user_id uuid := auth.uid();
  safe_content_type text := btrim(coalesce(p_content_type, ''));
  safe_content_ref text := left(btrim(coalesce(p_content_ref, '')), 180);
  safe_reason text := btrim(coalesce(p_reason, ''));
  safe_content text := left(btrim(regexp_replace(coalesce(p_content_text, ''), '[[:cntrl:]]+', ' ', 'g')), 4000);
  safe_visual_ref text := left(btrim(regexp_replace(coalesce(p_visual_ref, ''), '[[:cntrl:][:space:]]+', '', 'g')), 180);
  safe_note text := left(btrim(regexp_replace(coalesce(p_user_note, ''), '[[:cntrl:]]+', ' ', 'g')), 500);
  safe_locale text := case when p_locale = 'en' then 'en' else 'pt' end;
  safe_generation_source text := left(btrim(coalesce(nullif(p_generation_source, ''), 'unknown')), 40);
  safe_generation_model text := left(btrim(coalesce(nullif(p_generation_model, ''), 'unknown')), 100);
  safe_prompt_version text := left(btrim(coalesce(nullif(p_prompt_version, ''), 'unknown')), 80);
  safe_platform text := case
    when p_platform in ('android', 'ios', 'web', 'native') then p_platform
    else 'native'
  end;
  safe_app_version text := left(btrim(coalesce(nullif(p_app_version, ''), 'unknown')), 40);
  evidence_hash text;
  existing_report_id uuid;
  report_id uuid;
begin
  if report_user_id is null then
    raise exception 'ai_report_identity_required' using errcode = 'P0001';
  end if;
  if safe_content_type not in ('scene', 'dream', 'vision', 'affirmation')
     or safe_reason not in (
       'unsafe_harmful', 'hate_harassment', 'sexual', 'violence_self_harm',
       'privacy', 'misleading', 'other'
     )
     or safe_content_ref !~ '^[A-Za-z0-9._:-]{1,180}$'
     or safe_visual_ref !~ '^[A-Za-z0-9._:-]{0,180}$'
     or (safe_content = '' and safe_visual_ref = '') then
    raise exception 'ai_report_invalid' using errcode = 'P0001';
  end if;

  evidence_hash := md5(safe_content_type || chr(10) || safe_content_ref || chr(10) || safe_content || chr(10) || safe_visual_ref);

  -- Serialize each reporter's submissions so parallel taps cannot bypass the
  -- rolling limit or create duplicate moderation work.
  perform pg_advisory_xact_lock(hashtextextended('celeste-ai-report:' || report_user_id::text, 0));

  select reports.id
    into existing_report_id
    from public.ai_content_reports as reports
   where reports.reporter_id = report_user_id
     and reports.content_hash = evidence_hash
     and reports.reason = safe_reason
     and reports.created_at >= clock_timestamp() - interval '24 hours'
   order by reports.created_at desc
   limit 1;
  if existing_report_id is not null then
    return existing_report_id;
  end if;

  if (
    select count(*)
      from public.ai_content_reports as reports
     where reports.reporter_id = report_user_id
       and reports.created_at >= clock_timestamp() - interval '24 hours'
  ) >= 10 then
    raise exception 'ai_report_rate_limited' using errcode = 'P0001';
  end if;

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
    app_version
  ) values (
    report_user_id,
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
    safe_app_version
  ) returning id into report_id;

  return report_id;
end;
$$;

revoke all on function public.celeste_submit_ai_content_report(
  text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.celeste_submit_ai_content_report(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
