create unique index if not exists categories_household_name_unique_idx
on public.categories(household_id, name);

create unique index if not exists vehicles_household_name_unique_idx
on public.vehicles(household_id, name);

create unique index if not exists transactions_fixed_instance_unique_idx
on public.transactions(fixed_expense_instance_id)
where fixed_expense_instance_id is not null;

create or replace function public.seed_default_household_data(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'Not a member of this household';
  end if;

  insert into public.categories (household_id, name, kind, color, sort_order)
  values
    (target_household_id, 'Hypotheek', 'fixed', '#6366F1', 10),
    (target_household_id, 'Internet', 'fixed', '#818CF8', 20),
    (target_household_id, 'Water', 'fixed', '#22D3EE', 30),
    (target_household_id, 'Elektra', 'fixed', '#06B6D4', 40),
    (target_household_id, 'Abonnementen', 'fixed', '#A78BFA', 50),
    (target_household_id, 'Kinderopvang', 'fixed', '#F59E0B', 60),
    (target_household_id, 'BSO', 'fixed', '#FBBF24', 70),
    (target_household_id, 'Verzekeringen', 'fixed', '#F97316', 80),
    (target_household_id, 'Telefoon', 'fixed', '#C084FC', 90),
    (target_household_id, 'TV', 'fixed', '#8B5CF6', 100),
    (target_household_id, 'Belasting', 'fixed', '#64748B', 110),
    (target_household_id, 'Boodschappen', 'variable', '#10B981', 120),
    (target_household_id, 'Tanken', 'variable', '#38BDF8', 130),
    (target_household_id, 'Overig', 'variable', '#EF4444', 140)
  on conflict do nothing;

  insert into public.vehicles (household_id, name)
  values (target_household_id, 'Gezinsauto')
  on conflict do nothing;
end;
$$;

create or replace function public.bootstrap_household(
  display_name text,
  household_name text default 'Ralph & Dorine'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), trim(display_name))
  on conflict (id) do update
    set display_name = excluded.display_name;

  insert into public.households (name)
  values (trim(household_name))
  returning id into created_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (created_household_id, auth.uid(), 'member');

  perform public.seed_default_household_data(created_household_id);

  return created_household_id;
end;
$$;

create or replace function public.confirm_fixed_expense_instance(
  target_instance_id uuid,
  target_amount numeric(12, 2) default null,
  target_note text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  instance_record public.fixed_expense_instances;
  confirmed_transaction public.transactions;
begin
  select *
  into instance_record
  from public.fixed_expense_instances
  where id = target_instance_id;

  if instance_record.id is null then
    raise exception 'Fixed expense instance not found';
  end if;

  if not public.is_household_member(instance_record.household_id) then
    raise exception 'Not a member of this household';
  end if;

  update public.fixed_expense_instances
  set
    amount_snapshot = coalesce(target_amount, amount_snapshot),
    status = case when target_amount is null then 'confirmed' else 'adjusted' end,
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    note = target_note
  where id = target_instance_id
  returning * into instance_record;

  insert into public.transactions (
    household_id,
    fixed_expense_instance_id,
    category_id,
    amount,
    transaction_date,
    type,
    note,
    entered_by
  )
  values (
    instance_record.household_id,
    instance_record.id,
    instance_record.category_id,
    instance_record.amount_snapshot,
    instance_record.month,
    'fixed',
    coalesce(target_note, 'Automatisch terugkerend'),
    auth.uid()
  )
  on conflict do nothing
  returning * into confirmed_transaction;

  if confirmed_transaction.id is null then
    select *
    into confirmed_transaction
    from public.transactions
    where fixed_expense_instance_id = target_instance_id
    limit 1;
  end if;

  return confirmed_transaction;
end;
$$;

create or replace view public.monthly_category_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.category_id,
  categories.name as category_name,
  categories.kind as category_kind,
  categories.color as category_color,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.categories on categories.id = transactions.category_id
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.category_id,
  categories.name,
  categories.kind,
  categories.color;

create or replace view public.monthly_person_totals
with (security_invoker = true)
as
select
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date as month,
  transactions.entered_by,
  profiles.display_name,
  sum(transactions.amount)::numeric(12, 2) as total_amount
from public.transactions
join public.profiles on profiles.id = transactions.entered_by
group by
  transactions.household_id,
  date_trunc('month', transactions.transaction_date)::date,
  transactions.entered_by,
  profiles.display_name;
