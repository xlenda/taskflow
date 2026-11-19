-- App Attest (iPhone): the attested keys, each bound to one user, and the
-- assertion counter. Server-only: RLS without policies and no anon/authenticated
-- grants; api/app-attest.js and api/_paid-access.js reach it only through the
-- service_role RPCs below. Contract: docs/superpowers/plans/2026-11-19-ios-voz-app-attest.md.

begin;

create table if not exists public.celeste_app_attest_keys (
  key_id text primary key check (key_id ~ '^[A-Za-z0-9+/]{43}=$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null
    check (char_length(public_key) between 100 and 256 and public_key ~ '^[A-Za-z0-9+/]+={0,2}$'),
  sign_count bigint not null default 0 check (sign_count between 0 and 4294967295),
  environment text not null check (environment in ('production', 'development')),
  receipt text not null
    check (char_length(receipt) between 4 and 32768 and receipt ~ '^[A-Za-z0-9+/]+={0,2}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz
);

create index if not exists celeste_app_attest_keys_user_idx
  on public.celeste_app_attest_keys (user_id);

alter table public.celeste_app_attest_keys enable row level security;
revoke all on table public.celeste_app_attest_keys from public, anon, authenticated;

-- Binds a verified key to its user. A key already bound to another user is
-- refused; the same user registering it again (a retried request) keeps the
-- stored counter.
create or replace function public.celeste_register_app_attest_key(
  p_key_id text,
  p_user_id uuid,
  p_public_key text,
  p_environment text,
  p_receipt text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  insert into public.celeste_app_attest_keys (
    key_id, user_id, public_key, sign_count, environment, receipt
  ) values (
    p_key_id, p_user_id, p_public_key, 0, p_environment, p_receipt
  )
  on conflict (key_id) do nothing;

  select keys.user_id
    into v_owner
    from public.celeste_app_attest_keys as keys
   where keys.key_id = p_key_id;
  if v_owner is distinct from p_user_id then
    return jsonb_build_object('registered', false, 'reason', 'other_user');
  end if;
  return jsonb_build_object('registered', true);
end;
$$;

-- The key a paid iPhone request names, only when it belongs to the
-- authenticated user of that request.
create or replace function public.celeste_app_attest_key(
  p_key_id text,
  p_user_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'found', true,
        'publicKey', keys.public_key,
        'environment', keys.environment
      )
        from public.celeste_app_attest_keys as keys
       where keys.key_id = p_key_id
         and keys.user_id = p_user_id
    ),
    jsonb_build_object('found', false)
  );
$$;

-- Apple's assertion step 5: the counter only moves up. One conditional UPDATE,
-- so of two requests carrying the same counter only one advances.
create or replace function public.celeste_advance_app_attest_counter(
  p_key_id text,
  p_user_id uuid,
  p_counter bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.celeste_app_attest_keys as keys
     set sign_count = p_counter,
         last_used_at = clock_timestamp()
   where keys.key_id = p_key_id
     and keys.user_id = p_user_id
     and keys.sign_count < p_counter;
  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'replay');
  end if;
  return jsonb_build_object('advanced', true);
end;
$$;

revoke all on function public.celeste_register_app_attest_key(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.celeste_register_app_attest_key(text, uuid, text, text, text)
  to service_role;

revoke all on function public.celeste_app_attest_key(text, uuid)
  from public, anon, authenticated;
grant execute on function public.celeste_app_attest_key(text, uuid)
  to service_role;

revoke all on function public.celeste_advance_app_attest_counter(text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.celeste_advance_app_attest_counter(text, uuid, bigint)
  to service_role;

notify pgrst, 'reload schema';

commit;
