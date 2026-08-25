-- A retry after a confirmed remote delete must remain successful. This lets
-- the client finish removing its local receipt after a transient storage error
-- without exposing or restoring the already deleted post.
create or replace function public.community_delete_own_post(target_post uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then return false; end if;

  if not exists (
    select 1
    from public.community_posts
    where id = target_post and user_id = auth.uid()
  ) then
    return false;
  end if;

  update public.community_posts
  set status = case
        when status in ('hidden', 'removed') then status
        else 'deleted'
      end,
      deleted_at = coalesce(deleted_at, clock_timestamp())
  where id = target_post and user_id = auth.uid() and deleted_at is null;

  return true;
end;
$$;

revoke all on function public.community_delete_own_post(uuid) from public, anon, authenticated;
grant execute on function public.community_delete_own_post(uuid) to authenticated;
