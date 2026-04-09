create table courses (
  id          uuid primary key default gen_random_uuid(),
  course_code text unique not null,
  course_name text not null,
  exam_board  text not null,
  level       text not null,
  subject     text not null
);
-- Public read, no RLS needed (content table)
