-- Remote Community kill switch. It is deliberately OFF after installation.
--
-- DO NOT enable it until all of these controls exist and have been reviewed:
--   1. atomic per-user and per-IP quotas for posts, reactions and reports;
--   2. server-side personal-data, money-request and spam filtering;
--   3. adversarial RLS tests plus an incident-response/moderation procedure.
--
-- This migration may be applied before 001-003: in that case it installs the
-- policy and guard functions, skips missing Community tables, and stays safe.
-- Re-run it after 001-003 so the triggers and restrictive policies are attached.

begin;

create table if not exists public.celeste_community_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.celeste_community_policy (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

alter table public.celeste_community_policy enable row level security;
revoke all on table public.celeste_community_policy from public, anon, authenticated;

create or replace function public.celeste_community_remote_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select p.enabled from public.celeste_community_policy p where p.singleton = true),
    false
  );
$$;

create or replace function public.celeste_community_remote_write_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.celeste_community_remote_enabled() then
    raise exception 'community_remote_disabled' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.celeste_community_remote_enabled()
  from public, anon, authenticated;
revoke all on function public.celeste_community_remote_write_guard()
  from public, anon, authenticated;
grant execute on function public.celeste_community_remote_enabled()
  to authenticated;

-- A restrictive policy closes direct Supabase access. The trigger is also
-- required because SECURITY DEFINER moderation/submission RPCs can bypass RLS.
do $install_guards$
declare
  target_table text;
begin
  foreach target_table in array array[
    'community_profiles',
    'circles',
    'circle_members',
    'community_posts',
    'community_reactions',
    'community_reports',
    'community_blocks'
  ]
  loop
    if exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = target_table
        and c.relkind in ('r', 'p')
    ) then
      execute format('alter table public.%I enable row level security', target_table);
      execute format(
        'drop policy if exists %I on public.%I',
        'celeste community remote switch',
        target_table
      );
      execute format(
        'create policy %I on public.%I as restrictive for all to authenticated '
        || 'using (public.celeste_community_remote_enabled()) '
        || 'with check (public.celeste_community_remote_enabled())',
        'celeste community remote switch',
        target_table
      );
      execute format(
        'drop trigger if exists celeste_community_remote_write_guard_trigger on public.%I',
        target_table
      );
      execute format(
        'create trigger celeste_community_remote_write_guard_trigger '
        || 'before insert or update or delete on public.%I for each row '
        || 'execute function public.celeste_community_remote_write_guard()',
        target_table
      );
    end if;
  end loop;
end;
$install_guards$;

-- SECURITY DEFINER feed helpers bypass RLS, so bind the central visibility
-- predicate to the same switch when the base Community schema is present.
do $install_visibility_guard$
begin
  if to_regclass('public.community_posts') is not null
     and to_regclass('public.circles') is not null
     and to_regprocedure('public.community_post_is_visible(uuid)') is not null
     and to_regprocedure('public.community_can_view_user(uuid)') is not null then
    execute $ddl$
      create or replace function public.community_post_is_visible(target_post uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = pg_catalog, public
      as $body$
        select public.celeste_community_remote_enabled()
          and exists (
            select 1
            from public.community_posts p
            join public.circles c on c.id = p.circle_id
            where p.id = target_post
              and p.status = 'published'
              and p.deleted_at is null
              and c.active
              and public.community_can_view_user(p.user_id)
          );
      $body$;
    $ddl$;
    execute 'revoke all on function public.community_post_is_visible(uuid) '
      || 'from public, anon, authenticated';
    execute 'grant execute on function public.community_post_is_visible(uuid) '
      || 'to authenticated';
  end if;
end;
$install_visibility_guard$;

-- Return false before touching the table when the submission RPC exists. The
-- table trigger above remains the authoritative guard for this and every other
-- SECURITY DEFINER mutation RPC.
do $install_submit_guard$
begin
  if to_regclass('public.community_posts') is not null
     and to_regprocedure('public.community_submit_post(uuid,integer)') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'community_posts'
        and column_name = 'publication_consent_at'
    ) then
      execute $ddl$
        create or replace function public.community_submit_post(
          target_post uuid,
          expected_revision integer
        )
        returns boolean
        language plpgsql
        security definer
        set search_path = pg_catalog, public
        as $body$
        begin
          if not public.celeste_community_remote_enabled()
             or auth.uid() is null
             or expected_revision is null
             or expected_revision < 1
             or not public.community_profile_ready() then
            return false;
          end if;

          update public.community_posts p
          set status = 'pending'
          where p.id = target_post
            and p.user_id = auth.uid()
            and p.status = 'draft'
            and p.content_revision = expected_revision
            and p.publication_consent_at is not null
            and p.deleted_at is null
            and public.community_active_member(p.circle_id);
          return found;
        end;
        $body$;
      $ddl$;
    else
      execute $ddl$
        create or replace function public.community_submit_post(
          target_post uuid,
          expected_revision integer
        )
        returns boolean
        language plpgsql
        security definer
        set search_path = pg_catalog, public
        as $body$
        begin
          if not public.celeste_community_remote_enabled()
             or auth.uid() is null
             or expected_revision is null
             or expected_revision < 1
             or not public.community_profile_ready() then
            return false;
          end if;

          update public.community_posts p
          set status = 'pending'
          where p.id = target_post
            and p.user_id = auth.uid()
            and p.status = 'draft'
            and p.content_revision = expected_revision
            and p.deleted_at is null
            and public.community_active_member(p.circle_id);
          return found;
        end;
        $body$;
      $ddl$;
    end if;

    execute 'revoke all on function public.community_submit_post(uuid, integer) '
      || 'from public, anon, authenticated';
    execute 'grant execute on function public.community_submit_post(uuid, integer) '
      || 'to authenticated';
  end if;
end;
$install_submit_guard$;

comment on table public.celeste_community_policy is
  'Server-side remote Community kill switch. Keep disabled until documented safeguards exist.';

commit;
