create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null check (kind in ('shared', 'personal')),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  opening_balance numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'shared' and owner_user_id is null)
    or (kind = 'personal' and owner_user_id is not null)
  )
);

create unique index if not exists accounts_household_name_unique_idx
on public.accounts(household_id, name);

create index if not exists accounts_household_idx
on public.accounts(household_id, sort_order);

create index if not exists accounts_owner_idx
on public.accounts(owner_user_id)
where owner_user_id is not null;

drop trigger if exists accounts_touch_updated_at on public.accounts;
create trigger accounts_touch_updated_at
before update on public.accounts
for each row execute function public.touch_updated_at();

alter table public.accounts enable row level security;

create or replace function public.can_access_account(target_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts accounts
    where accounts.id = target_account_id
      and accounts.is_active
      and (
        (
          accounts.kind = 'shared'
          and public.is_household_member(accounts.household_id)
        )
        or (
          accounts.kind = 'personal'
          and accounts.owner_user_id = auth.uid()
        )
      )
  );
$$;

drop policy if exists "members can read accounts" on public.accounts;
create policy "members can read accounts"
on public.accounts for select
using (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
  )
  or owner_user_id = auth.uid()
);

drop policy if exists "members can manage accounts" on public.accounts;
create policy "members can manage accounts"
on public.accounts for all
using (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
  )
  or owner_user_id = auth.uid()
)
with check (
  (
    kind = 'shared'
    and public.is_household_member(household_id)
    and owner_user_id is null
  )
  or (
    kind = 'personal'
    and owner_user_id = auth.uid()
  )
);
