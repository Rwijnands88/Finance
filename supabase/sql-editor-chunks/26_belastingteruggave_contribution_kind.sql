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

grant select on table public.monthly_contribution_kind_totals to authenticated;
