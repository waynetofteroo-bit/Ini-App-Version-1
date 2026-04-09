create table sm2_queue (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  concept_id     uuid references knowledge_graph_nodes(id) on delete cascade,
  user_course_id uuid references user_courses(id) on delete cascade,
  easiness       float4 default 2.5,
  interval_days  int4   default 1,
  repetitions    int4   default 0,
  next_review_at timestamptz default now(),
  blended_score  float4 default 0,
  updated_at     timestamptz default now()
);
alter table sm2_queue enable row level security;
create policy "Users manage own queue"
  on sm2_queue for all using (auth.uid() = user_id);
