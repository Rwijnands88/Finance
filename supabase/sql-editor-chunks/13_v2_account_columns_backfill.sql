do $$
begin
  alter table public.transactions
    add column account_id uuid;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.transactions
    add constraint transactions_account_id_fkey
    foreign key (account_id)
    references public.accounts(id)
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add column account_id uuid;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add constraint recurring_expenses_account_id_fkey
    foreign key (account_id)
    references public.accounts(id)
    on delete restrict;
exception
  when duplicate_object then null;
end $$;

create index if not exists transactions_account_date_idx
on public.transactions(account_id, transaction_date desc)
where account_id is not null;

create index if not exists recurring_expenses_account_idx
on public.recurring_expenses(account_id)
where account_id is not null;

create or replace function public.assign_shared_account_when_missing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    select accounts.id
    into new.account_id
    from public.accounts accounts
    where accounts.household_id = new.household_id
      and accounts.kind = 'shared'
      and accounts.is_active
    order by accounts.sort_order, accounts.created_at
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_assign_shared_account on public.transactions;
create trigger transactions_assign_shared_account
before insert on public.transactions
for each row execute function public.assign_shared_account_when_missing();

drop trigger if exists recurring_expenses_assign_shared_account on public.recurring_expenses;
create trigger recurring_expenses_assign_shared_account
before insert on public.recurring_expenses
for each row execute function public.assign_shared_account_when_missing();

update public.transactions transactions
set account_id = accounts.id
from public.accounts accounts
where transactions.account_id is null
  and accounts.household_id = transactions.household_id
  and accounts.kind = 'shared';

update public.recurring_expenses recurring
set account_id = accounts.id
from public.accounts accounts
where recurring.account_id is null
  and accounts.household_id = recurring.household_id
  and accounts.kind = 'shared';
