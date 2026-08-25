-- BLUEPRINT FUTURO, NAO APLICADO: Constelacao Celeste, comunidade opt-in.
-- NAO aplicar sem documentos legais, moderacao humana, rate limit, antispam,
-- testes adversariais de RLS e procedimento de resposta a incidentes.
--
-- Publicacao depende de app_metadata.community_role = moderator|admin. Esse claim
-- deve ser assinado pelo Supabase Auth e configurado somente por backend confiavel.
-- Nunca use user_metadata para autorizacao ou entregue service_role ao cliente.

-- Esta migration e somente para instalacao nova. Um schema parcial ou uma versao
-- anterior exige migration de upgrade dedicada, com backup e plano de rollback.
do $preflight$
declare
  existing_tables text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
    into existing_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and (
      left(c.relname, 10) = 'community_'
      or c.relname in ('circles', 'circle_members')
    );

  if existing_tables is not null then
    raise exception 'Constelacao Celeste requer schema novo; tabelas encontradas: %',
      existing_tables
      using hint = 'Crie e revise uma migration de upgrade; nao reaplique esta migration.';
  end if;
end;
$preflight$;

create extension if not exists pgcrypto;

create table public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (
    handle = lower(handle)
    and handle ~ '^[a-z0-9][a-z0-9_]{2,23}$'
  ),
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_pt text not null,
  name_en text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'paused', 'removed', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (circle_id, user_id),
  check (
    (status = 'left' and left_at is not null)
    or (status <> 'left' and left_at is null)
  )
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete restrict,
  kind text not null
    check (kind in ('intention', 'action', 'evidence', 'celebration')),
  body text not null check (char_length(btrim(body)) between 10 and 600),
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  -- draft/pending pertencem a autora; published/hidden/removed, a moderacao.
  -- deleted representa exclusao solicitada pela propria autora.
  status text not null default 'draft' check (
    status in ('draft', 'pending', 'published', 'hidden', 'removed', 'deleted')
  ),
  content_revision integer not null default 1 check (content_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('with_you', 'rooting', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  -- IDs podem ser anulados por exclusao, mas o snapshot de moderacao permanece.
  reporter_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  post_revision integer not null check (post_revision >= 1),
  post_body_snapshot text not null,
  post_kind_snapshot text not null,
  post_locale_snapshot text not null,
  post_created_at_snapshot timestamptz not null,
  reason text not null check (
    reason in ('harassment', 'scam', 'personal_data', 'self_harm', 'hate', 'spam', 'other')
  ),
  detail text check (detail is null or char_length(detail) <= 500),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text
    check (moderator_note is null or char_length(moderator_note) <= 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reporter_id, post_id, post_revision)
);

create table public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index community_posts_circle_feed_idx
  on public.community_posts (circle_id, created_at desc)
  where status = 'published' and deleted_at is null;
create index community_posts_user_idx
  on public.community_posts (user_id, created_at desc);
create index community_reports_status_idx
  on public.community_reports (status, created_at);
create index community_reports_post_idx
  on public.community_reports (post_id, post_revision);
create index community_blocks_blocked_idx
  on public.community_blocks (blocked_id, blocker_id);
create index community_reactions_user_idx
  on public.community_reactions (user_id, created_at desc);

create or replace function public.community_is_moderator()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'community_role', '')
      in ('moderator', 'admin');
$$;

create or replace function public.community_profile_ready()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.community_profiles p
    where p.id = auth.uid() and p.age_confirmed_at is not null
  );
$$;

create or replace function public.community_active_member(target_circle uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.circle_members m
    join public.circles c on c.id = m.circle_id
    where m.circle_id = target_circle
      and m.user_id = auth.uid()
      and m.status = 'active'
      and c.active
  );
$$;

create or replace function public.community_can_view_user(target_user uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and target_user is not null
    and not exists (
      select 1 from public.community_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = target_user)
         or (b.blocker_id = target_user and b.blocked_id = auth.uid())
    );
$$;

create or replace function public.community_post_is_visible(target_post uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.community_posts p
    join public.circles c on c.id = p.circle_id
    where p.id = target_post
      and p.status = 'published'
      and p.deleted_at is null
      and c.active
      and public.community_can_view_user(p.user_id)
  );
$$;

-- RPC minima publica: so pseudonimo de autor cujo post o chamador pode ver.
create or replace function public.community_public_profile(target_user uuid)
returns table (id uuid, handle text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.handle
  from public.community_profiles p
  where p.id = target_user
    and auth.uid() is not null
    and p.age_confirmed_at is not null
    and public.community_can_view_user(p.id)
    and exists (
      select 1 from public.community_posts post
      where post.user_id = p.id
        and public.community_post_is_visible(post.id)
    );
$$;

-- Guardas rodam com os privilegios do chamador. RPCs SECURITY DEFINER estreitas
-- aparecem mais abaixo e chegam aos guardas como backend confiavel.
create or replace function public.community_profiles_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.handle := lower(btrim(new.handle));
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    if new.age_confirmed_at is not null then
      new.age_confirmed_at := new.created_at;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'community profile identity and creation time are immutable';
  end if;
  if old.age_confirmed_at is null and new.age_confirmed_at is not null then
    new.age_confirmed_at := clock_timestamp();
  elsif old.age_confirmed_at is not null and new.age_confirmed_at is not null then
    new.age_confirmed_at := old.age_confirmed_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.community_members_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  trusted_backend boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin');
begin
  if tg_op = 'INSERT' then
    if not trusted_backend and (
      auth.uid() is null
      or new.user_id is distinct from auth.uid()
      or new.status <> 'active'
      or new.left_at is not null
    ) then
      raise exception 'members may create only their own active membership';
    end if;
    new.joined_at := clock_timestamp();
    new.left_at := null;
    return new;
  end if;
  if new.circle_id is distinct from old.circle_id
     or new.user_id is distinct from old.user_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'community membership identity is immutable';
  end if;
  if not trusted_backend then
    raise exception 'membership transitions require a dedicated RPC';
  end if;
  if old.status = 'left' and new.status <> 'left' then
    raise exception 'left membership is a terminal tombstone';
  elsif new.status = 'left' then
    new.left_at := coalesce(old.left_at, clock_timestamp());
  elsif new.left_at is distinct from old.left_at then
    raise exception 'left_at is server-managed';
  end if;
  return new;
end;
$$;

create or replace function public.community_posts_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  trusted_backend boolean :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin');
begin
  new.body := btrim(new.body);
  if tg_op = 'INSERT' then
    if not trusted_backend and (
      auth.uid() is null
      or new.user_id is distinct from auth.uid()
      or new.status <> 'draft'
      or new.deleted_at is not null
      or new.content_revision <> 1
    ) then
      raise exception 'authors may create only their own draft post';
    end if;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.deleted_at := null;
    new.content_revision := 1;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.circle_id is distinct from old.circle_id
     or new.kind is distinct from old.kind
     or new.locale is distinct from old.locale
     or new.created_at is distinct from old.created_at then
    raise exception 'post identity, circle and creation data are immutable';
  end if;

  if trusted_backend then
    null; -- As RPCs validam a transicao antes deste ponto.
  else
    if old.user_id <> auth.uid()
       or old.status <> 'draft'
       or new.status is distinct from old.status
       or new.deleted_at is distinct from old.deleted_at
       or new.content_revision is distinct from old.content_revision then
      raise exception 'authors may edit only their own draft body';
    end if;
  end if;

  if new.status = 'published' and not exists (
    select 1 from public.circles c where c.id = new.circle_id and c.active
  ) then
    raise exception 'cannot publish into an inactive circle';
  end if;

  if new.body is distinct from old.body then
    new.content_revision := old.content_revision + 1;
  else
    new.content_revision := old.content_revision;
  end if;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.community_reactions_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.community_blocks_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.community_reports_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.reporter_id is distinct from old.reporter_id
     or new.post_id is distinct from old.post_id
     or new.reported_user_id is distinct from old.reported_user_id
     or new.post_revision is distinct from old.post_revision
     or new.post_body_snapshot is distinct from old.post_body_snapshot
     or new.post_kind_snapshot is distinct from old.post_kind_snapshot
     or new.post_locale_snapshot is distinct from old.post_locale_snapshot
     or new.post_created_at_snapshot is distinct from old.post_created_at_snapshot
     or new.reason is distinct from old.reason
     or new.detail is distinct from old.detail
     or new.created_at is distinct from old.created_at then
    raise exception 'report evidence is immutable';
  end if;
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'report moderation requires a dedicated RPC';
  end if;
  if new.status in ('resolved', 'dismissed') then
    new.resolved_at := coalesce(old.resolved_at, clock_timestamp());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  else
    new.resolved_at := null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger community_profiles_guard_trigger before insert or update
on public.community_profiles for each row
execute function public.community_profiles_guard();

create trigger community_members_guard_trigger before insert or update
on public.circle_members for each row
execute function public.community_members_guard();

create trigger community_posts_guard_trigger before insert or update
on public.community_posts for each row
execute function public.community_posts_guard();

create trigger community_reactions_guard_trigger before insert
on public.community_reactions for each row
execute function public.community_reactions_guard();

create trigger community_blocks_guard_trigger before insert
on public.community_blocks for each row
execute function public.community_blocks_guard();

create trigger community_reports_guard_trigger before insert or update
on public.community_reports for each row
execute function public.community_reports_guard();

-- RPCs estreitas para transicoes que nunca ficam abertas a UPDATE arbitrario.
create or replace function public.community_submit_post(
  target_post uuid,
  expected_revision integer
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null
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
$$;

create or replace function public.community_moderate_post(
  target_post uuid,
  expected_revision integer,
  expected_status text,
  target_status text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.community_is_moderator()
     or expected_revision is null
     or expected_revision < 1
     or expected_status is null
     or target_status is null
     or expected_status not in ('pending', 'published', 'hidden')
     or target_status not in ('published', 'hidden', 'removed') then
    return false;
  end if;

  if not (
    (expected_status = 'pending' and target_status in ('published', 'hidden', 'removed'))
    or (expected_status = 'published' and target_status in ('hidden', 'removed'))
    or (expected_status = 'hidden' and target_status in ('published', 'removed'))
  ) then
    return false;
  end if;

  update public.community_posts p
  set status = target_status,
      deleted_at = case
        when target_status = 'removed' then clock_timestamp()
        else null
      end
  where p.id = target_post
    and p.content_revision = expected_revision
    and p.status = expected_status
    and p.deleted_at is null
    and (
      target_status <> 'published'
      or exists (
        select 1 from public.circles c
        where c.id = p.circle_id and c.active
      )
    );
  return found;
end;
$$;

create or replace function public.community_leave_circle(target_circle uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.circle_members m
  set status = 'left', left_at = clock_timestamp()
  where m.circle_id = target_circle
    and m.user_id = auth.uid()
    and m.status = 'active';
  return found;
end;
$$;

create or replace function public.community_moderate_membership(
  target_circle uuid,
  target_user uuid,
  expected_status text,
  target_status text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.community_is_moderator()
     or expected_status is null
     or target_status is null
     or target_status not in ('active', 'paused', 'removed')
     or expected_status not in ('active', 'paused')
     or (expected_status = 'active' and target_status not in ('paused', 'removed'))
     or (expected_status = 'paused' and target_status not in ('active', 'removed')) then
    return false;
  end if;

  update public.circle_members m
  set status = target_status
  where m.circle_id = target_circle
    and m.user_id = target_user
    and m.status = expected_status
    and m.left_at is null;
  return found;
end;
$$;

create or replace function public.community_delete_own_post(target_post uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then return false; end if;
  update public.community_posts
  set status = case
        when status in ('hidden', 'removed') then status
        else 'deleted'
      end,
      deleted_at = clock_timestamp()
  where id = target_post and user_id = auth.uid() and deleted_at is null;
  return found;
end;
$$;

create or replace function public.community_report_post(
  target_post uuid,
  target_reason text,
  target_detail text default null
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  source_post public.community_posts%rowtype;
  report_id uuid;
begin
  if auth.uid() is null
     or target_reason is null
     or target_reason not in (
       'harassment', 'scam', 'personal_data', 'self_harm', 'hate', 'spam', 'other'
     )
     or (target_detail is not null and char_length(target_detail) > 500) then
    return null;
  end if;

  select p.* into source_post
  from public.community_posts p
  where p.id = target_post
    and p.user_id <> auth.uid()
    and public.community_post_is_visible(p.id);
  if not found then return null; end if;

  select r.id into report_id
  from public.community_reports r
  where r.reporter_id = auth.uid()
    and r.post_id = source_post.id
    and r.post_revision = source_post.content_revision;
  if report_id is not null then return report_id; end if;

  insert into public.community_reports (
    reporter_id, post_id, reported_user_id, post_revision,
    post_body_snapshot, post_kind_snapshot, post_locale_snapshot,
    post_created_at_snapshot, reason, detail
  ) values (
    auth.uid(), source_post.id, source_post.user_id, source_post.content_revision,
    source_post.body, source_post.kind, source_post.locale,
    source_post.created_at, target_reason, nullif(btrim(target_detail), '')
  )
  on conflict (reporter_id, post_id, post_revision) do nothing
  returning id into report_id;

  if report_id is null then
    select r.id into report_id
    from public.community_reports r
    where r.reporter_id = auth.uid()
      and r.post_id = source_post.id
      and r.post_revision = source_post.content_revision;
  end if;
  return report_id;
end;
$$;

-- A autora da denuncia recebe apenas recibo/status. Snapshot, identidade da pessoa
-- denunciada, nota interna e moderador responsavel ficam restritos a moderacao.
create or replace function public.community_own_reports()
returns table (
  id uuid,
  post_id uuid,
  reason text,
  detail text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select r.id, r.post_id, r.reason, r.detail, r.status, r.created_at, r.updated_at
  from public.community_reports r
  where auth.uid() is not null and r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

create or replace function public.community_moderate_report(
  target_report uuid,
  expected_updated_at timestamptz,
  target_status text,
  target_note text default null
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.community_is_moderator()
     or expected_updated_at is null
     or target_status is null
     or target_status not in ('reviewing', 'resolved', 'dismissed')
     or (target_note is not null and char_length(target_note) > 1000) then
    return false;
  end if;

  update public.community_reports r
  set status = target_status,
      moderator_note = nullif(btrim(target_note), ''),
      reviewed_by = auth.uid(),
      resolved_at = case
        when target_status in ('resolved', 'dismissed') then clock_timestamp()
        else null
      end
  where r.id = target_report
    and r.updated_at = expected_updated_at
    and (
      (r.status = 'open' and target_status in ('reviewing', 'resolved', 'dismissed'))
      or (r.status = 'reviewing' and target_status in ('resolved', 'dismissed'))
    );
  return found;
end;
$$;

create or replace function public.community_delete_profile()
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  -- Posts ficam somente para retencao/moderacao, invisiveis no produto.
  update public.community_posts
  set status = case
        when status in ('hidden', 'removed') then status
        else 'deleted'
      end,
      deleted_at = clock_timestamp()
  where user_id = actor and deleted_at is null;
  delete from public.community_reactions where user_id = actor;
  -- Punicoes paused/removed e bloqueios feitos por terceiros precisam sobreviver.
  update public.circle_members
  set status = 'left', left_at = clock_timestamp()
  where user_id = actor and status in ('active', 'paused');
  delete from public.community_blocks where blocker_id = actor;
  delete from public.community_profiles where id = actor;
  return found;
end;
$$;

-- Zera tambem grants antigos de authenticated antes da allowlist abaixo. Isso
-- evita que uma funcao homonima deixada por um ensaio local amplie privilegios.
revoke all on function public.community_is_moderator() from public, anon, authenticated;
revoke all on function public.community_profile_ready() from public, anon, authenticated;
revoke all on function public.community_active_member(uuid) from public, anon, authenticated;
revoke all on function public.community_can_view_user(uuid) from public, anon, authenticated;
revoke all on function public.community_post_is_visible(uuid) from public, anon, authenticated;
revoke all on function public.community_public_profile(uuid) from public, anon, authenticated;
revoke all on function public.community_submit_post(uuid, integer) from public, anon, authenticated;
revoke all on function public.community_moderate_post(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.community_leave_circle(uuid) from public, anon, authenticated;
revoke all on function public.community_moderate_membership(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.community_delete_own_post(uuid) from public, anon, authenticated;
revoke all on function public.community_report_post(uuid, text, text) from public, anon, authenticated;
revoke all on function public.community_own_reports() from public, anon, authenticated;
revoke all on function public.community_moderate_report(uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.community_delete_profile() from public, anon, authenticated;
revoke all on function public.community_profiles_guard() from public, anon, authenticated;
revoke all on function public.community_members_guard() from public, anon, authenticated;
revoke all on function public.community_posts_guard() from public, anon, authenticated;
revoke all on function public.community_reactions_guard() from public, anon, authenticated;
revoke all on function public.community_blocks_guard() from public, anon, authenticated;
revoke all on function public.community_reports_guard() from public, anon, authenticated;

grant execute on function public.community_is_moderator() to authenticated;
grant execute on function public.community_profile_ready() to authenticated;
grant execute on function public.community_active_member(uuid) to authenticated;
grant execute on function public.community_can_view_user(uuid) to authenticated;
grant execute on function public.community_post_is_visible(uuid) to authenticated;
grant execute on function public.community_public_profile(uuid) to authenticated;
grant execute on function public.community_submit_post(uuid, integer) to authenticated;
grant execute on function public.community_moderate_post(uuid, integer, text, text) to authenticated;
grant execute on function public.community_leave_circle(uuid) to authenticated;
grant execute on function public.community_moderate_membership(uuid, uuid, text, text) to authenticated;
grant execute on function public.community_delete_own_post(uuid) to authenticated;
grant execute on function public.community_report_post(uuid, text, text) to authenticated;
grant execute on function public.community_own_reports() to authenticated;
grant execute on function public.community_moderate_report(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.community_delete_profile() to authenticated;

alter table public.community_profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;

create policy "users read own community profile"
  on public.community_profiles for select to authenticated
  using (id = auth.uid());
create policy "users create own community profile"
  on public.community_profiles for insert to authenticated
  with check (id = auth.uid());
create policy "users update own community profile"
  on public.community_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "active circles readable by signed-in users"
  on public.circles for select to authenticated
  using (active or public.community_is_moderator());

create policy "memberships readable by owner"
  on public.circle_members for select to authenticated
  using (user_id = auth.uid() or public.community_is_moderator());
create policy "adults join active circles"
  on public.circle_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'active'
    and public.community_profile_ready()
    and exists (
      select 1 from public.circles c where c.id = circle_id and c.active
    )
  );
create policy "visible posts own work or moderation"
  on public.community_posts for select to authenticated
  using (
    (user_id = auth.uid() and deleted_at is null)
    or public.community_post_is_visible(id)
    or public.community_is_moderator()
  );
create policy "members create own posts"
  on public.community_posts for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.community_profile_ready()
    and public.community_active_member(circle_id)
    and status = 'draft'
    and deleted_at is null
  );
-- Pending e imutavel para a autora. Para revisar, ela exclui a submissao por RPC
-- e cria um novo draft; nenhuma decisao de moderacao e sobrescrita em silencio.
create policy "authors edit own posts"
  on public.community_posts for update to authenticated
  using (
    user_id = auth.uid() and status = 'draft' and deleted_at is null
  )
  with check (
    user_id = auth.uid()
    and status = 'draft'
    and deleted_at is null
    and public.community_profile_ready()
    and public.community_active_member(circle_id)
  );
create policy "reactions readable on visible posts"
  on public.community_reactions for select to authenticated
  using (
    public.community_can_view_user(user_id)
    and public.community_post_is_visible(post_id)
  );
create policy "users add own reactions"
  on public.community_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.community_profile_ready()
    and public.community_post_is_visible(post_id)
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and p.user_id <> auth.uid()
        and public.community_active_member(p.circle_id)
    )
  );
create policy "users remove own reactions"
  on public.community_reactions for delete to authenticated
  using (user_id = auth.uid());

create policy "moderators read reports"
  on public.community_reports for select to authenticated
  using (public.community_is_moderator());
create policy "users read own block list"
  on public.community_blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "users create own blocks"
  on public.community_blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "users remove own blocks"
  on public.community_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Minimo privilegio: RLS decide linhas; grants decidem operacoes disponiveis.
revoke all on table public.community_profiles from anon, authenticated;
revoke all on table public.circles from anon, authenticated;
revoke all on table public.circle_members from anon, authenticated;
revoke all on table public.community_posts from anon, authenticated;
revoke all on table public.community_reactions from anon, authenticated;
revoke all on table public.community_reports from anon, authenticated;
revoke all on table public.community_blocks from anon, authenticated;

grant select on table public.community_profiles to authenticated;
grant insert (id, handle, locale, age_confirmed_at)
  on table public.community_profiles to authenticated;
grant update (handle, locale, age_confirmed_at)
  on table public.community_profiles to authenticated;
grant select on table public.circles to authenticated;
grant select on table public.circle_members to authenticated;
grant insert (circle_id, user_id) on table public.circle_members to authenticated;
grant select on table public.community_posts to authenticated;
grant insert (user_id, circle_id, kind, body, locale)
  on table public.community_posts to authenticated;
grant update (body) on table public.community_posts to authenticated;
grant select, delete on table public.community_reactions to authenticated;
grant insert (post_id, user_id, kind)
  on table public.community_reactions to authenticated;
grant select on table public.community_reports to authenticated;
grant select, delete on table public.community_blocks to authenticated;
grant insert (blocker_id, blocked_id)
  on table public.community_blocks to authenticated;

insert into public.circles (slug, name_pt, name_en)
values
  ('amor-reciproco', 'Amor reciproco', 'Reciprocal love'),
  ('prosperidade-consciente', 'Prosperidade consciente', 'Mindful prosperity'),
  ('coragem-confianca', 'Coragem e confianca', 'Courage and confidence'),
  ('proposito-carreira', 'Proposito e carreira', 'Purpose and career'),
  ('corpo-cuidado', 'Corpo e cuidado', 'Body and care'),
  ('paz-presenca', 'Paz e presenca', 'Peace and presence')
on conflict (slug) do update set
  name_pt = excluded.name_pt,
  name_en = excluded.name_en;
