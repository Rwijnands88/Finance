begin;

-- Align the formal migration history with the schema that is already used by
-- the live Finance App. This migration is intentionally idempotent so it is
-- safe on databases where the SQL-editor chunks were already applied manually.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'contribution_kind'
  ) then
    alter table public.transactions
    add column contribution_kind text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'paid_by'
  ) then
    alter table public.transactions
    add column paid_by uuid references public.profiles(id) default auth.uid();
  end if;
end $$;

update public.transactions
set paid_by = entered_by
where paid_by is null;

create index if not exists transactions_paid_by_idx
on public.transactions(paid_by);

alter table public.transactions
drop constraint if exists transactions_type_check;

alter table public.transactions
add constraint transactions_type_check
check (type in ('fixed', 'variable', 'contribution', 'income', 'sparen'));

alter table public.transactions
drop constraint if exists transactions_contribution_kind_check;

alter table public.transactions
add constraint transactions_contribution_kind_check
check (
  contribution_kind is null
  or (
    type = 'contribution'
    and contribution_kind in ('planned', 'extra', 'belastingteruggave')
  )
);

create table if not exists public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric(12, 2) not null,
  snapshot_date date not null,
  note text,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists account_balance_snapshots_account_date_idx
on public.account_balance_snapshots(account_id, snapshot_date desc, created_at desc);

alter table public.account_balance_snapshots enable row level security;

drop policy if exists "members can read balance snapshots" on public.account_balance_snapshots;
create policy "members can read balance snapshots"
on public.account_balance_snapshots for select
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
);

drop policy if exists "members can manage balance snapshots" on public.account_balance_snapshots;
create policy "members can manage balance snapshots"
on public.account_balance_snapshots for all
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
)
with check (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
  and entered_by = auth.uid()
);

grant select, insert, update, delete on table public.account_balance_snapshots to authenticated;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contribution_plans'
      and column_name = 'label'
  ) then
    alter table public.contribution_plans
    add column label text;
  end if;
end $$;

update public.contribution_plans
set label = 'Reguliere storting'
where label is null or btrim(label) = '';

alter table public.contribution_plans
alter column label set default 'Reguliere storting';

alter table public.contribution_plans
alter column label set not null;

drop index if exists contribution_plans_household_account_user_idx;

create index if not exists contribution_plans_household_account_user_idx
on public.contribution_plans(household_id, account_id, user_id)
where is_active;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_person_totals'
      and column_name = 'entered_by'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_person_totals'
      and column_name = 'paid_by'
  ) then
    alter view public.monthly_person_totals rename column entered_by to paid_by;
  end if;
end $$;

create or replace view public.monthly_person_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date as month,
  coalesce(transactions.paid_by, transactions.entered_by) as paid_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.profiles
  on profiles.id = coalesce(transactions.paid_by, transactions.entered_by)
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  coalesce(transactions.paid_by, transactions.entered_by),
  profiles.display_name;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_account_person_totals'
      and column_name = 'entered_by'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_account_person_totals'
      and column_name = 'paid_by'
  ) then
    alter view public.monthly_account_person_totals rename column entered_by to paid_by;
  end if;
end $$;

create or replace view public.monthly_account_person_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  accounts.name as account_name,
  accounts.kind as account_kind,
  date_trunc('month', transactions.transaction_date)::date as month,
  coalesce(transactions.paid_by, transactions.entered_by) as paid_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.profiles
  on profiles.id = coalesce(transactions.paid_by, transactions.entered_by)
group by
  transactions.household_id,
  transactions.account_id,
  accounts.name,
  accounts.kind,
  date_trunc('month', transactions.transaction_date)::date,
  coalesce(transactions.paid_by, transactions.entered_by),
  profiles.display_name;

create or replace view public.monthly_contribution_kind_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  date_trunc('month', transactions.transaction_date)::date as month,
  coalesce(transactions.contribution_kind, 'unknown') as contribution_kind,
  coalesce(transactions.paid_by, transactions.entered_by) as paid_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.profiles
  on profiles.id = coalesce(transactions.paid_by, transactions.entered_by)
where transactions.type = 'contribution'
group by
  transactions.household_id,
  transactions.account_id,
  date_trunc('month', transactions.transaction_date)::date,
  coalesce(transactions.contribution_kind, 'unknown'),
  coalesce(transactions.paid_by, transactions.entered_by),
  profiles.display_name;

grant select on table public.monthly_person_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
grant select on table public.monthly_contribution_kind_totals to authenticated;
grant select, insert, update, delete on table public.contribution_plans to authenticated;

commit;
