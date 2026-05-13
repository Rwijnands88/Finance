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
