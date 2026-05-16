# Supabase setup

## Apply migrations

Run the SQL files in order:

1. `migrations/20260511000000_household_finance.sql`
2. `migrations/20260513000000_supabase_bootstrap.sql`
3. `migrations/20260513001000_api_grants.sql`
4. `migrations/20260515000000_v2_accounts_foundation.sql`
5. `migrations/20260515001000_recurring_billing_day.sql`
6. `migrations/20260516000000_contributions_cashflow.sql`
7. `migrations/20260516001000_contribution_plans.sql`
8. `migrations/20260516002000_receipts_storage.sql`

For the SQL Editor route, open each file locally and paste its full contents into Supabase SQL Editor. Run the files in the order above.

With Supabase CLI later this becomes:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## SQL Editor chunks

If Supabase only allows smaller pasted queries, run the files in
`sql-editor-chunks` in numeric order.

For the v2 account foundation, run these after chunks 01 through 10 have
succeeded:

11. `11_v2_accounts_table.sql`
12. `12_v2_account_defaults_backfill.sql`
13. `13_v2_account_columns_backfill.sql`
14. `14_v2_account_rls_core.sql`
15. `15_v2_account_rls_transactions.sql`
16. `16_v2_account_confirm_fixed.sql`
17. `17_v2_account_views_grants.sql`
18. `18_recurring_billing_day.sql`
19. `19_contributions_cashflow.sql`
20. `20_contribution_plans.sql`
21. `21_account_balances_income.sql`
22a. `22a_receipts_storage_base.sql`
22b. `22b_receipts_storage_update_delete.sql`

These chunks are non-destructive. They keep the current app working while adding
the account/rekening layer needed for the v2 UI.

Chunk 18 prepares the fixed-expense calendar by adding `billing_day` to
`recurring_expenses`. Existing fixed expenses are backfilled from their
`starts_on` day, with `1` as fallback.

Chunk 19 enables `contribution` transactions and creates the `Inleg` category.
Chunk 20 adds monthly contribution plans per household member for the shared
account, so the app can show planned, received and remaining inleg.
Chunk 21 adds saldo snapshots per account and enables `income` transactions
for salary and extra private income.
Chunks 22a and 22b add private receipt storage: `transactions.receipt_url`, a
private `receipts` Storage bucket and Storage policies scoped through account
access. They are split for the SQL Editor line limit.

## First household

### SQL Editor route

1. Go to Supabase Dashboard > Authentication > Users.
2. Create Ralph and Dorine.
3. Copy both user IDs.
4. Open `sql-editor-bootstrap-template.sql`.
5. Replace `RALPH_AUTH_USER_ID` and `DORINE_AUTH_USER_ID`.
6. Paste the file into Supabase SQL Editor and run it.

The script creates:

- both profiles
- the shared household
- both memberships with equal rights
- default categories
- the `Gezinsauto`

### App RPC route

After Ralph signs in, call:

```sql
select public.bootstrap_household('Ralph', 'Ralph & Dorine');
```

That creates:

- Ralph's profile
- the shared household
- the initial household membership
- default categories
- the `Gezinsauto`

For Dorine, create the auth user in Supabase and add her to the same household with the service role or SQL editor:

```sql
insert into public.profiles (id, display_name)
values ('DORINE_AUTH_USER_ID', 'Dorine')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.household_members (household_id, user_id)
values ('HOUSEHOLD_ID_FROM_BOOTSTRAP', 'DORINE_AUTH_USER_ID');
```

## Useful RPCs

- `create_fixed_instances_for_month(household_id, month)` creates monthly snapshots.
- `confirm_fixed_expense_instance(instance_id, amount, note)` confirms a fixed expense and writes the matching transaction.
- `seed_default_household_data(household_id)` restores missing default categories or the default vehicle.

## Dashboard views

- `monthly_category_totals`
- `monthly_person_totals`
- `monthly_account_category_totals`
- `monthly_account_person_totals`

Both views use `security_invoker = true`, so RLS stays active.

## V2 account model

The v2 foundation adds `accounts`:

- `Gezamenlijke rekening`: shared account for the household.
- `{Naam} prive`: personal account for each household member.

Existing `transactions` and `recurring_expenses` receive a nullable `account_id`.
Existing rows are backfilled to the shared account. The column stays nullable for
now so the current app can keep working until the UI and API flows become fully
account-aware.
