-- =============================================================================
-- HaloFrame — credit ledger migration (2026-04-18)
--
-- Refactors entitlement enforcement from the legacy 5-tier quota model
-- (free/weekly/monthly/premium_monthly/premium_annual with
-- creations_used_this_period counters) to the approved 3-tier credit
-- model (free / keepsake_monthly / heritage_monthly / heritage_annual).
--
-- Old columns stay in place during this deploy so the existing webhook
-- and /api/tribute/* authenticated routes keep working; a follow-up
-- migration will drop them in the Phase 4 cleanup once every caller has
-- been cut over.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles: additive columns
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan_id text not null default 'free'
    check (plan_id in ('free','keepsake_monthly','heritage_monthly','heritage_annual'));

alter table public.profiles
  add column if not exists credits_remaining integer not null default 2
    check (credits_remaining >= 0);

-- Heritage rollover bucket (up to 2 months of unused monthly credits carry over).
alter table public.profiles
  add column if not exists credits_rollover integer not null default 0
    check (credits_rollover >= 0);

alter table public.profiles
  add column if not exists renews_on timestamptz;

-- Top-up credits (4-pack, single). Expire 90 days after purchase; drain before
-- monthly credits since they're the shortest-lived bucket.
alter table public.profiles
  add column if not exists topup_credits_remaining integer not null default 0
    check (topup_credits_remaining >= 0);

alter table public.profiles
  add column if not exists topup_expires_at timestamptz;

-- -----------------------------------------------------------------------------
-- Backfill: existing users become Free with 2 lifetime credits minus what
-- they've already consumed under the old quota. Caps at 0 so no one gets
-- a negative balance. Paid-tier holders need a manual grant pass before
-- the old columns are dropped in Phase 4.
-- -----------------------------------------------------------------------------
update public.profiles
set
  plan_id = 'free',
  credits_remaining = greatest(0, 2 - coalesce(creations_used_this_period, 0)),
  credits_rollover = 0,
  topup_credits_remaining = 0
where plan_id = 'free';

-- -----------------------------------------------------------------------------
-- credit_ledger: append-only audit of every credit spend.
-- - dedupe_key prevents double-spend when a client retries a save
--   (client sends a stable save-id; the unique constraint rejects the
--   second attempt inside the same transaction as the decrement).
-- - amount is positive for grants, negative for spends — one shape for
--   both so reporting can SUM over the table.
-- -----------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  action text not null check (action in (
    'signup_grant',
    'monthly_refresh',
    'topup_purchase',
    'merge',
    'apply_final',
    'manual_adjustment'
  )),
  dedupe_key text,
  tribute_id uuid references public.tributes(id) on delete set null,
  revenuecat_event_id text,
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_credit_ledger_dedupe
  on public.credit_ledger(user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger(user_id, created_at desc);

create unique index if not exists uq_credit_ledger_revenuecat_event
  on public.credit_ledger(revenuecat_event_id)
  where revenuecat_event_id is not null;

-- -----------------------------------------------------------------------------
-- spend_credits: atomic three-bucket drain.
-- Drain priority (shortest expiry first):
--   1. topup_credits_remaining (90-day expiry)
--   2. credits_rollover        (2-month rollover window)
--   3. credits_remaining       (current period)
-- Returns the new total balance across all buckets. Raises
-- 'insufficient_credits' when the sum of all three is below p_amount —
-- the route handler catches this and surfaces errors.paymentRequired().
-- p_dedupe_key lets callers supply a stable id; a second call with the
-- same key hits the unique index on credit_ledger and aborts.
-- -----------------------------------------------------------------------------
create or replace function public.spend_credits(
  p_user_id uuid,
  p_amount integer,
  p_action text,
  p_dedupe_key text default null,
  p_tribute_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup integer;
  v_rollover integer;
  v_monthly integer;
  v_topup_expires timestamptz;
  v_remaining_to_spend integer := p_amount;
  v_from_topup integer;
  v_from_rollover integer;
  v_from_monthly integer;
  v_total_after integer;
begin
  if p_amount <= 0 then
    raise exception 'spend_credits: amount must be positive (got %)', p_amount;
  end if;

  -- Lock the row so concurrent spends serialize. Without FOR UPDATE the
  -- atomic write below would still be correct (the WHERE clause guards
  -- the balance check) but ledger rows would show an incoherent sequence.
  select topup_credits_remaining, credits_rollover, credits_remaining, topup_expires_at
    into v_topup, v_rollover, v_monthly, v_topup_expires
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'spend_credits: profile not found for user %', p_user_id;
  end if;

  -- Expire stale top-ups silently. The user sees them disappear the next
  -- time they load the app; no webhook required.
  if v_topup > 0 and v_topup_expires is not null and v_topup_expires <= now() then
    v_topup := 0;
  end if;

  if (v_topup + v_rollover + v_monthly) < p_amount then
    raise exception 'insufficient_credits'
      using hint = format('available=%s requested=%s',
                          v_topup + v_rollover + v_monthly,
                          p_amount);
  end if;

  v_from_topup := least(v_topup, v_remaining_to_spend);
  v_remaining_to_spend := v_remaining_to_spend - v_from_topup;

  v_from_rollover := least(v_rollover, v_remaining_to_spend);
  v_remaining_to_spend := v_remaining_to_spend - v_from_rollover;

  v_from_monthly := v_remaining_to_spend;  -- guaranteed <= v_monthly by the check above

  update public.profiles
  set
    topup_credits_remaining = topup_credits_remaining - v_from_topup,
    credits_rollover = credits_rollover - v_from_rollover,
    credits_remaining = credits_remaining - v_from_monthly,
    -- Clear the expiry stamp when the bucket is drained; avoids a stale
    -- expiry sticking around on a zero balance.
    topup_expires_at = case
      when (topup_credits_remaining - v_from_topup) = 0 then null
      else topup_expires_at
    end
  where id = p_user_id;

  v_total_after := (v_topup - v_from_topup)
                 + (v_rollover - v_from_rollover)
                 + (v_monthly - v_from_monthly);

  -- Audit row. Unique index on (user_id, dedupe_key) enforces single-spend
  -- per save action when p_dedupe_key is provided.
  insert into public.credit_ledger
    (user_id, amount, action, dedupe_key, tribute_id, balance_after)
  values
    (p_user_id, -p_amount, p_action, p_dedupe_key, p_tribute_id, v_total_after);

  return v_total_after;
end;
$$;

revoke all on function public.spend_credits(uuid, integer, text, text, uuid) from public;
grant execute on function public.spend_credits(uuid, integer, text, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- grant_credits: webhook + signup path. Adds credits to the right bucket
-- based on the action. Idempotent on revenuecat_event_id when provided —
-- RevenueCat retries events; the unique index guarantees one grant per event.
-- -----------------------------------------------------------------------------
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

  -- Replay protection. If this event has already been processed, return
  -- the current balance without re-granting. Using a dedicated check so
  -- we can short-circuit before taking the row lock below.
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
    -- Top-ups pile onto the expiring bucket. Reset the expiry stamp to
    -- the new purchase's window so a second pack doesn't get a shorter
    -- TTL from a prior purchase.
    update public.profiles
    set
      topup_credits_remaining = topup_credits_remaining + p_amount,
      topup_expires_at = coalesce(p_topup_expires_at, now() + interval '90 days')
    where id = p_user_id;
  elsif p_action = 'monthly_refresh' then
    -- Per billing anniversary: unused monthly → rollover (if plan allows),
    -- new monthly credits replace the pool. Rollover cap is 2 months' worth,
    -- matching SUBSCRIPTION_PLANS_UI.rolloverMonths for heritage plans.
    -- The caller (webhook) passes p_amount = plan.credits for the new period.
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
    -- signup_grant, manual_adjustment: simple bump to the monthly bucket.
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

revoke all on function public.grant_credits(uuid, integer, text, text, timestamptz, timestamptz, text) from public;
grant execute on function public.grant_credits(uuid, integer, text, text, timestamptz, timestamptz, text) to service_role;

-- -----------------------------------------------------------------------------
-- Signup grant: every new auth user gets 2 lifetime Free credits. Replaces
-- the prior trigger that only inserted the profile row — profile creation
-- and the welcome credit are atomically tied so a signup can't land
-- without a balance to start from.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, plan_id, credits_remaining)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'free',
    2
  )
  on conflict (id) do nothing;

  -- Audit the grant even though it's the default column value, so the
  -- ledger is a complete history from row zero.
  insert into public.credit_ledger (user_id, amount, action, balance_after)
  values (new.id, 2, 'signup_grant', 2)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- RLS: users may read their own ledger rows but not write them.
-- Service role (the API) bypasses RLS, so credit mutations still work.
-- -----------------------------------------------------------------------------
alter table public.credit_ledger enable row level security;

drop policy if exists credit_ledger_read_own on public.credit_ledger;
create policy credit_ledger_read_own
  on public.credit_ledger for select
  using (auth.uid() = user_id);
