-- =============================================================================
-- EternalFrame — row level security policies
-- =============================================================================

-- Enable RLS on all user-owned tables
alter table public.profiles enable row level security;
alter table public.tributes enable row level security;
alter table public.print_orders enable row level security;
alter table public.usage_log enable row level security;
alter table public.tribute_templates enable row level security;

-- -----------------------------------------------------------------------------
-- profiles: users can read/update their own profile
-- -----------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- (insert handled by handle_new_auth_user trigger as security definer)

-- -----------------------------------------------------------------------------
-- tributes: users can CRUD only their own
-- -----------------------------------------------------------------------------
drop policy if exists "tributes_select_own" on public.tributes;
create policy "tributes_select_own"
  on public.tributes for select
  using (auth.uid() = user_id);

drop policy if exists "tributes_insert_own" on public.tributes;
create policy "tributes_insert_own"
  on public.tributes for insert
  with check (auth.uid() = user_id);

drop policy if exists "tributes_update_own" on public.tributes;
create policy "tributes_update_own"
  on public.tributes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tributes_delete_own" on public.tributes;
create policy "tributes_delete_own"
  on public.tributes for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- print_orders: users can read their own, server-only writes (service role bypasses RLS)
-- -----------------------------------------------------------------------------
drop policy if exists "print_orders_select_own" on public.print_orders;
create policy "print_orders_select_own"
  on public.print_orders for select
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- usage_log: users can read their own (write is server-only via service role)
-- -----------------------------------------------------------------------------
drop policy if exists "usage_log_select_own" on public.usage_log;
create policy "usage_log_select_own"
  on public.usage_log for select
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- tribute_templates: anyone signed in can read active templates
-- -----------------------------------------------------------------------------
drop policy if exists "templates_select_active" on public.tribute_templates;
create policy "templates_select_active"
  on public.tribute_templates for select
  using (is_active = true);
