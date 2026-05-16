alter table public.transactions
drop constraint if exists transactions_type_check;

alter table public.transactions
add constraint transactions_type_check
check (type in ('fixed', 'variable', 'contribution', 'income'));

create table if not exists public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric(12, 2) not null,
  snapshot_date date not null,
  note text,
  entered_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists account_balance_snapshots_account_date_idx
on public.account_balance_snapshots(account_id, snapshot_date desc, created_at desc);

alter table public.account_balance_snapshots enable row level security;

drop policy if exists "members can read balance snapshots" on public.account_balance_snapshots;
create policy "members can read balance snapshots"
on public.account_balance_snapshots for select
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
);

drop policy if exists "members can manage balance snapshots" on public.account_balance_snapshots;
create policy "members can manage balance snapshots"
on public.account_balance_snapshots for all
using (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
)
with check (
  public.is_household_member(household_id)
  and public.can_access_account(account_id)
  and entered_by = auth.uid()
);

grant select, insert, update, delete on table public.account_balance_snapshots to authenticated;
