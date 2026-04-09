create table user_courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  course_id   uuid references courses(id) on delete cascade,
  exam_date   date not null,
  enrolled_at timestamptz default now(),
  active      bool default true
);
alter table user_courses enable row level security;
create policy "Users manage own enrolments"
  on user_courses for all using (auth.uid() = user_id);
