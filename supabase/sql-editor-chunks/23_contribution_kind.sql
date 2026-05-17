alter table public.transactions
add column if not exists contribution_kind text;

alter table public.transactions
drop constraint if exists transactions_contribution_kind_check;

alter table public.transactions
add constraint transactions_contribution_kind_check
check (
  contribution_kind is null
  or (
    type = 'contribution'
    and contribution_kind in ('planned', 'extra')
  )
);
