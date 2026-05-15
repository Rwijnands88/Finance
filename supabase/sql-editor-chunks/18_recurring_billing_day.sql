do $$
begin
  alter table public.recurring_expenses
    add column billing_day integer;
exception
  when duplicate_column then null;
end $$;

update public.recurring_expenses
set billing_day = extract(day from starts_on)::integer
where billing_day is null;

update public.recurring_expenses
set billing_day = 1
where billing_day is null;

do $$
begin
  alter table public.recurring_expenses
    alter column billing_day set default 1;
exception
  when undefined_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    alter column billing_day set not null;
exception
  when undefined_column then null;
end $$;

do $$
begin
  alter table public.recurring_expenses
    add constraint recurring_expenses_billing_day_check
    check (billing_day between 1 and 31);
exception
  when duplicate_object then null;
end $$;
