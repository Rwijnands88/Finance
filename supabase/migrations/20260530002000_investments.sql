begin;

create table if not exists public.investment_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  degiro_total numeric(14, 2) not null default 0 check (degiro_total >= 0),
  investing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coin_name text not null check (btrim(coin_name) <> ''),
  coin_id text not null check (btrim(coin_id) <> ''),
  ticker text not null check (btrim(ticker) <> ''),
  amount numeric(24, 10) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crypto_positions_user_coin_idx
on public.crypto_positions(user_id, coin_id);

create index if not exists crypto_positions_user_id_idx
on public.crypto_positions(user_id);

drop trigger if exists investment_settings_touch_updated_at on public.investment_settings;
create trigger investment_settings_touch_updated_at
before update on public.investment_settings
for each row execute function public.touch_updated_at();

drop trigger if exists crypto_positions_touch_updated_at on public.crypto_positions;
create trigger crypto_positions_touch_updated_at
before update on public.crypto_positions
for each row execute function public.touch_updated_at();

alter table public.investment_settings enable row level security;
alter table public.crypto_positions enable row level security;

drop policy if exists "users can read own investment settings" on public.investment_settings;
create policy "users can read own investment settings"
on public.investment_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can manage own investment settings" on public.investment_settings;
create policy "users can manage own investment settings"
on public.investment_settings for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can read own crypto positions" on public.crypto_positions;
create policy "users can read own crypto positions"
on public.crypto_positions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can manage own crypto positions" on public.crypto_positions;
create policy "users can manage own crypto positions"
on public.crypto_positions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all privileges on table public.investment_settings from anon;
revoke all privileges on table public.crypto_positions from anon;

grant select, insert, update, delete on table public.investment_settings to authenticated;
grant select, insert, update, delete on table public.crypto_positions to authenticated;

commit;
