-- Consentimento auditavel e vinculo local opcional para relatos da comunidade.
-- Relatos existentes nao recebem consentimento retroativo inventado.

begin;

alter table public.community_posts
  add column if not exists manifestation_ref text
    check (manifestation_ref is null or char_length(btrim(manifestation_ref)) between 1 and 120),
  add column if not exists publication_consent_at timestamptz;

comment on column public.community_posts.manifestation_ref is
  'Referencia opaca e opcional da manifestacao no aparelho da autora; nunca e usada como prova publica.';
comment on column public.community_posts.publication_consent_at is
  'Instante registrado pelo servidor em que a autora autorizou a eventual publicacao apos moderacao.';

create or replace function public.community_publication_consent_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.manifestation_ref := nullif(btrim(new.manifestation_ref), '');

  if tg_op = 'INSERT' then
    if new.publication_consent_at is not null then
      new.publication_consent_at := clock_timestamp();
    end if;
    return new;
  end if;

  if old.status = 'draft' then
    if new.publication_consent_at is null then
      new.publication_consent_at := null;
    elsif old.publication_consent_at is null then
      new.publication_consent_at := clock_timestamp();
    else
      new.publication_consent_at := old.publication_consent_at;
    end if;
  else
    new.publication_consent_at := old.publication_consent_at;
    new.manifestation_ref := old.manifestation_ref;
  end if;
  return new;
end;
$$;

drop trigger if exists community_publication_consent_guard_trigger on public.community_posts;
create trigger community_publication_consent_guard_trigger
before insert or update on public.community_posts
for each row execute function public.community_publication_consent_guard();

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
    and p.publication_consent_at is not null
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
    and (target_status <> 'published' or p.publication_consent_at is not null)
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

revoke all on function public.community_publication_consent_guard() from public, anon, authenticated;
grant execute on function public.community_submit_post(uuid, integer) to authenticated;
grant execute on function public.community_moderate_post(uuid, integer, text, text) to authenticated;
grant insert (manifestation_ref, publication_consent_at)
  on table public.community_posts to authenticated;
grant update (manifestation_ref, publication_consent_at)
  on table public.community_posts to authenticated;

commit;
