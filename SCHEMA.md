# ini — Database Schema

## Hierarchy chain

Every level is enforced by a FK. Follow this chain when writing queries.

```
profiles (user identity)
  └── user_courses (course enrolment — exam_board + exam_date live here)
        └── user_units (unit selection — chosen at onboarding Step 4)
              └── units (WJEC unit catalogue)
                    └── knowledge_graph_nodes (topic — unit_id FK)
                          └── questions (concept_id FK, bloom_level)
                                └── answer_log (bloom_demonstrated, gaps[])
```

---

## Tables

### `profiles`
One row per user. Created automatically by DB trigger on `auth.users` insert.

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  streak_days  int4 default 0,
  xp_total     int4 default 0,
  created_at   timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read/write own profile"
  on profiles for all using (auth.uid() = id);
```

> `exam_board` and `exam_date` do NOT live here. They live on `user_courses`.

---

### `courses`
Catalogue of all available courses. Public read, no RLS.

```sql
create table courses (
  id          uuid primary key default gen_random_uuid(),
  course_code text unique not null,  -- 'WJEC-GCSE-PHY-DA'
  course_name text not null,
  exam_board  text not null,         -- 'WJEC' | 'AQA' | 'Edexcel'
  level       text not null,         -- 'GCSE' | 'A-Level'
  subject     text not null          -- 'Physics' | 'Biology' | 'Chemistry'
);
```

---

### `units`
Named units within a course. Public read, no RLS.

```sql
create table units (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references courses(id) on delete cascade,
  unit_code   text not null,   -- 'WJEC-DA-U1'
  unit_name   text not null,   -- 'Electricity'
  unit_order  int2 not null,
  exam_board  text not null
);
```

WJEC GCSE Physics Double Award units:
```
order 1: Electricity
order 2: Forces and Motion
order 3: Waves
order 4: Energy
order 5: The Universe
order 6: Particles
```

---

### `knowledge_graph_nodes`
One node per topic. `unit_id` FK is the critical link connecting topics to units.

```sql
create table knowledge_graph_nodes (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid references units(id) on delete cascade,  -- ★ required FK
  concept_uri   text unique not null,  -- 'wjec:physics:electricity:ohms-law'
  label         text not null,
  bloom_ceiling int2 not null,         -- 1–5
  topic_tier    text default 'core',   -- 'core' | 'higher'
  exam_board    text not null,
  gap_flags     text[] default '{}'
);
```

> `mastery_level` is NOT a column. It is computed at query time via `progress_rollup`.

---

### `knowledge_graph_edges`
Prerequisite and bridge relationships between topic nodes.

```sql
create table knowledge_graph_edges (
  id         uuid primary key default gen_random_uuid(),
  from_node  uuid references knowledge_graph_nodes(id) on delete cascade,
  to_node    uuid references knowledge_graph_nodes(id) on delete cascade,
  relation   text not null,   -- 'prerequisite' | 'bridge'
  exam_board text not null
);
```

---

### `questions`
MCQ and extended response questions. Public read, no RLS.

```sql
create table questions (
  id             uuid primary key default gen_random_uuid(),
  concept_id     uuid references knowledge_graph_nodes(id) on delete cascade,
  stem           text not null,
  options        jsonb not null,   -- [{idx: 0, text: "..."}, ...]
  correct_idx    int2 not null,
  bloom_level    int2 not null check (bloom_level between 1 and 5),
  marking_prompt jsonb,            -- only populated for bloom_level 4–5
  exam_board     text not null,
  created_at     timestamptz default now()
);
```

**`marking_prompt` JSONB structure (L4–L5 only):**
```json
{
  "markscheme_points": ["point 1", "point 2"],
  "indicative_content": "...",
  "rubric_bands": {
    "Full":    { "descriptor": "...", "marks": 6 },
    "Good":    { "descriptor": "...", "marks": 4 },
    "Partial": { "descriptor": "...", "marks": 2 },
    "Minimal": { "descriptor": "...", "marks": 1 }
  }
}
```

---

### `user_courses`
One row per student course enrolment.

```sql
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
```

---

### `user_units`
Which units within a course the student selected at onboarding Step 4.

```sql
create table user_units (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  user_course_id uuid references user_courses(id) on delete cascade,
  unit_id        uuid references units(id) on delete cascade,
  exam_date      date,   -- optional per-unit override
  enrolled_at    timestamptz default now()
);
alter table user_units enable row level security;
create policy "Users manage own unit selections"
  on user_units for all using (auth.uid() = user_id);
```

---

### `sm2_queue`
One row per user per topic, per course enrolment.

```sql
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
```

---

### `answer_log`
Every question attempt. The leaf of the hierarchy — all progress aggregations start here.

```sql
create table answer_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references profiles(id) on delete cascade,
  question_id        uuid references questions(id) on delete cascade,
  user_course_id     uuid references user_courses(id),
  correct            bool not null,
  response_ms        int4,
  bloom_demonstrated int2,   -- actual Bloom level reached (from marking for L4–5)
  gaps               text[] default '{}',
  created_at         timestamptz default now()
);
alter table answer_log enable row level security;
create policy "Users manage own answer log"
  on answer_log for all using (auth.uid() = user_id);
```

---

## `progress_rollup` view

The full 7-table join. Always filter by `user_course_id` in application queries.

```sql
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
join questions             q   on q.id        = al.question_id
join knowledge_graph_nodes kgn on kgn.id      = q.concept_id
join units                 u   on u.id         = kgn.unit_id
join user_units            uu  on uu.unit_id   = u.id and uu.user_id = al.user_id
join user_courses          uc  on uc.id        = uu.user_course_id
join profiles              p   on p.id         = al.user_id;
```

**Always scope with:** `WHERE uc.id = $user_course_id`

---

## DB trigger — auto-create profile

```sql
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

## Common query patterns

### Fetch today's SM-2 queue for a course
```sql
select q.*, kgn.label as topic_label, q2.stem, q2.options, q2.bloom_level
from sm2_queue smq
join knowledge_graph_nodes kgn on kgn.id = smq.concept_id
join questions q2 on q2.concept_id = kgn.id
where smq.user_id = $user_id
  and smq.user_course_id = $user_course_id
  and smq.next_review_at <= now()
order by smq.blended_score desc
limit 20;
```

### Course progress percentage
```sql
select
  count(*) filter (where topic_mastery >= 0.8) as mastered,
  count(distinct topic_id)                      as total,
  round(100.0 * count(*) filter (where topic_mastery >= 0.8)
        / nullif(count(distinct topic_id), 0), 1) as course_pct
from progress_rollup
where user_id = $user_id
  and user_course_id = $user_course_id;
```

### Unit progress for dashboard bars
```sql
select unit_id, unit_name, round(avg(unit_avg_mastery)::numeric, 3) as unit_mastery
from progress_rollup
where user_id = $user_id
  and user_course_id = $user_course_id
group by unit_id, unit_name
order by unit_mastery asc;
```

### Topic pills for a unit
```sql
select topic_id, topic_label,
  case
    when avg(topic_mastery) >= 0.8 then 'mastered'
    when avg(topic_mastery) > 0    then 'learning'
    else 'unseen'
  end as mastery_state
from progress_rollup
where user_id = $user_id
  and user_course_id = $user_course_id
  and unit_id = $unit_id
group by topic_id, topic_label;
```

---

## Migration order

Run in this order to avoid FK violations:

1. `profiles`
2. `courses`
3. `units`
4. `knowledge_graph_nodes`
5. `knowledge_graph_edges`
6. `questions`
7. `user_courses`
8. `user_units`
9. `sm2_queue`
10. `answer_log`
11. `progress_rollup` (view)
12. `handle_new_user` trigger
