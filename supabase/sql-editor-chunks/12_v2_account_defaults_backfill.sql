create or replace function public.ensure_household_shared_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (household_id, name, kind, sort_order)
  values (new.id, 'Gezamenlijke rekening', 'shared', 10)
  on conflict (household_id, name) do update
    set
      kind = 'shared',
      owner_user_id = null,
      is_active = true,
      sort_order = excluded.sort_order;

  return new;
end;
$$;

create or replace function public.ensure_member_personal_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
begin
  select display_name
  into profile_name
  from public.profiles
  where id = new.user_id;

  insert into public.accounts (
    household_id,
    name,
    kind,
    owner_user_id,
    sort_order
  )
  values (
    new.household_id,
    coalesce(nullif(trim(profile_name), ''), 'Persoon') || ' prive',
    'personal',
    new.user_id,
    100
  )
  on conflict (household_id, name) do update
    set
      kind = 'personal',
      owner_user_id = excluded.owner_user_id,
      is_active = true;

  return new;
end;
$$;

drop trigger if exists households_ensure_shared_account on public.households;
create trigger households_ensure_shared_account
after insert on public.households
for each row execute function public.ensure_household_shared_account();

drop trigger if exists household_members_ensure_personal_account on public.household_members;
create trigger household_members_ensure_personal_account
after insert on public.household_members
for each row execute function public.ensure_member_personal_account();

insert into public.accounts (household_id, name, kind, sort_order)
select households.id, 'Gezamenlijke rekening', 'shared', 10
from public.households
on conflict (household_id, name) do update
  set
    kind = 'shared',
    owner_user_id = null,
    is_active = true,
    sort_order = excluded.sort_order;

insert into public.accounts (household_id, name, kind, owner_user_id, sort_order)
select
  members.household_id,
  profiles.display_name || ' prive',
  'personal',
  members.user_id,
  100 + row_number() over (
    partition by members.household_id
    order by profiles.display_name
  )::integer
from public.household_members members
join public.profiles profiles on profiles.id = members.user_id
on conflict (household_id, name) do update
  set
    kind = 'personal',
    owner_user_id = excluded.owner_user_id,
    is_active = true;
