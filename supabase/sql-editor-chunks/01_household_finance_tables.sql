create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('fixed', 'variable', 'both')),
  color text not null default '#6366F1',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category_id uuid not null references public.categories(id),
  current_amount numeric(12, 2) not null check (current_amount >= 0),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.fixed_expense_instances (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recurring_expense_id uuid not null references public.recurring_expenses(id) on delete cascade,
  month date not null,
  name_snapshot text not null,
  category_id uuid not null references public.categories(id),
  amount_snapshot numeric(12, 2) not null check (amount_snapshot >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'adjusted', 'skipped')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recurring_expense_id, month),
  check (date_trunc('month', month)::date = month)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  fixed_expense_instance_id uuid references public.fixed_expense_instances(id) on delete set null,
  category_id uuid not null references public.categories(id),
  amount numeric(12, 2) not null check (amount >= 0),
  transaction_date date not null,
  type text not null check (type in ('fixed', 'variable')),
  note text,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fuel_details (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id),
  liters numeric(8, 2) not null check (liters > 0)
);

create index categories_household_idx on public.categories(household_id);
create index recurring_expenses_household_idx on public.recurring_expenses(household_id);
create index fixed_instances_household_month_idx on public.fixed_expense_instances(household_id, month);
create index transactions_household_date_idx on public.transactions(household_id, transaction_date desc);
create index transactions_entered_by_idx on public.transactions(entered_by);
