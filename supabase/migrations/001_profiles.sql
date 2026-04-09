create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  streak_days  int4 default 0,
  xp_total     int4 default 0,
  created_at   timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read/write own profile"
  on profiles for all using (auth.uid() = id);
