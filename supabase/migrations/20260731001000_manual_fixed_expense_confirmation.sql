-- Aanvulling op budget/kas-migratie: bevestigen werkt alleen nog met open instances.

create unique index if not exists transactions_fixed_instance_unique_idx
on public.transactions(fixed_expense_instance_id)
where fixed_expense_instance_id is not null;

create or replace function public.confirm_fixed_expense_instance(
  target_instance_id uuid,
  target_amount numeric(12, 2) default null,
  target_actual_date date default null,
  target_note text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  instance_record public.fixed_expense_instances;
  recurring_record public.recurring_expenses;
  confirmed_transaction public.transactions;
  resolved_amount numeric(12, 2);
  resolved_actual_date date;
begin
  select *
  into instance_record
  from public.fixed_expense_instances
  where id = target_instance_id;

  if instance_record.id is null then
    raise exception 'Fixed expense instance not found';
  end if;

  select *
  into recurring_record
  from public.recurring_expenses
  where id = instance_record.recurring_expense_id;

  if recurring_record.id is null then
    raise exception 'Recurring expense not found';
  end if;

  if not (
    (
      recurring_record.account_id is null
      and public.is_household_member(instance_record.household_id)
    )
    or public.can_access_account(recurring_record.account_id)
  ) then
    raise exception 'Not allowed for this account';
  end if;

  if instance_record.status <> 'open' then
    raise exception 'Fixed expense instance is already processed';
  end if;

  resolved_amount := coalesce(target_amount, instance_record.amount_snapshot);
  resolved_actual_date := coalesce(
    target_actual_date,
    public.fixed_expense_due_date(instance_record.month, recurring_record.billing_day)
  );

  update public.fixed_expense_instances
  set
    amount_snapshot = resolved_amount,
    actual_date = resolved_actual_date,
    status = 'confirmed',
    confirmed_by = auth.uid(),
    confirmed_at = now(),
    note = target_note
  where id = target_instance_id
  returning * into instance_record;

  insert into public.transactions (
    household_id,
    account_id,
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
    recurring_record.account_id,
    instance_record.id,
    instance_record.category_id,
    instance_record.amount_snapshot,
    resolved_actual_date,
    'fixed',
    coalesce(target_note, 'Handmatig bevestigd'),
    auth.uid()
  )
  on conflict (fixed_expense_instance_id)
  where fixed_expense_instance_id is not null
  do update
  set
    account_id = excluded.account_id,
    category_id = excluded.category_id,
    amount = excluded.amount,
    transaction_date = excluded.transaction_date,
    note = excluded.note,
    updated_at = now()
  returning * into confirmed_transaction;

  return confirmed_transaction;
end;
$$;
