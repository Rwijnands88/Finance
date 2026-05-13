alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.vehicles enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.fixed_expense_instances enable row level security;
alter table public.transactions enable row level security;
alter table public.fuel_details enable row level security;

create policy "profiles can read household members"
on public.profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.household_members mine
    join public.household_members theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
  )
);

create policy "profiles can insert themselves"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles can update themselves"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read households"
on public.households for select
using (public.is_household_member(id));

create policy "authenticated users can create households"
on public.households for insert
to authenticated
with check (true);

create policy "members can update households"
on public.households for update
using (public.is_household_member(id))
with check (public.is_household_member(id));

create policy "members can read memberships"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "members can manage memberships"
on public.household_members for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read categories"
on public.categories for select
using (public.is_household_member(household_id));

create policy "members can manage categories"
on public.categories for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "members can read vehicles"
on public.vehicles for select
using (public.is_household_member(household_id));

create policy "members can manage vehicles"
on public.vehicles for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
