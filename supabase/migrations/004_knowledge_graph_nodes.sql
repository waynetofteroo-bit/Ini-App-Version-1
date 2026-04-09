create table knowledge_graph_nodes (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid references units(id) on delete cascade,
  concept_uri  text unique not null,
  label        text not null,
  bloom_ceiling int2 not null,
  topic_tier   text default 'core',
  exam_board   text not null,
  gap_flags    text[] default '{}'
);
-- Public read
