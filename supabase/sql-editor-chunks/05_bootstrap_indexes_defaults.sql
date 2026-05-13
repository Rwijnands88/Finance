create unique index if not exists categories_household_name_unique_idx
on public.categories(household_id, name);

create unique index if not exists vehicles_household_name_unique_idx
on public.vehicles(household_id, name);

create unique index if not exists transactions_fixed_instance_unique_idx
on public.transactions(fixed_expense_instance_id)
where fixed_expense_instance_id is not null;

create or replace function public.seed_default_household_data(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Not a member of this household';
  end if;

  insert into public.categories (household_id, name, kind, color, sort_order)
  values
    (target_household_id, 'Hypotheek', 'fixed', '#6366F1', 10),
    (target_household_id, 'Internet', 'fixed', '#818CF8', 20),
    (target_household_id, 'Water', 'fixed', '#22D3EE', 30),
    (target_household_id, 'Elektra', 'fixed', '#06B6D4', 40),
    (target_household_id, 'Abonnementen', 'fixed', '#A78BFA', 50),
    (target_household_id, 'Kinderopvang', 'fixed', '#F59E0B', 60),
    (target_household_id, 'BSO', 'fixed', '#FBBF24', 70),
    (target_household_id, 'Verzekeringen', 'fixed', '#F97316', 80),
    (target_household_id, 'Telefoon', 'fixed', '#C084FC', 90),
    (target_household_id, 'TV', 'fixed', '#8B5CF6', 100),
    (target_household_id, 'Belasting', 'fixed', '#64748B', 110),
    (target_household_id, 'Boodschappen', 'variable', '#10B981', 120),
    (target_household_id, 'Tanken', 'variable', '#38BDF8', 130),
    (target_household_id, 'Overig', 'variable', '#EF4444', 140)
  on conflict do nothing;

  insert into public.vehicles (household_id, name)
  values (target_household_id, 'Gezinsauto')
  on conflict do nothing;
end;
$$;

create or replace function public.bootstrap_household(
  display_name text,
  household_name text default 'Ralph & Dorine'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), trim(display_name))
  on conflict (id) do update
    set display_name = excluded.display_name;

  insert into public.households (name)
  values (trim(household_name))
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (created_household_id, auth.uid(), 'member');

  perform public.seed_default_household_data(created_household_id);

  return created_household_id;
end;
$$;
