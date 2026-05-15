begin;

do $$
begin
  alter table public.recurring_expenses
    add column billing_day integer;
exception
  when duplicate_column then null;
end $$;

update public.recurring_expenses
set billing_day = extract(day from starts_on)::integer
where billing_day is null;

update public.recurring_expenses
set billing_day = 1
where billing_day is null;

do $$
begin
  alter table public.recurring_expenses
    alter column billing_day set default 1;
exception
  when undefined_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    alter column billing_day set not null;
exception
  when undefined_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add constraint recurring_expenses_billing_day_check
    check (billing_day between 1 and 31);
exception
  when duplicate_object then null;
end $$;

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
  join public.recurring_expenses recurring
    on recurring.id = instances.recurring_expense_id
  where instances.household_id = target_household_id
    and instances.month = normalized_month
  order by recurring.billing_day, instances.name_snapshot;
end;
$$;

commit;
