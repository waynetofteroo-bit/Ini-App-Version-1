create table answer_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles(id) on delete cascade,
  question_id        uuid references questions(id) on delete cascade,
  user_course_id     uuid references user_courses(id),
  correct            bool not null,
  response_ms        int4,
  bloom_demonstrated int2,
  gaps               text[] default '{}',
  created_at         timestamptz default now()
);
alter table answer_log enable row level security;
create policy "Users manage own answer log"
  on answer_log for all using (auth.uid() = user_id);
