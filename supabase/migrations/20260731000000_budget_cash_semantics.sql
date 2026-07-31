-- Budget/kas-semantiek, verrekeningen, werkelijke vaste-lastendatum en maandaansluiting.

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (
    type in (
      'fixed',
      'variable',
      'contribution',
      'income',
      'sparen',
      'prepaid',
      'settlement'
    )
  );

alter table public.transactions
  add column if not exists settlement_direction text;

update public.transactions
set settlement_direction = null
where type <> 'settlement'
  and settlement_direction is not null;

alter table public.transactions
  drop constraint if exists transactions_settlement_direction_check;

alter table public.transactions
  add constraint transactions_settlement_direction_check
  check (
    (
      type = 'settlement'
      and settlement_direction in ('in', 'out')
    )
    or (
      type <> 'settlement'
      and settlement_direction is null
    )
  );

comment on column public.transactions.settlement_direction is
  'Richting relatief aan transactions.account_id: in = geld komt op deze rekening bij, out = geld gaat van deze rekening af.';

alter table public.fixed_expense_instances
  add column if not exists actual_date date;

alter table public.fixed_expense_instances
  drop constraint if exists fixed_expense_instances_status_check;

update public.fixed_expense_instances
set status = case status
  when 'pending' then 'open'
  when 'adjusted' then 'confirmed'
  else status
end
where status in ('pending', 'adjusted');

alter table public.fixed_expense_instances
  alter column status set default 'open';

alter table public.fixed_expense_instances
  add constraint fixed_expense_instances_status_check
  check (status in ('open', 'confirmed', 'skipped'));

comment on column public.fixed_expense_instances.status is
  'Zakelijke status: open = verwacht/nog niet bevestigd, confirmed = bevestigd, skipped = overgeslagen.';

comment on column public.fixed_expense_instances.actual_date is
  'Werkelijke afschrijfdatum van de vaste last; null zolang de instance open staat.';

create or replace function public.fixed_expense_due_date(
  target_month date,
  target_billing_day integer
)
returns date
language sql
stable
set search_path = public
as $$
  select make_date(
    extract(year from target_month)::integer,
    extract(month from target_month)::integer,
    least(
      greatest(coalesce(target_billing_day, 1), 1),
      extract(
        day from (
          date_trunc('month', target_month)::date
          + interval '1 month - 1 day'
        )
      )::integer
    )
  );
$$;

create or replace function public.confirm_fixed_expense_instance(
  target_instance_id uuid,
  target_amount numeric(12, 2) default null,
  target_actual_date date default null,
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
  resolved_amount numeric(12, 2);
  resolved_actual_date date;
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

  if instance_record.status not in ('open', 'pending') then
    raise exception 'Fixed expense instance is already processed';
  end if;

  resolved_amount := coalesce(target_amount, instance_record.amount_snapshot);
  resolved_actual_date := coalesce(
    target_actual_date,
    public.fixed_expense_due_date(instance_record.month, recurring_record.billing_day)
  );

  update public.fixed_expense_instances
  set
    amount_snapshot = resolved_amount,
    actual_date = resolved_actual_date,
    status = 'confirmed',
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
    resolved_actual_date,
    'fixed',
    coalesce(target_note, 'Automatisch terugkerend'),
    auth.uid()
  )
  on conflict (fixed_expense_instance_id)
  where fixed_expense_instance_id is not null
  do update
  set
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    note = excluded.note,
    updated_at = now()
  returning * into confirmed_transaction;

  return confirmed_transaction;
end;
$$;

create table if not exists public.month_reconciliations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  month date not null,
  actual_balance numeric(12, 2) not null,
  checked_at timestamptz not null default now(),
  note text,
  entered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint month_reconciliations_month_start_check
    check (date_trunc('month', month)::date = month)
);

create unique index if not exists month_reconciliations_account_month_key
  on public.month_reconciliations(account_id, month);

drop trigger if exists month_reconciliations_touch_updated_at
  on public.month_reconciliations;

create trigger month_reconciliations_touch_updated_at
before update on public.month_reconciliations
for each row execute function public.touch_updated_at();

alter table public.month_reconciliations enable row level security;

drop policy if exists "members can read month reconciliations"
  on public.month_reconciliations;
create policy "members can read month reconciliations"
on public.month_reconciliations for select
to authenticated
using (public.can_access_account(account_id));

drop policy if exists "members can manage month reconciliations"
  on public.month_reconciliations;
create policy "members can manage month reconciliations"
on public.month_reconciliations for all
to authenticated
using (public.can_access_account(account_id))
with check (
  public.can_access_account(account_id)
  and entered_by = auth.uid()
);

grant select, insert, update, delete
  on table public.month_reconciliations
  to authenticated;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reconciliation_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_touch_updated_at
  on public.user_settings;

create trigger user_settings_touch_updated_at
before update on public.user_settings
for each row execute function public.touch_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "users can read own settings"
  on public.user_settings;
create policy "users can read own settings"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert own settings"
  on public.user_settings;
create policy "users can insert own settings"
on public.user_settings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own settings"
  on public.user_settings;
create policy "users can update own settings"
on public.user_settings for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update
  on table public.user_settings
  to authenticated;

create or replace view public.monthly_category_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.category_id,
  categories.name as category_name,
  categories.kind as category_kind,
  categories.color as category_color,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.categories on categories.id = transactions.category_id
where transactions.type in ('fixed', 'variable', 'sparen', 'prepaid')
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.category_id,
  categories.name,
  categories.kind,
  categories.color;

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
where transactions.type in ('fixed', 'variable', 'sparen', 'prepaid')
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  coalesce(transactions.paid_by, transactions.entered_by),
  profiles.display_name;

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
where transactions.type in ('fixed', 'variable', 'sparen', 'prepaid')
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
  coalesce(transactions.paid_by, transactions.entered_by) as paid_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.profiles
  on profiles.id = coalesce(transactions.paid_by, transactions.entered_by)
where transactions.type in ('fixed', 'variable', 'sparen', 'prepaid')
group by
  transactions.household_id,
  transactions.account_id,
  accounts.name,
  accounts.kind,
  date_trunc('month', transactions.transaction_date)::date,
  coalesce(transactions.paid_by, transactions.entered_by),
  profiles.display_name;

revoke all privileges on table public.monthly_category_totals from anon;
revoke all privileges on table public.monthly_person_totals from anon;
revoke all privileges on table public.monthly_account_category_totals from anon;
revoke all privileges on table public.monthly_account_person_totals from anon;

grant select on table public.monthly_category_totals to authenticated;
grant select on table public.monthly_person_totals to authenticated;
grant select on table public.monthly_account_category_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
