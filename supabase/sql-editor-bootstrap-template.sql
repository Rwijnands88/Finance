-- Run this in the Supabase SQL Editor after:
-- 1. both migration files have succeeded
-- 2. Ralph and Dorine have been created under Authentication > Users
--
-- Replace the two UUID placeholders below with the IDs from Auth > Users.

do $$
declare
  household_id uuid;
  ralph_user_id uuid := 'RALPH_AUTH_USER_ID'::uuid;
  dorine_user_id uuid := 'DORINE_AUTH_USER_ID'::uuid;
begin
  insert into public.profiles (id, display_name)
  values
    (ralph_user_id, 'Ralph'),
    (dorine_user_id, 'Dorine')
  on conflict (id) do update
    set display_name = excluded.display_name;

  insert into public.households (name)
  values ('Ralph & Dorine')
  returning id into household_id;

  insert into public.household_members (household_id, user_id, role)
  values
    (household_id, ralph_user_id, 'member'),
    (household_id, dorine_user_id, 'member')
  on conflict do nothing;

  insert into public.categories (household_id, name, kind, color, sort_order)
  values
    (household_id, 'Hypotheek', 'fixed', '#6366F1', 10),
    (household_id, 'Internet', 'fixed', '#818CF8', 20),
    (household_id, 'Water', 'fixed', '#22D3EE', 30),
    (household_id, 'Elektra', 'fixed', '#06B6D4', 40),
    (household_id, 'Abonnementen', 'fixed', '#A78BFA', 50),
    (household_id, 'Kinderopvang', 'fixed', '#F59E0B', 60),
    (household_id, 'BSO', 'fixed', '#FBBF24', 70),
    (household_id, 'Verzekeringen', 'fixed', '#F97316', 80),
    (household_id, 'Telefoon', 'fixed', '#C084FC', 90),
    (household_id, 'TV', 'fixed', '#8B5CF6', 100),
    (household_id, 'Belasting', 'fixed', '#64748B', 110),
    (household_id, 'Boodschappen', 'variable', '#10B981', 120),
    (household_id, 'Tanken', 'variable', '#38BDF8', 130),
    (household_id, 'Overig', 'variable', '#EF4444', 140)
  on conflict do nothing;

  insert into public.vehicles (household_id, name)
  values (household_id, 'Gezinsauto')
  on conflict do nothing;

  raise notice 'Created household %', household_id;
end $$;
