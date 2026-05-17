alter table public.transactions
add column if not exists paid_by uuid references public.profiles(id) default auth.uid();

update public.transactions
set paid_by = entered_by
where paid_by is null;

create index if not exists transactions_paid_by_idx
on public.transactions(paid_by);
