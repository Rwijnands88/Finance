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
