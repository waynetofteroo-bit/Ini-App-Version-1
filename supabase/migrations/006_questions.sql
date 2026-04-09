create table questions (
  id             uuid primary key default gen_random_uuid(),
  concept_id     uuid references knowledge_graph_nodes(id) on delete cascade,
  stem           text not null,
  options        jsonb not null,
  correct_idx    int2 not null,
  bloom_level    int2 not null,
  marking_prompt jsonb,
  exam_board     text not null,
  created_at     timestamptz default now()
);
-- Public read
