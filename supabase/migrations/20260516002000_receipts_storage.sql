do $$
begin
  alter table public.transactions
    add column receipt_url text;
exception
  when duplicate_column then null;
end $$;

create index if not exists transactions_receipt_url_idx
on public.transactions(receipt_url)
where receipt_url is not null;

comment on column public.transactions.receipt_url is
'Private Supabase Storage object path for an uploaded receipt image.';

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update
set public = false;

drop policy if exists "members can read receipt images" on storage.objects;
create policy "members can read receipt images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.transactions transactions
    where (
        transactions.receipt_url = storage.objects.name
        or (
          transactions.id::text || '.jpg' = storage.filename(storage.objects.name)
          and transactions.account_id::text = (storage.foldername(storage.objects.name))[1]
        )
      )
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);

drop policy if exists "members can upload receipt images" on storage.objects;
create policy "members can upload receipt images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.transactions transactions
    where transactions.id::text || '.jpg' = storage.filename(storage.objects.name)
      and transactions.account_id::text = (storage.foldername(storage.objects.name))[1]
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);

drop policy if exists "members can update receipt images" on storage.objects;
create policy "members can update receipt images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.transactions transactions
    where (
        transactions.receipt_url = storage.objects.name
        or (
          transactions.id::text || '.jpg' = storage.filename(storage.objects.name)
          and transactions.account_id::text = (storage.foldername(storage.objects.name))[1]
        )
      )
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
)
with check (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.transactions transactions
    where transactions.id::text || '.jpg' = storage.filename(storage.objects.name)
      and transactions.account_id::text = (storage.foldername(storage.objects.name))[1]
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);

drop policy if exists "members can delete receipt images" on storage.objects;
create policy "members can delete receipt images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1
    from public.transactions transactions
    where (
        transactions.receipt_url = storage.objects.name
        or (
          transactions.id::text || '.jpg' = storage.filename(storage.objects.name)
          and transactions.account_id::text = (storage.foldername(storage.objects.name))[1]
        )
      )
      and (
        (
          transactions.account_id is null
          and public.is_household_member(transactions.household_id)
        )
        or public.can_access_account(transactions.account_id)
      )
  )
);
