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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recurring_expenses_touch_updated_at
before update on public.recurring_expenses
for each row execute function public.touch_updated_at();

create trigger fixed_instances_touch_updated_at
before update on public.fixed_expense_instances
for each row execute function public.touch_updated_at();

create trigger transactions_touch_updated_at
before update on public.transactions
for each row execute function public.touch_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members members
    where members.household_id = target_household_id
      and members.user_id = auth.uid()
  );
$$;

create or replace function public.create_fixed_instances_for_month(
  target_household_id uuid,
  target_month date
)
returns setof public.fixed_expense_instances
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_month date := date_trunc('month', target_month)::date;
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Not a member of this household';
  end if;

  insert into public.fixed_expense_instances (
    household_id,
    recurring_expense_id,
    month,
    name_snapshot,
    category_id,
    amount_snapshot
  )
  select
    recurring.household_id,
    recurring.id,
    normalized_month,
    recurring.name,
    recurring.category_id,
    recurring.current_amount
  from public.recurring_expenses recurring
  where recurring.household_id = target_household_id
    and recurring.is_active
    and date_trunc('month', recurring.starts_on)::date <= normalized_month
    and (
      recurring.ends_on is null
      or date_trunc('month', recurring.ends_on)::date >= normalized_month
    )
  on conflict (recurring_expense_id, month) do nothing;

  return query
  select *
  from public.fixed_expense_instances instances
  where instances.household_id = target_household_id
    and instances.month = normalized_month
  order by instances.name_snapshot;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.vehicles enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.fixed_expense_instances enable row level security;
alter table public.transactions enable row level security;
alter table public.fuel_details enable row level security;

create policy "profiles can read household members"
on public.profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.household_members mine
    join public.household_members theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy "profiles can insert themselves"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles can update themselves"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read households"
on public.households for select
using (public.is_household_member(id));

create policy "authenticated users can create households"
on public.households for insert
to authenticated
with check (true);

create policy "members can update households"
on public.households for update
using (public.is_household_member(id))
with check (public.is_household_member(id));

create policy "members can read memberships"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "members can manage memberships"
on public.household_members for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read categories"
on public.categories for select
using (public.is_household_member(household_id));

create policy "members can manage categories"
on public.categories for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read vehicles"
on public.vehicles for select
using (public.is_household_member(household_id));

create policy "members can manage vehicles"
on public.vehicles for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read recurring expenses"
on public.recurring_expenses for select
using (public.is_household_member(household_id));

create policy "members can manage recurring expenses"
on public.recurring_expenses for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read fixed instances"
on public.fixed_expense_instances for select
using (public.is_household_member(household_id));

create policy "members can manage fixed instances"
on public.fixed_expense_instances for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read transactions"
on public.transactions for select
using (public.is_household_member(household_id));

create policy "members can manage transactions"
on public.transactions for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read fuel details"
on public.fuel_details for select
using (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and public.is_household_member(transactions.household_id)
  )
);

create policy "members can manage fuel details"
on public.fuel_details for all
using (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and public.is_household_member(transactions.household_id)
  )
)
with check (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and public.is_household_member(transactions.household_id)
  )
);
