-- Seed: WJEC GCSE Physics Double Award course + 6 units

insert into courses (course_code, course_name, exam_board, level, subject)
values ('WJEC-GCSE-PHY-DA', 'WJEC GCSE Physics Double Award', 'WJEC', 'GCSE', 'Physics')
on conflict (course_code) do nothing;

with course as (
  select id from courses where course_code = 'WJEC-GCSE-PHY-DA'
)
insert into units (course_id, unit_code, unit_name, unit_order, exam_board)
select
  course.id,
  u.unit_code,
  u.unit_name,
  u.unit_order,
  'WJEC'
from course, (values
  ('WJEC-DA-U1', 'Electricity',        1),
  ('WJEC-DA-U2', 'Forces and Motion',  2),
  ('WJEC-DA-U3', 'Waves',              3),
  ('WJEC-DA-U4', 'Energy',             4),
  ('WJEC-DA-U5', 'The Universe',       5),
  ('WJEC-DA-U6', 'Particles',          6)
) as u(unit_code, unit_name, unit_order)
on conflict do nothing;
