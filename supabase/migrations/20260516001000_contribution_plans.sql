create table if not exists public.contribution_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  monthly_amount numeric(12, 2) not null default 0 check (monthly_amount >= 0),
  deposit_day integer not null default 1 check (deposit_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contribution_plans_household_account_user_idx
on public.contribution_plans(household_id, account_id, user_id);

create index if not exists contribution_plans_household_account_idx
on public.contribution_plans(household_id, account_id)
where is_active;

drop trigger if exists contribution_plans_touch_updated_at on public.contribution_plans;
create trigger contribution_plans_touch_updated_at
before update on public.contribution_plans
for each row execute function public.touch_updated_at();

alter table public.contribution_plans enable row level security;

drop policy if exists "members can read contribution plans" on public.contribution_plans;
create policy "members can read contribution plans"
on public.contribution_plans for select
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
);

drop policy if exists "members can manage contribution plans" on public.contribution_plans;
create policy "members can manage contribution plans"
on public.contribution_plans for all
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
)
with check (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
);

insert into public.contribution_plans (
  household_id,
  account_id,
  user_id,
  monthly_amount,
  deposit_day
)
select
  members.household_id,
  accounts.id,
  members.user_id,
  0,
  1
from public.household_members members
join public.accounts accounts
  on accounts.household_id = members.household_id
  and accounts.kind = 'shared'
  and accounts.is_active
on conflict (household_id, account_id, user_id) do nothing;

grant select, insert, update, delete on table public.contribution_plans to authenticated;
