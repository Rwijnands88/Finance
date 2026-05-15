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
