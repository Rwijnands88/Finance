alter table public.contribution_plans
add column if not exists label text;

update public.contribution_plans
set label = 'Reguliere storting'
where label is null or btrim(label) = '';

alter table public.contribution_plans
alter column label set default 'Reguliere storting';

alter table public.contribution_plans
alter column label set not null;

drop index if exists contribution_plans_household_account_user_idx;

create index if not exists contribution_plans_household_account_user_idx
on public.contribution_plans(household_id, account_id, user_id)
where is_active;
