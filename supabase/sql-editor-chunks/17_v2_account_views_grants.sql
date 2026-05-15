create or replace function public.seed_default_accounts(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Not a member of this household';
  end if;

  insert into public.accounts (household_id, name, kind, sort_order)
  values (target_household_id, 'Gezamenlijke rekening', 'shared', 10)
  on conflict (household_id, name) do update
    set kind = 'shared', owner_user_id = null, is_active = true;

  insert into public.accounts (household_id, name, kind, owner_user_id, sort_order)
  select
    members.household_id,
    profiles.display_name || ' prive',
    'personal',
    members.user_id,
    100 + row_number() over (partition by members.household_id order by profiles.display_name)::integer
  from public.household_members members
  join public.profiles profiles on profiles.id = members.user_id
  where members.household_id = target_household_id
  on conflict (household_id, name) do update
    set kind = 'personal', owner_user_id = excluded.owner_user_id, is_active = true;
end;
$$;

create or replace view public.monthly_account_category_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  accounts.name as account_name,
  accounts.kind as account_kind,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.category_id,
  categories.name as category_name,
  categories.kind as category_kind,
  categories.color as category_color,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.categories on categories.id = transactions.category_id
group by
  transactions.household_id, transactions.account_id, accounts.name,
  accounts.kind, date_trunc('month', transactions.transaction_date)::date,
  transactions.category_id, categories.name, categories.kind, categories.color;

create or replace view public.monthly_account_person_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  transactions.account_id,
  accounts.name as account_name,
  accounts.kind as account_kind,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.entered_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.accounts on accounts.id = transactions.account_id
join public.profiles on profiles.id = transactions.entered_by
group by
  transactions.household_id, transactions.account_id, accounts.name,
  accounts.kind, date_trunc('month', transactions.transaction_date)::date,
  transactions.entered_by, profiles.display_name;

grant select, insert, update, delete on table public.accounts to authenticated;
grant select on table public.monthly_account_category_totals to authenticated;
grant select on table public.monthly_account_person_totals to authenticated;
grant execute on function public.can_access_account(uuid) to authenticated;
grant execute on function public.seed_default_accounts(uuid) to authenticated;
