drop view if exists public.monthly_person_totals;
create view public.monthly_person_totals
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

drop view if exists public.monthly_account_person_totals;
create view public.monthly_account_person_totals
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

grant select on table public.monthly_person_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
