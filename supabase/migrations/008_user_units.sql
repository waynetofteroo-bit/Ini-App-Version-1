create table user_units (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  user_course_id uuid references user_courses(id) on delete cascade,
  unit_id        uuid references units(id) on delete cascade,
  exam_date      date,
  enrolled_at    timestamptz default now()
);
alter table user_units enable row level security;
create policy "Users manage own unit selections"
  on user_units for all using (auth.uid() = user_id);
