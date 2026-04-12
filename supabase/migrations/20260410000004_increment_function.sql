-- =============================================================================
-- EternalFrame — atomic increment helper for usage counting
-- Used by services/entitlements.ts recordUsage()
-- =============================================================================
create or replace function public.increment_creations(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    creations_used_this_period = creations_used_this_period + 1,
    total_creations = total_creations + 1
  where id = p_user_id;
end;
$$;

revoke all on function public.increment_creations(uuid) from public;
grant execute on function public.increment_creations(uuid) to service_role;
