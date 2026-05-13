# Supabase setup

## Apply migrations

Run the SQL files in order:

1. `migrations/20260511000000_household_finance.sql`
2. `migrations/20260513000000_supabase_bootstrap.sql`

For the SQL Editor route, open each file locally and paste its full contents into Supabase SQL Editor. Run file 1 first, then file 2.

With Supabase CLI later this becomes:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

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

Both views use `security_invoker = true`, so RLS stays active.
