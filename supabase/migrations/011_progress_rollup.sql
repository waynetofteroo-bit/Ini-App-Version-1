create view progress_rollup as
select
  al.user_id,
  uc.id                                                              as user_course_id,
  u.id                                                               as unit_id,
  u.unit_name,
  kgn.id                                                             as topic_id,
  kgn.label                                                          as topic_label,
  q.bloom_level,
  al.bloom_demonstrated,
  avg(al.correct::int) over (partition by al.user_id, kgn.id)       as topic_mastery,
  avg(al.correct::int) over (partition by al.user_id, u.id)         as unit_avg_mastery,
  max(al.bloom_demonstrated) over (partition by al.user_id, kgn.id) as bloom_ceiling_reached
from answer_log al
join questions             q   on q.id       = al.question_id
join knowledge_graph_nodes kgn on kgn.id     = q.concept_id
join units                 u   on u.id        = kgn.unit_id
join user_units            uu  on uu.unit_id  = u.id and uu.user_id = al.user_id
join user_courses          uc  on uc.id       = uu.user_course_id
join profiles              p   on p.id        = al.user_id;
