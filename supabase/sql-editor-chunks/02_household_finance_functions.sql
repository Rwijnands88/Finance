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
