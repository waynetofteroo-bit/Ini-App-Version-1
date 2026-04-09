create table units (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references courses(id) on delete cascade,
  unit_code   text not null,
  unit_name   text not null,
  unit_order  int2 not null,
  exam_board  text not null
);
-- Public read
