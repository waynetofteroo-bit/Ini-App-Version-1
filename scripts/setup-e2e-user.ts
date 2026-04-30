/**
 * Creates (or resets) a dedicated e2e test user and full enrolment.
 * Run: npx tsx scripts/setup-e2e-user.ts
 *
 * Writes .env.e2e with E2E_EMAIL and E2E_PASSWORD for Playwright.
 * Safe to re-run — deletes and recreates the user on each run.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const URL  = 'https://jsxdttvioxodkiydowod.supabase.co';
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = 'e2e-ladder@ini-test.local';
const PASS  = 'ini-e2e-ladder-2026';

const supabase = createClient(URL, SRK, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  // ── 1. Delete existing test user if present ────────────────────────────────
  const { data: existing } = await supabase.auth.admin.listUsers();
  const prev = existing?.users.find(u => u.email === EMAIL);
  if (prev) {
    console.log('Deleting existing e2e user…');
    await supabase.auth.admin.deleteUser(prev.id);
  }

  // ── 2. Create test user ────────────────────────────────────────────────────
  console.log('Creating e2e user…');
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASS,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);
  const userId = created.user.id;
  console.log(`User created: ${userId}`);

  // ── 3. Find WJEC-GCSE-PHY-DA course ───────────────────────────────────────
  const { data: course } = await supabase
    .from('courses')
    .select('id')
    .eq('course_code', 'WJEC-GCSE-PHY-DA')
    .single();
  if (!course) throw new Error('Course WJEC-GCSE-PHY-DA not found');

  // ── 4. Enrol user in course ────────────────────────────────────────────────
  const { data: uc, error: ucErr } = await supabase
    .from('user_courses')
    .insert({
      user_id:    userId,
      course_id:  course.id,
      exam_date:  '2026-06-15',
      active:     true,
    })
    .select('id')
    .single();
  if (ucErr || !uc) throw new Error(`user_courses insert failed: ${ucErr?.message}`);
  const userCourseId = uc.id;
  console.log(`Enrolled in course: ${userCourseId}`);

  // ── 5. Select all 6 Physics units ─────────────────────────────────────────
  const { data: units } = await supabase
    .from('units')
    .select('id')
    .eq('course_id', course.id)
    .order('unit_order');
  if (!units?.length) throw new Error('No units found for course');

  const userUnitRows = units.map(u => ({
    user_id:        userId,
    user_course_id: userCourseId,
    unit_id:        u.id,
    exam_date:      '2026-06-15',
  }));
  const { error: uuErr } = await supabase.from('user_units').insert(userUnitRows);
  if (uuErr) throw new Error(`user_units insert failed: ${uuErr.message}`);
  console.log(`Selected ${units.length} units`);

  // ── 6. Seed SM-2 queue for all concepts in selected units ─────────────────
  const unitIds = units.map(u => u.id);
  const { data: nodes } = await supabase
    .from('knowledge_graph_nodes')
    .select('id')
    .in('unit_id', unitIds);
  if (!nodes?.length) throw new Error('No knowledge graph nodes found');

  const queueRows = nodes.map(n => ({
    user_id:        userId,
    concept_id:     n.id,
    user_course_id: userCourseId,
    easiness:       2.5,
    interval_days:  1,
    repetitions:    0,
    next_review_at: new Date().toISOString(),
    blended_score:  0,
  }));

  // Insert in batches of 100 to avoid payload limits
  for (let i = 0; i < queueRows.length; i += 100) {
    const batch = queueRows.slice(i, i + 100);
    const { error: qErr } = await supabase.from('sm2_queue').insert(batch);
    if (qErr) throw new Error(`sm2_queue insert failed at batch ${i}: ${qErr.message}`);
  }
  console.log(`Seeded SM-2 queue: ${nodes.length} concepts`);

  // ── 7. Write .env.e2e ──────────────────────────────────────────────────────
  writeFileSync('.env.e2e', `E2E_EMAIL=${EMAIL}\nE2E_PASSWORD=${PASS}\n`, 'utf8');
  console.log('\n✓ .env.e2e written');
  console.log(`  E2E_EMAIL=${EMAIL}`);
  console.log(`  E2E_PASSWORD=${PASS}`);
}

run().catch(err => { console.error(err); process.exit(1); });
