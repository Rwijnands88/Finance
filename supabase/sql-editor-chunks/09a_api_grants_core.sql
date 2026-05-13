grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.households to authenticated;
grant select, insert, update, delete on table public.household_members to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.recurring_expenses to authenticated;
grant select, insert, update, delete on table public.fixed_expense_instances to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.fuel_details to authenticated;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_fixed_instances_for_month(uuid, date) to authenticated;
grant execute on function public.seed_default_household_data(uuid) to authenticated;
grant execute on function public.bootstrap_household(text, text) to authenticated;
grant execute on function public.confirm_fixed_expense_instance(uuid, numeric, text) to authenticated;
