-- =============================================================================
-- EternalFrame — initial schema
-- Run via: supabase db push  (or paste into SQL editor on a fresh project)
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =============================================================================
-- profiles
-- Extends Supabase auth.users with app-level fields.
-- =============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free','weekly','monthly','premium_monthly','premium_annual')),
  creations_used_this_period integer not null default 0,
  period_reset_at timestamptz,
  total_creations integer not null default 0,
  revenuecat_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_revenuecat on public.profiles(revenuecat_id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- =============================================================================
-- tribute_templates
-- Server-managed catalog of memorial effect presets.
-- =============================================================================
create table if not exists public.tribute_templates (
  id text primary key,
  name text not null,
  description text,
  category text not null check (category in ('heavenly','angelic','artistic','pet','clean')),
  prompt_template text not null,
  prompt_modifiers jsonb not null default '{}'::jsonb,
  preview_image_url text,
  is_pet_compatible boolean not null default false,
  is_human_compatible boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_tribute_templates_active_sort
  on public.tribute_templates(is_active, sort_order);

-- =============================================================================
-- tributes
-- One row per memorial creation. State machine state lives in the JSONB column.
-- =============================================================================
create table if not exists public.tributes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flow_type text not null check (flow_type in ('enhance','reunite','pet_enhance','pet_reunite')),
  status text not null default 'draft' check (status in ('draft','processing','completed','failed')),
  step text not null default 'created'
    check (step in ('created','uploaded','segmented','subject_selected','merged','templated','composited','finalized','failed')),
  state jsonb not null default '{}'::jsonb,

  -- Source images
  main_photo_url text,
  loved_one_photo_url text,

  -- Segmentation
  segmentation_data jsonb,
  selected_subject_index integer,

  -- Reunite
  placement text check (placement is null or placement in ('left','right','behind','center')),
  merged_photo_url text,

  -- Memorial effect
  template_id text references public.tribute_templates(id),
  effect_intensity real not null default 0.7,

  -- Text overlay
  overlay_name text,
  overlay_dates text,
  overlay_phrase text,
  overlay_font text not null default 'serif_classic',
  overlay_position text not null default 'bottom_center',

  -- Border
  border_style text not null default 'none',

  -- Final outputs
  final_photo_url text,
  final_photo_hd_url text,
  final_video_url text,

  -- Metadata
  is_pet boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tributes_user_step on public.tributes(user_id, step);
create index if not exists idx_tributes_user_created on public.tributes(user_id, created_at desc);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tributes_touch_updated_at on public.tributes;
create trigger tributes_touch_updated_at
  before update on public.tributes
  for each row execute procedure public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- =============================================================================
-- print_orders
-- =============================================================================
create table if not exists public.print_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  tribute_id uuid not null references public.tributes(id) on delete restrict,
  print_product_type text not null,
  print_status text not null default 'pending_payment'
    check (print_status in ('pending_payment','pending_fulfillment','submitted','printing','shipped','delivered','cancelled')),
  external_order_id text,
  shipping_address jsonb not null,
  price_cents integer not null check (price_cents >= 0),
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_print_orders_user_created
  on public.print_orders(user_id, created_at desc);

drop trigger if exists print_orders_touch_updated_at on public.print_orders;
create trigger print_orders_touch_updated_at
  before update on public.print_orders
  for each row execute procedure public.touch_updated_at();

-- =============================================================================
-- usage_log
-- Append-only audit of every cost-bearing AI call.
-- =============================================================================
create table if not exists public.usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tribute_id uuid references public.tributes(id) on delete set null,
  creation_type text not null check (creation_type in ('photo','video','segment','merge','apply','finalize')),
  api_cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_log_user_created
  on public.usage_log(user_id, created_at desc);
