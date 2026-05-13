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
  transactions.entered_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.profiles on profiles.id = transactions.entered_by
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.entered_by,
  profiles.display_name;
