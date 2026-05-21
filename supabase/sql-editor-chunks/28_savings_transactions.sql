alter table public.transactions
drop constraint if exists transactions_type_check;

alter table public.transactions
add constraint transactions_type_check
check (type in ('fixed', 'variable', 'contribution', 'income', 'sparen'));
