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
