create table knowledge_graph_edges (
  id        uuid primary key default gen_random_uuid(),
  from_node uuid references knowledge_graph_nodes(id) on delete cascade,
  to_node   uuid references knowledge_graph_nodes(id) on delete cascade,
  relation  text not null,
  exam_board text not null
);
-- Public read
