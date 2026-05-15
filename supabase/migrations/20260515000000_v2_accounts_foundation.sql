begin;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('shared', 'personal')),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  opening_balance numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'shared' and owner_user_id is null)
    or (kind = 'personal' and owner_user_id is not null)
  )
);

create unique index if not exists accounts_household_name_unique_idx
on public.accounts(household_id, name);

create index if not exists accounts_household_idx
on public.accounts(household_id, sort_order);

create index if not exists accounts_owner_idx
on public.accounts(owner_user_id)
where owner_user_id is not null;

drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at
before update on public.accounts
for each row execute function public.touch_updated_at();

alter table public.accounts enable row level security;

create or replace function public.can_access_account(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts accounts
    where accounts.id = target_account_id
      and accounts.is_active
      and (
        (
          accounts.kind = 'shared'
          and public.is_household_member(accounts.household_id)
        )
        or (
          accounts.kind = 'personal'
          and accounts.owner_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.ensure_household_shared_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (household_id, name, kind, sort_order)
  values (new.id, 'Gezamenlijke rekening', 'shared', 10)
  on conflict (household_id, name) do update
    set
      kind = 'shared',
      owner_user_id = null,
      is_active = true,
      sort_order = excluded.sort_order;

  return new;
end;
$$;

create or replace function public.ensure_member_personal_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  select display_name
  into profile_name
  from public.profiles
  where id = new.user_id;

  insert into public.accounts (
    household_id,
    name,
    kind,
    owner_user_id,
    sort_order
  )
  values (
    new.household_id,
    coalesce(nullif(trim(profile_name), ''), 'Persoon') || ' prive',
    'personal',
    new.user_id,
    100
  )
  on conflict (household_id, name) do update
    set
      kind = 'personal',
      owner_user_id = excluded.owner_user_id,
      is_active = true;

  return new;
end;
$$;

drop trigger if exists households_ensure_shared_account on public.households;
create trigger households_ensure_shared_account
after insert on public.households
for each row execute function public.ensure_household_shared_account();

drop trigger if exists household_members_ensure_personal_account on public.household_members;
create trigger household_members_ensure_personal_account
after insert on public.household_members
for each row execute function public.ensure_member_personal_account();

insert into public.accounts (household_id, name, kind, sort_order)
select households.id, 'Gezamenlijke rekening', 'shared', 10
from public.households
on conflict (household_id, name) do update
  set
    kind = 'shared',
    owner_user_id = null,
    is_active = true,
    sort_order = excluded.sort_order;

insert into public.accounts (
  household_id,
  name,
  kind,
  owner_user_id,
  sort_order
)
select
  members.household_id,
  profiles.display_name || ' prive',
  'personal',
  members.user_id,
  100 + row_number() over (
    partition by members.household_id
    order by profiles.display_name
  )::integer
from public.household_members members
join public.profiles profiles on profiles.id = members.user_id
on conflict (household_id, name) do update
  set
    kind = 'personal',
    owner_user_id = excluded.owner_user_id,
    is_active = true;

do $$
begin
  alter table public.transactions
    add column account_id uuid;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.transactions
    add constraint transactions_account_id_fkey
    foreign key (account_id)
    references public.accounts(id)
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add column account_id uuid;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add constraint recurring_expenses_account_id_fkey
    foreign key (account_id)
    references public.accounts(id)
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

create index if not exists transactions_account_date_idx
on public.transactions(account_id, transaction_date desc)
where account_id is not null;

create index if not exists recurring_expenses_account_idx
on public.recurring_expenses(account_id)
where account_id is not null;

create or replace function public.assign_shared_account_when_missing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    select accounts.id
    into new.account_id
    from public.accounts accounts
    where accounts.household_id = new.household_id
      and accounts.kind = 'shared'
      and accounts.is_active
    order by accounts.sort_order, accounts.created_at
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_assign_shared_account on public.transactions;
create trigger transactions_assign_shared_account
before insert on public.transactions
for each row execute function public.assign_shared_account_when_missing();

drop trigger if exists recurring_expenses_assign_shared_account on public.recurring_expenses;
create trigger recurring_expenses_assign_shared_account
before insert on public.recurring_expenses
for each row execute function public.assign_shared_account_when_missing();

update public.transactions transactions
set account_id = accounts.id
from public.accounts accounts
where transactions.account_id is null
  and accounts.household_id = transactions.household_id
  and accounts.kind = 'shared';

update public.recurring_expenses recurring
set account_id = accounts.id
from public.accounts accounts
where recurring.account_id is null
  and accounts.household_id = recurring.household_id
  and accounts.kind = 'shared';

drop policy if exists "members can read accounts" on public.accounts;
create policy "members can read accounts"
on public.accounts for select
using (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
  )
  or owner_user_id = auth.uid()
);

drop policy if exists "members can manage accounts" on public.accounts;
create policy "members can manage accounts"
on public.accounts for all
using (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
  )
  or owner_user_id = auth.uid()
)
with check (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
    and owner_user_id is null
  )
  or (
    kind = 'personal'
    and owner_user_id = auth.uid()
  )
);

drop policy if exists "members can read recurring expenses" on public.recurring_expenses;
create policy "members can read recurring expenses"
on public.recurring_expenses for select
using (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
);

drop policy if exists "members can manage recurring expenses" on public.recurring_expenses;
create policy "members can manage recurring expenses"
on public.recurring_expenses for all
using (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
)
with check (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
);

drop policy if exists "members can read fixed instances" on public.fixed_expense_instances;
create policy "members can read fixed instances"
on public.fixed_expense_instances for select
using (
  exists (
    select 1
    from public.recurring_expenses recurring
    where recurring.id = fixed_expense_instances.recurring_expense_id
      and (
        (
          recurring.account_id is null
          and public.is_household_member(recurring.household_id)
        )
        or public.can_access_account(recurring.account_id)
      )
  )
);

drop policy if exists "members can manage fixed instances" on public.fixed_expense_instances;
create policy "members can manage fixed instances"
on public.fixed_expense_instances for all
using (
  exists (
    select 1
    from public.recurring_expenses recurring
    where recurring.id = fixed_expense_instances.recurring_expense_id
      and (
        (
          recurring.account_id is null
          and public.is_household_member(recurring.household_id)
        )
        or public.can_access_account(recurring.account_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.recurring_expenses recurring
    where recurring.id = fixed_expense_instances.recurring_expense_id
      and (
        (
          recurring.account_id is null
          and public.is_household_member(recurring.household_id)
        )
        or public.can_access_account(recurring.account_id)
      )
  )
);

drop policy if exists "members can read transactions" on public.transactions;
create policy "members can read transactions"
on public.transactions for select
using (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
);

drop policy if exists "members can manage transactions" on public.transactions;
create policy "members can manage transactions"
on public.transactions for all
using (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
)
with check (
  (
    account_id is null
    and public.is_household_member(household_id)
  )
  or public.can_access_account(account_id)
);

drop policy if exists "members can read fuel details" on public.fuel_details;
create policy "members can read fuel details"
on public.fuel_details for select
using (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);

drop policy if exists "members can manage fuel details" on public.fuel_details;
create policy "members can manage fuel details"
on public.fuel_details for all
using (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.transactions transactions
    where transactions.id = fuel_details.transaction_id
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);

create or replace function public.confirm_fixed_expense_instance(
  target_instance_id uuid,
  target_amount numeric(12, 2) default null,
  target_note text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  instance_record public.fixed_expense_instances;
  recurring_record public.recurring_expenses;
  confirmed_transaction public.transactions;
begin
  select *
  into instance_record
  from public.fixed_expense_instances
  where id = target_instance_id;

  if instance_record.id is null then
    raise exception 'Fixed expense instance not found';
  end if;

  select *
  into recurring_record
  from public.recurring_expenses
  where id = instance_record.recurring_expense_id;

  if recurring_record.id is null then
    raise exception 'Recurring expense not found';
  end if;

  if not (
    (
      recurring_record.account_id is null
      and public.is_household_member(instance_record.household_id)
    )
    or public.can_access_account(recurring_record.account_id)
  ) then
    raise exception 'Not allowed for this account';
  end if;

  update public.fixed_expense_instances
  set
    amount_snapshot = coalesce(target_amount, amount_snapshot),
    status = case when target_amount is null then 'confirmed' else 'adjusted' end,
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    note = target_note
  where id = target_instance_id
  returning * into instance_record;

  insert into public.transactions (
    household_id,
    account_id,
    fixed_expense_instance_id,
    category_id,
    amount,
    transaction_date,
    type,
    note,
    entered_by
  )
  values (
    instance_record.household_id,
    recurring_record.account_id,
    instance_record.id,
    instance_record.category_id,
    instance_record.amount_snapshot,
    instance_record.month,
    'fixed',
    coalesce(target_note, 'Automatisch terugkerend'),
    auth.uid()
  )
  on conflict do nothing
  returning * into confirmed_transaction;

  if confirmed_transaction.id is null then
    select *
    into confirmed_transaction
    from public.transactions
    where fixed_expense_instance_id = target_instance_id
    limit 1;
  end if;

  return confirmed_transaction;
end;
$$;

create or replace function public.seed_default_accounts(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Not a member of this household';
  end if;

  insert into public.accounts (household_id, name, kind, sort_order)
  values (target_household_id, 'Gezamenlijke rekening', 'shared', 10)
  on conflict (household_id, name) do update
    set
      kind = 'shared',
      owner_user_id = null,
      is_active = true,
      sort_order = excluded.sort_order;

  insert into public.accounts (
    household_id,
    name,
    kind,
    owner_user_id,
    sort_order
  )
  select
    members.household_id,
    profiles.display_name || ' prive',
    'personal',
    members.user_id,
    100 + row_number() over (
      partition by members.household_id
      order by profiles.display_name
    )::integer
  from public.household_members members
  join public.profiles profiles on profiles.id = members.user_id
  where members.household_id = target_household_id
  on conflict (household_id, name) do update
    set
      kind = 'personal',
      owner_user_id = excluded.owner_user_id,
      is_active = true;
end;
$$;

create or replace view public.monthly_account_category_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  accounts.name as account_name,
  accounts.kind as account_kind,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.category_id,
  categories.name as category_name,
  categories.kind as category_kind,
  categories.color as category_color,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.categories on categories.id = transactions.category_id
group by
  transactions.household_id,
  transactions.account_id,
  accounts.name,
  accounts.kind,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.category_id,
  categories.name,
  categories.kind,
  categories.color;

create or replace view public.monthly_account_person_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  accounts.name as account_name,
  accounts.kind as account_kind,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.entered_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.profiles on profiles.id = transactions.entered_by
group by
  transactions.household_id,
  transactions.account_id,
  accounts.name,
  accounts.kind,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.entered_by,
  profiles.display_name;

grant select, insert, update, delete on table public.accounts to authenticated;
grant select on table public.monthly_account_category_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
grant execute on function public.can_access_account(uuid) to authenticated;
grant execute on function public.seed_default_accounts(uuid) to authenticated;

commit;
