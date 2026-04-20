-- =============================================================================
-- 2026-04-21 — per-flow free tier
--
-- Before: free tier had a fungible 2-credit grant. User could spend both on
-- enhance or both on reunite.
-- After: 1 free enhance AND 1 free reunite (tracked by two booleans). The
-- credit-model still governs paid tiers and top-ups; these flags are an
-- ADDITIONAL gate for free-tier users only.
--
-- Additive migration — safe to apply on a live DB. Does not touch existing
-- profile rows' credit balances.
-- =============================================================================

alter table public.profiles
  add column if not exists enhance_used boolean not null default false;

alter table public.profiles
  add column if not exists merge_used boolean not null default false;

comment on column public.profiles.enhance_used is
  'Free tier: true once the user saves their first Enhance tribute. Paid tiers ignore this flag.';
comment on column public.profiles.merge_used is
  'Free tier: true once the user saves their first Reunite tribute. Paid tiers ignore this flag.';

-- Bump the free-tier grant from 2 to 3 so a free user can afford
-- ONE enhance (1 credit) AND one reunite (2 credits: merge + apply_final).
-- Existing rows with `credits_remaining < 3` are NOT touched to avoid
-- retro-giving credits to users who already burned their 2 — the flags
-- above are the primary gate anyway.
alter table public.profiles
  alter column credits_remaining set default 3;
