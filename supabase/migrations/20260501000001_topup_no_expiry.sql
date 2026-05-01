-- =============================================================================
-- 2026-05-01: Remove 90-day top-up credit expiry (Apple 3.1.1 compliance)
-- =============================================================================
-- Apple App Store Review Guideline 3.1.1:
--   "Any credits or in-game currencies purchased via in-app purchase may not
--    expire."
--
-- The original credit ledger (20260418000001_credit_ledger.sql) stamped a
-- 90-day TTL on every top-up purchase via:
--     topup_expires_at = coalesce(p_topup_expires_at, now() + interval '90 days')
-- That guarantees a rejection at App Store review and is also the same
-- behavior on Google Play (Play policy mirrors Apple here for managed
-- products).
--
-- This migration:
--   1. Re-defines grant_credits() so the topup branch writes
--      `topup_expires_at = p_topup_expires_at` directly (no coalesce). The API
--      now always passes `null`, which means "never expires."
--   2. Clears any legacy 90-day expiry stamps already in profiles. Without
--      this, users who topped up in the launch beta would still see their
--      credits drop on the prior schedule, which conflicts with the public
--      "Credits never expire" copy we ship today.
--
-- spend_credits() did not need a change: the existing
--   `if v_topup > 0 and v_topup_expires is not null and ...`
-- guard already treats null as "never expires."
-- =============================================================================

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text,
  p_plan_id text default null,
  p_renews_on timestamptz default null,
  p_topup_expires_at timestamptz default null,
  p_revenuecat_event_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_after integer;
begin
  if p_amount <= 0 then
    raise exception 'grant_credits: amount must be positive (got %)', p_amount;
  end if;

  if p_revenuecat_event_id is not null then
    perform 1 from public.credit_ledger
      where revenuecat_event_id = p_revenuecat_event_id;
    if found then
      select (topup_credits_remaining + credits_rollover + credits_remaining)
        into v_total_after
      from public.profiles where id = p_user_id;
      return coalesce(v_total_after, 0);
    end if;
  end if;

  if p_action = 'topup_purchase' then
    -- Top-ups: write the caller-supplied expiry verbatim. The webhook now
    -- passes null (Apple 3.1.1 - credits may not expire). Legacy callers
    -- that still pass a timestamp keep working unchanged.
    update public.profiles
    set
      topup_credits_remaining = topup_credits_remaining + p_amount,
      topup_expires_at = p_topup_expires_at
    where id = p_user_id;
  elsif p_action = 'monthly_refresh' then
    update public.profiles
    set
      credits_rollover = least(
        p_amount * 2,
        coalesce(credits_rollover, 0) + coalesce(credits_remaining, 0)
      ),
      credits_remaining = p_amount,
      plan_id = coalesce(p_plan_id, plan_id),
      renews_on = coalesce(p_renews_on, renews_on)
    where id = p_user_id;
  else
    update public.profiles
    set
      credits_remaining = credits_remaining + p_amount,
      plan_id = coalesce(p_plan_id, plan_id),
      renews_on = coalesce(p_renews_on, renews_on)
    where id = p_user_id;
  end if;

  select (topup_credits_remaining + credits_rollover + credits_remaining)
    into v_total_after
  from public.profiles where id = p_user_id;

  if v_total_after is null then
    raise exception 'grant_credits: profile not found for user %', p_user_id;
  end if;

  insert into public.credit_ledger
    (user_id, amount, action, revenuecat_event_id, balance_after)
  values
    (p_user_id, p_amount, p_action, p_revenuecat_event_id, v_total_after);

  return v_total_after;
end;
$$;

-- One-shot backfill: clear any expiry stamps left over from the 90-day era.
-- Anyone who actually topped up gets their credits made permanent. This is a
-- compliance correction, not a perk — Apple's rule is retroactive once
-- enforced, so we may not keep stale TTLs in the column.
update public.profiles
set topup_expires_at = null
where topup_expires_at is not null;
