begin;

-- Keep the app reachable for authenticated users, but remove accidental public
-- policy scope and broad table privileges that are not needed by the Finance App.

alter policy "profiles can read household members"
on public.profiles to authenticated;

alter policy "profiles can insert themselves"
on public.profiles to authenticated;

alter policy "profiles can update themselves"
on public.profiles to authenticated;

alter policy "members can read households"
on public.households to authenticated;

alter policy "members can update households"
on public.households to authenticated;

alter policy "members can read memberships"
on public.household_members to authenticated;

alter policy "members can manage memberships"
on public.household_members to authenticated;

alter policy "members can read categories"
on public.categories to authenticated;

alter policy "members can manage categories"
on public.categories to authenticated;

alter policy "members can read vehicles"
on public.vehicles to authenticated;

alter policy "members can manage vehicles"
on public.vehicles to authenticated;

alter policy "members can read accounts"
on public.accounts to authenticated;

alter policy "members can manage accounts"
on public.accounts to authenticated;

alter policy "members can read recurring expenses"
on public.recurring_expenses to authenticated;

alter policy "members can manage recurring expenses"
on public.recurring_expenses to authenticated;

alter policy "members can read fixed instances"
on public.fixed_expense_instances to authenticated;

alter policy "members can manage fixed instances"
on public.fixed_expense_instances to authenticated;

alter policy "members can read transactions"
on public.transactions to authenticated;

alter policy "members can manage transactions"
on public.transactions to authenticated;

alter policy "members can read fuel details"
on public.fuel_details to authenticated;

alter policy "members can manage fuel details"
on public.fuel_details to authenticated;

alter policy "members can read contribution plans"
on public.contribution_plans to authenticated;

alter policy "members can manage contribution plans"
on public.contribution_plans to authenticated;

alter policy "members can read balance snapshots"
on public.account_balance_snapshots to authenticated;

alter policy "members can manage balance snapshots"
on public.account_balance_snapshots to authenticated;

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.households from anon;
revoke all privileges on table public.household_members from anon;
revoke all privileges on table public.categories from anon;
revoke all privileges on table public.vehicles from anon;
revoke all privileges on table public.recurring_expenses from anon;
revoke all privileges on table public.fixed_expense_instances from anon;
revoke all privileges on table public.transactions from anon;
revoke all privileges on table public.fuel_details from anon;
revoke all privileges on table public.accounts from anon;
revoke all privileges on table public.contribution_plans from anon;
revoke all privileges on table public.account_balance_snapshots from anon;
revoke all privileges on table public.monthly_category_totals from anon;
revoke all privileges on table public.monthly_person_totals from anon;
revoke all privileges on table public.monthly_account_category_totals from anon;
revoke all privileges on table public.monthly_account_person_totals from anon;
revoke all privileges on table public.monthly_contribution_kind_totals from anon;

revoke truncate, trigger, references on table public.profiles from authenticated;
revoke truncate, trigger, references on table public.households from authenticated;
revoke truncate, trigger, references on table public.household_members from authenticated;
revoke truncate, trigger, references on table public.categories from authenticated;
revoke truncate, trigger, references on table public.vehicles from authenticated;
revoke truncate, trigger, references on table public.recurring_expenses from authenticated;
revoke truncate, trigger, references on table public.fixed_expense_instances from authenticated;
revoke truncate, trigger, references on table public.transactions from authenticated;
revoke truncate, trigger, references on table public.fuel_details from authenticated;
revoke truncate, trigger, references on table public.accounts from authenticated;
revoke truncate, trigger, references on table public.contribution_plans from authenticated;
revoke truncate, trigger, references on table public.account_balance_snapshots from authenticated;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.households to authenticated;
grant select, insert, update, delete on table public.household_members to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.recurring_expenses to authenticated;
grant select, insert, update, delete on table public.fixed_expense_instances to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.fuel_details to authenticated;
grant select, insert, update, delete on table public.accounts to authenticated;
grant select, insert, update, delete on table public.contribution_plans to authenticated;
grant select, insert, update, delete on table public.account_balance_snapshots to authenticated;

grant select on table public.monthly_category_totals to authenticated;
grant select on table public.monthly_person_totals to authenticated;
grant select on table public.monthly_account_category_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
grant select on table public.monthly_contribution_kind_totals to authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.can_access_account(uuid) to authenticated;
grant execute on function public.create_fixed_instances_for_month(uuid, date) to authenticated;
grant execute on function public.seed_default_household_data(uuid) to authenticated;
grant execute on function public.seed_default_accounts(uuid) to authenticated;
grant execute on function public.bootstrap_household(text, text) to authenticated;
grant execute on function public.confirm_fixed_expense_instance(uuid, numeric, text) to authenticated;

commit;
