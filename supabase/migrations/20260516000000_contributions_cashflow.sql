alter table public.transactions
drop constraint if exists transactions_type_check;

alter table public.transactions
add constraint transactions_type_check
check (type in ('fixed', 'variable', 'contribution'));

insert into public.categories (household_id, name, kind, color, sort_order)
select households.id, 'Inleg', 'variable', '#34D399', 115
from public.households
where not exists (
  select 1
  from public.categories
  where categories.household_id = households.id
    and categories.name = 'Inleg'
);
