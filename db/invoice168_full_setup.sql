-- ============================================================================
--  invoice168 — COMPLETE DATABASE SETUP (single script)
--  Run ONCE in a fresh Supabase project's SQL Editor. Safe to re-run.
--  Builds every table, function, trigger and Row-Level-Security policy.
-- ============================================================================

-- ==== 1. CORE SCHEMA (companies, profiles, customers, tax_rates, products, invoices, invoice_items, payments, helper functions) ====
-- ============================================================
-- invoice168 — Core Invoicing SaaS schema (Supabase / Postgres)
-- Multi-tenant (per-company), Supabase Auth, Row Level Security
-- Run this in the Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ============================================================
-- 1. COMPANIES (the tenant)
-- ============================================================
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text,
  address       text,
  city          text,
  state         text,
  country       text,
  postal_code   text,
  logo_url      text,
  default_currency text not null default 'USD',
  invoice_prefix   text not null default 'INV-',
  next_invoice_seq integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_companies_updated on public.companies;
create trigger trg_companies_updated before update on public.companies
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. PROFILES (links Supabase auth user -> company + role)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  full_name   text,
  role        text not null default 'admin' check (role in ('admin','user')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_profiles_company on public.profiles(company_id);
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- helper: current user's company ----------
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- ---------- signup helper: create a company + admin profile ----------
-- Called by the app right after the user signs up.
create or replace function public.create_company_and_profile(
  p_company_name text,
  p_full_name    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;
  insert into public.companies (name) values (p_company_name)
    returning id into v_company_id;
  insert into public.profiles (id, company_id, full_name, role)
    values (auth.uid(), v_company_id, p_full_name, 'admin');
  return v_company_id;
end; $$;

-- ============================================================
-- 3. CUSTOMERS
-- ============================================================
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  payment_terms integer not null default 30,        -- net days
  -- billing address
  billing_address text, billing_city text, billing_state text,
  billing_country text, billing_postal_code text,
  -- delivery address
  delivery_address text, delivery_city text, delivery_state text,
  delivery_country text, delivery_postal_code text,
  notes         text,
  balance       numeric(15,2) not null default 0,   -- outstanding (auto-maintained)
  total_invoiced numeric(15,2) not null default 0,
  total_paid     numeric(15,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_customers_company on public.customers(company_id);
drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================
-- 4. TAX RATES
-- ============================================================
create table if not exists public.tax_rates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,                         -- e.g. 'NY Sales Tax'
  rate        numeric(7,4) not null default 0,       -- percent, e.g. 8.8750
  region      text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_tax_rates_company on public.tax_rates(company_id);
drop trigger if exists trg_tax_rates_updated on public.tax_rates;
create trigger trg_tax_rates_updated before update on public.tax_rates
  for each row execute function public.set_updated_at();

-- ============================================================
-- 5. PRODUCTS / SERVICES
-- ============================================================
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  sku           text,
  description   text,
  unit_price    numeric(15,2) not null default 0,
  tax_rate_id   uuid references public.tax_rates(id) on delete set null,
  track_inventory boolean not null default false,
  stock_quantity  numeric(15,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_products_company on public.products(company_id);
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. INVOICES
-- ============================================================
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  invoice_number text not null,
  customer_id    uuid not null references public.customers(id),
  issue_date     date not null default current_date,
  due_date       date,
  status         text not null default 'draft'
                 check (status in ('draft','sent','partial','paid','overdue','cancelled')),
  subtotal       numeric(15,2) not null default 0,
  tax_total      numeric(15,2) not null default 0,
  total          numeric(15,2) not null default 0,
  amount_paid    numeric(15,2) not null default 0,
  amount_due     numeric(15,2) not null default 0,
  currency       text not null default 'USD',
  is_exempt      boolean not null default false,
  -- address snapshot (taken from customer at creation time)
  billing_address text, billing_city text, billing_state text,
  billing_country text, billing_postal_code text,
  delivery_address text, delivery_city text, delivery_state text,
  delivery_country text, delivery_postal_code text,
  notes          text,
  terms          text,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, invoice_number)
);
create index if not exists idx_invoices_company  on public.invoices(company_id);
create index if not exists idx_invoices_customer on public.invoices(customer_id);
create index if not exists idx_invoices_status   on public.invoices(company_id, status);
drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

-- ============================================================
-- 7. INVOICE ITEMS (line items)
-- ============================================================
create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(15,2) not null default 1,
  unit_price  numeric(15,2) not null default 0,
  tax_rate    numeric(7,4)  not null default 0,    -- percent applied to this line
  line_total  numeric(15,2) not null default 0,    -- quantity * unit_price (pre-tax)
  sort_order  integer not null default 0
);
create index if not exists idx_invoice_items_invoice on public.invoice_items(invoice_id);

-- ============================================================
-- 8. PAYMENTS (multiple partial payments per invoice)
-- ============================================================
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  invoice_id   uuid references public.invoices(id) on delete set null,
  customer_id  uuid not null references public.customers(id),
  amount       numeric(15,2) not null,
  payment_date date not null default current_date,
  method       text not null default 'cash'
               check (method in ('cash','card','bank_transfer','check','other')),
  reference    text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_payments_company  on public.payments(company_id);
create index if not exists idx_payments_invoice  on public.payments(invoice_id);
create index if not exists idx_payments_customer on public.payments(customer_id);

-- ============================================================
-- ROW LEVEL SECURITY — each company sees only its own data
-- ============================================================
alter table public.companies     enable row level security;
alter table public.profiles      enable row level security;
alter table public.customers     enable row level security;
alter table public.tax_rates     enable row level security;
alter table public.products      enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments      enable row level security;

-- companies: members can see/update their own company
drop policy if exists company_select on public.companies;
create policy company_select on public.companies for select
  using (id = public.current_company_id());
drop policy if exists company_update on public.companies;
create policy company_update on public.companies for update
  using (id = public.current_company_id());

-- profiles: a user can see profiles in their company; manage own row
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (company_id = public.current_company_id());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert
  with check (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid());

-- generic per-company policy for the data tables
drop policy if exists customers_all on public.customers;
create policy customers_all on public.customers for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
drop policy if exists tax_rates_all on public.tax_rates;
create policy tax_rates_all on public.tax_rates for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
drop policy if exists products_all on public.products;
create policy products_all on public.products for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
drop policy if exists invoices_all on public.invoices;
create policy invoices_all on public.invoices for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
drop policy if exists payments_all on public.payments;
create policy payments_all on public.payments for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- invoice_items: scoped via their parent invoice's company
drop policy if exists invoice_items_all on public.invoice_items;
create policy invoice_items_all on public.invoice_items for all
  using (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.company_id = public.current_company_id()))
  with check (exists (select 1 from public.invoices i
                 where i.id = invoice_id and i.company_id = public.current_company_id()));

-- ==== 2. ADMIN CONSOLE (super_admin_emails, is_super_admin, admin policies) ====
-- ============================================================
-- invoice168 — Admin (platform owner) add-on
-- Run once in the Supabase SQL Editor (after the main schema).
-- Safe to re-run.
-- ============================================================

create table if not exists public.super_admin_emails ( email text primary key );

-- The platform admin. Whoever signs up with this email becomes super admin.
insert into public.super_admin_emails (email)
  values ('dixon168@invoice168.app')
  on conflict (email) do nothing;

alter table public.super_admin_emails enable row level security;
-- no policies -> table is only readable by the security-definer function below

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.super_admin_emails sae
    join auth.users u on lower(u.email) = lower(sae.email)
    where u.id = auth.uid()
  );
$$;

-- Give the admin full cross-company access. Permissive policies combine with OR,
-- so these sit alongside the existing per-company policies without changing them.
do $$
declare t text;
begin
  foreach t in array array['companies','profiles','customers','tax_rates','products','invoices','invoice_items','payments']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_super_admin()) with check (public.is_super_admin())', t||'_admin', t);
  end loop;
end $$;


-- ==== 3. PAID SAAS / SUBSCRIPTION GATING ====
-- ============================================================
-- invoice168 — Subscription (manual billing) add-on
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

alter table public.companies
  add column if not exists subscription_status text not null default 'active',
  add column if not exists plan_price    numeric(10,2) not null default 20,
  add column if not exists plan_interval text not null default 'month',
  add column if not exists paid_until     date;

do $$ begin
  alter table public.companies add constraint companies_sub_status_chk
    check (subscription_status in ('active','suspended'));
exception when duplicate_object then null; end $$;

-- Any self-service signup (if it ever happens) is born SUSPENDED — no free use.
-- Admin-created companies use the table default ('active') and a paid_until date.
create or replace function public.create_company_and_profile(
  p_company_name text, p_full_name text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.profiles where id = auth.uid())
    then raise exception 'Profile already exists'; end if;
  insert into public.companies (name, subscription_status)
    values (p_company_name, 'suspended')
    returning id into v_company_id;
  insert into public.profiles (id, company_id, full_name, role)
    values (auth.uid(), v_company_id, p_full_name, 'admin');
  return v_company_id;
end; $$;


-- ==== 4. PRODUCT FIELDS (category, cost, inventory flags) ====
-- invoice168 — Items: category, subcategory, cost (stock_quantity/track_inventory already exist)
alter table public.products
  add column if not exists category    text,
  add column if not exists subcategory text,
  add column if not exists cost        numeric(15,2) not null default 0;


-- ==== 5. VENDORS, BILLS, VENDOR PAYMENTS (+ products.preferred_vendor_id) ====
-- ============================================================
-- invoice168 — Vendors / Bills / Payables add-on
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. VENDORS
create table if not exists public.vendors (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  email         text,
  phone         text,
  terms         integer not null default 30,
  billing_address text, billing_city text, billing_state text,
  billing_country text, billing_postal_code text,
  notes         text,
  balance        numeric(15,2) not null default 0,   -- what you owe them (auto)
  total_billed   numeric(15,2) not null default 0,
  total_paid     numeric(15,2) not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_vendors_company on public.vendors(company_id);

-- 2. VENDOR BILLS (what a vendor billed you)
create table if not exists public.vendor_bills (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  vendor_id    uuid not null references public.vendors(id) on delete cascade,
  bill_number  text,
  bill_date    date not null default current_date,
  due_date     date,
  status       text not null default 'unpaid'
               check (status in ('unpaid','partial','paid','cancelled')),
  total        numeric(15,2) not null default 0,
  amount_paid  numeric(15,2) not null default 0,
  amount_due   numeric(15,2) not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_vendor_bills_company on public.vendor_bills(company_id);
create index if not exists idx_vendor_bills_vendor  on public.vendor_bills(vendor_id);

-- 3. VENDOR PAYMENTS (money you paid a vendor)
create table if not exists public.vendor_payments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  vendor_id    uuid not null references public.vendors(id) on delete cascade,
  bill_id      uuid references public.vendor_bills(id) on delete set null,
  amount       numeric(15,2) not null,
  payment_date date not null default current_date,
  method       text not null default 'bank_transfer'
               check (method in ('cash','card','bank_transfer','check','other')),
  reference    text,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_vendor_payments_company on public.vendor_payments(company_id);
create index if not exists idx_vendor_payments_vendor  on public.vendor_payments(vendor_id);
create index if not exists idx_vendor_payments_bill    on public.vendor_payments(bill_id);

-- optional: where a product is usually bought from
alter table public.products
  add column if not exists preferred_vendor_id uuid references public.vendors(id) on delete set null;

-- updated_at triggers (set_updated_at already exists from main schema)
drop trigger if exists trg_vendors_updated on public.vendors;
create trigger trg_vendors_updated before update on public.vendors
  for each row execute function public.set_updated_at();
drop trigger if exists trg_vendor_bills_updated on public.vendor_bills;
create trigger trg_vendor_bills_updated before update on public.vendor_bills
  for each row execute function public.set_updated_at();

-- RLS
alter table public.vendors         enable row level security;
alter table public.vendor_bills    enable row level security;
alter table public.vendor_payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vendors','vendor_bills','vendor_payments']
  loop
    execute format('drop policy if exists %I on public.%I', t||'_all', t);
    execute format('create policy %I on public.%I for all using (company_id = public.current_company_id()) with check (company_id = public.current_company_id())', t||'_all', t);
    execute format('drop policy if exists %I on public.%I', t||'_admin', t);
    execute format('create policy %I on public.%I for all using (public.is_super_admin()) with check (public.is_super_admin())', t||'_admin', t);
  end loop;
end $$;


-- ==== 6. CATEGORIES MANAGEMENT ====
-- invoice168 — Categories management (two-level via parent_id)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  parent_id uuid references public.categories(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_company on public.categories(company_id);
create index if not exists idx_categories_parent on public.categories(parent_id);

alter table public.categories enable row level security;
do $$ begin
  drop policy if exists categories_all on public.categories;
  create policy categories_all on public.categories for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
  drop policy if exists categories_admin on public.categories;
  create policy categories_admin on public.categories for all
    using (public.is_super_admin()) with check (public.is_super_admin());
end $$;


-- ==== 7. ESTIMATES (quotes) + estimate_items ====
-- ============================================================
-- invoice168 — Estimates (quotes) add-on. Run once, safe to re-run.
-- ============================================================
alter table public.companies
  add column if not exists estimate_prefix   text not null default 'EST-',
  add column if not exists next_estimate_seq integer not null default 1;

create table if not exists public.estimates (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  estimate_number text not null,
  customer_id     uuid not null references public.customers(id),
  issue_date      date not null default current_date,
  expiry_date     date,
  status          text not null default 'draft'
                  check (status in ('draft','sent','accepted','declined','expired','converted')),
  subtotal        numeric(15,2) not null default 0,
  tax_total       numeric(15,2) not null default 0,
  total           numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  is_exempt       boolean not null default false,
  billing_address text, billing_city text, billing_state text,
  billing_country text, billing_postal_code text,
  notes           text,
  terms           text,
  converted_invoice_id uuid references public.invoices(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, estimate_number)
);
create index if not exists idx_estimates_company  on public.estimates(company_id);
create index if not exists idx_estimates_customer on public.estimates(customer_id);

create table if not exists public.estimate_items (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text not null,
  quantity    numeric(15,2) not null default 1,
  unit_price  numeric(15,2) not null default 0,
  tax_rate    numeric(7,4)  not null default 0,
  line_total  numeric(15,2) not null default 0,
  sort_order  integer not null default 0
);
create index if not exists idx_estimate_items_estimate on public.estimate_items(estimate_id);

drop trigger if exists trg_estimates_updated on public.estimates;
create trigger trg_estimates_updated before update on public.estimates
  for each row execute function public.set_updated_at();

alter table public.estimates      enable row level security;
alter table public.estimate_items enable row level security;

do $$ begin
  drop policy if exists estimates_all on public.estimates;
  create policy estimates_all on public.estimates for all
    using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
  drop policy if exists estimates_admin on public.estimates;
  create policy estimates_admin on public.estimates for all
    using (public.is_super_admin()) with check (public.is_super_admin());

  drop policy if exists estimate_items_all on public.estimate_items;
  create policy estimate_items_all on public.estimate_items for all
    using (exists (select 1 from public.estimates e where e.id = estimate_id and e.company_id = public.current_company_id()))
    with check (exists (select 1 from public.estimates e where e.id = estimate_id and e.company_id = public.current_company_id()));
  drop policy if exists estimate_items_admin on public.estimate_items;
  create policy estimate_items_admin on public.estimate_items for all
    using (public.is_super_admin()) with check (public.is_super_admin());
end $$;


-- ==== 8. SETTINGS DEFAULTS (notes / terms / payment instructions) ====
-- invoice168 — Settings defaults (logo_url already exists)
alter table public.companies
  add column if not exists default_terms text,
  add column if not exists default_notes text,
  add column if not exists payment_instructions text;


-- ==== 9. INVENTORY LEDGER (movements) + reorder_point ====
-- invoice168 — Inventory movements ledger + reorder point
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  change numeric(15,3) not null,        -- negative = out (sale), positive = in (restock)
  reason text not null default 'adjustment',
  ref_type text,                        -- 'invoice' | 'manual'
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inv_moves_company on public.inventory_movements(company_id);
create index if not exists idx_inv_moves_product on public.inventory_movements(product_id);
create index if not exists idx_inv_moves_ref on public.inventory_movements(ref_type, ref_id);

alter table public.products add column if not exists reorder_point numeric(15,2);

alter table public.inventory_movements enable row level security;
do $$ begin
  drop policy if exists inv_moves_all on public.inventory_movements;
  create policy inv_moves_all on public.inventory_movements for all
    using (company_id = public.current_company_id()) with check (company_id = public.current_company_id());
  drop policy if exists inv_moves_admin on public.inventory_movements;
  create policy inv_moves_admin on public.inventory_movements for all
    using (public.is_super_admin()) with check (public.is_super_admin());
end $$;


-- ==== 10. PUBLIC SIGNUPS (pricing-page order form submissions, no card data) ====
-- invoice168 — public signup/order submissions (no card data)
create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_phone text,
  contact_name text, email text, phone text,
  billing_address text, city text, state text, postal_code text, country text,
  notes text, plan text,
  status text not null default 'new' check (status in ('new','contacted','activated','declined')),
  created_at timestamptz not null default now()
);
create index if not exists idx_signups_created on public.signups(created_at desc);

alter table public.signups enable row level security;
do $$ begin
  -- anyone (public visitor) may submit a signup
  drop policy if exists signups_insert on public.signups;
  create policy signups_insert on public.signups for insert with check (true);
  -- only the platform admin can read / manage them
  drop policy if exists signups_admin on public.signups;
  create policy signups_admin on public.signups for all
    using (public.is_super_admin()) with check (public.is_super_admin());
end $$;


-- ==== 11. COMPANY CONTACT FIELDS (shown in Admin manage panel) ====
alter table public.companies
  add column if not exists contact_name text,
  add column if not exists contact_phone text;


-- ===== customer store credit (returns / manual credit) =====
-- invoice168 — customer store credit (returns / overpayments / goodwill)

-- 1) store-credit balance on each customer
alter table public.customers add column if not exists credit_balance numeric(15,2) not null default 0;

-- 2) credit memos
create table if not exists public.credits (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  credit_number text,
  credit_date   date not null default current_date,
  reason        text not null default 'return'
                check (reason in ('return','overpayment','goodwill','adjustment')),
  amount        numeric(15,2) not null default 0,
  restock       boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_credits_company on public.credits(company_id);
create index if not exists idx_credits_customer on public.credits(customer_id);

-- 3) credit line items (for returns)
create table if not exists public.credit_items (
  id          uuid primary key default gen_random_uuid(),
  credit_id   uuid not null references public.credits(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text,
  quantity    numeric(15,3) not null default 1,
  unit_price  numeric(15,2) not null default 0,
  line_total  numeric(15,2) not null default 0
);
create index if not exists idx_credit_items_credit on public.credit_items(credit_id);

-- 4) allow store-credit as a payment method
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('cash','card','bank_transfer','check','other','credit'));

-- 5) RLS
alter table public.credits enable row level security;
alter table public.credit_items enable row level security;
do $$ begin
  drop policy if exists credits_all on public.credits;
  create policy credits_all on public.credits for all
    using (company_id = public.current_company_id())
    with check (company_id = public.current_company_id());
  drop policy if exists credits_admin on public.credits;
  create policy credits_admin on public.credits for all
    using (public.is_super_admin()) with check (public.is_super_admin());

  drop policy if exists credit_items_all on public.credit_items;
  create policy credit_items_all on public.credit_items for all
    using (exists (select 1 from public.credits c where c.id = credit_items.credit_id and c.company_id = public.current_company_id()))
    with check (exists (select 1 from public.credits c where c.id = credit_items.credit_id and c.company_id = public.current_company_id()));
  drop policy if exists credit_items_admin on public.credit_items;
  create policy credit_items_admin on public.credit_items for all
    using (public.is_super_admin()) with check (public.is_super_admin());
end $$;


-- ===== payment note (e.g. Deposit) =====
alter table public.payments add column if not exists note text;


-- ===== packaging: units per box (CTN) =====
alter table public.products       add column if not exists units_per_ctn integer;
alter table public.invoice_items  add column if not exists ctn_qty       numeric(12,2);
alter table public.invoice_items  add column if not exists units_per_ctn integer;
alter table public.estimate_items add column if not exists ctn_qty       numeric(12,2);
alter table public.estimate_items add column if not exists units_per_ctn integer;
