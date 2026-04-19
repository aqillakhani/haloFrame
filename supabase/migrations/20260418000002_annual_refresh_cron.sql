-- =============================================================================
-- HaloFrame — annual-refresh cron + security hardening (2026-04-18)
--
-- Heritage Annual subscribers pay once/year but receive 20 credits/month.
-- RevenueCat only sends a RENEWAL event at the annual anniversary, so we
-- schedule a daily pg_cron job that tops up any annual profile whose
-- monthly_refresh_at timestamp has elapsed.
--
-- Also fixes the security advisory on touch_updated_at (mutable search_path).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pg_cron extension
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- -----------------------------------------------------------------------------
-- profiles: track the next monthly credit refresh for annual subscribers.
-- NULL = not an annual subscriber OR no refresh scheduled yet.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists monthly_refresh_at timestamptz;

create index if not exists idx_profiles_monthly_refresh_due
  on public.profiles(monthly_refresh_at)
  where plan_id = 'heritage_annual' and monthly_refresh_at is not null;

-- -----------------------------------------------------------------------------
-- run_annual_monthly_refresh: the cron body. Iterates every heritage_annual
-- profile whose monthly_refresh_at has elapsed and whose renews_on hasn't
-- expired, grants the month's 20 credits, and advances monthly_refresh_at.
--
-- Idempotency: each grant uses a deterministic pseudo-event-id
-- 'annual_monthly_<user>_<yyyymm>' so a cron double-fire on the same day
-- hits the uq_credit_ledger_revenuecat_event unique index and no-ops.
-- -----------------------------------------------------------------------------
create or replace function public.run_annual_monthly_refresh()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_processed integer := 0;
  v_pseudo_event_id text;
begin
  for v_row in
    select id, monthly_refresh_at, renews_on
      from public.profiles
     where plan_id = 'heritage_annual'
       and monthly_refresh_at is not null
       and monthly_refresh_at <= now()
       and (renews_on is null or renews_on > now())
     for update skip locked
  loop
    v_pseudo_event_id := 'annual_monthly_'
                      || v_row.id::text
                      || '_'
                      || to_char(v_row.monthly_refresh_at, 'YYYYMM');

    perform public.grant_credits(
      v_row.id,
      20,
      'monthly_refresh',
      'heritage_annual',
      v_row.renews_on,
      null,
      v_pseudo_event_id
    );

    update public.profiles
       set monthly_refresh_at = monthly_refresh_at + interval '30 days'
     where id = v_row.id;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke all on function public.run_annual_monthly_refresh() from public;
grant execute on function public.run_annual_monthly_refresh() to service_role;

-- -----------------------------------------------------------------------------
-- Schedule: daily at 00:15 UTC. Offset from midnight so it doesn't collide
-- with any other housekeeping.
-- -----------------------------------------------------------------------------
select cron.unschedule('haloframe_annual_monthly_refresh')
  where exists (select 1 from cron.job where jobname = 'haloframe_annual_monthly_refresh');

select cron.schedule(
  'haloframe_annual_monthly_refresh',
  '15 0 * * *',
  $cron$select public.run_annual_monthly_refresh();$cron$
);

-- -----------------------------------------------------------------------------
-- Security fix: pin touch_updated_at's search_path (addresses the linter
-- warning "function_search_path_mutable").
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
