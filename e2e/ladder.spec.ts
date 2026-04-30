/**
 * Bloom's Ladder — end-to-end functional checks
 *
 * Prerequisites (flag in verification report if not met):
 *   1. Dev server running: npm run dev (localhost:3000)
 *   2. Migration 017_ladder.sql applied to the Supabase project
 *   3. E2E_EMAIL + E2E_PASSWORD env vars set to a test account that is
 *      enrolled in WJEC-GCSE-PHY-DA with at least one unit selected
 *   4. The enrolled unit must have questions at Bloom's L1 (at minimum)
 *
 * Run: npx playwright test e2e/ladder.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Load credentials from .env.e2e (written by scripts/setup-e2e-user.ts) or env
function loadCreds(): { email: string; pass: string } {
  try {
    const lines = readFileSync('.env.e2e', 'utf8').split('\n');
    const get = (key: string) => lines.find(l => l.startsWith(key))?.split('=')[1]?.trim() ?? '';
    return { email: get('E2E_EMAIL'), pass: get('E2E_PASSWORD') };
  } catch {
    return { email: process.env.E2E_EMAIL ?? '', pass: process.env.E2E_PASSWORD ?? '' };
  }
}

const { email: EMAIL, pass: PASS } = loadCreds();

// ── Auth helper ───────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[type="email"]',    EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
}

// ── Navigate to first unit hub ────────────────────────────────────────────────

async function goToUnitHub(page: Page) {
  // From dashboard, go to progress page and expand first unit, then "Study this unit →"
  await page.goto(`${BASE}/dashboard`);
  const courseId = new URL(page.url()).searchParams.get('course') ?? '';
  await page.goto(`${BASE}/progress?course=${courseId}`);
  // Expand the first unit accordion
  await page.locator('button').filter({ hasText: /Unit|Electricity|Forces|Waves|Energy|Universe|Particles/ }).first().click();
  // Click the unit hub link
  await page.getByText('Study this unit →').first().click();
  await page.waitForURL(/\/unit\//);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Bloom's Ladder — functional checks", () => {
  test.beforeEach(async ({ page }) => {
    if (!EMAIL || !PASS) test.skip();
    await login(page);
  });

  // FC-1: Brand-new student enters ladder mode and gets a question at the
  //       unit's lowest populated Bloom's level
  test('FC-1: entry routes to lowest available rung', async ({ page }) => {
    await goToUnitHub(page);

    // Ladder entry card should be visible
    await expect(page.getByText("Bloom's ladder")).toBeVisible();

    // Click Begin or Continue
    await page.getByRole('link', { name: /Begin at L|Continue climbing/ }).first().click();
    await page.waitForURL(/\/session\/ladder\//);
    // Wait for async fetches: state + queue both need to resolve before page transitions from 'loading'
    await page.waitForLoadState('networkidle');

    // Either shows intro screen or question screen
    const hasIntro    = await page.getByText('How the ladder works').isVisible().catch(() => false);
    const hasQuestion = await page.getByText('Check answer').isVisible().catch(() => false);
    expect(hasIntro || hasQuestion).toBe(true);

    // If intro is shown, dismiss it
    if (hasIntro) {
      await page.getByRole('button', { name: /Got it/ }).click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Check answer')).toBeVisible();
    }

    // LadderProgress should show current rung as ● (current indicator)
    await expect(page.getByText(/L\d ●/).first()).toBeVisible();
  });

  // FC-2: Locked rungs render correctly
  test('FC-2: locked rungs show lock indicator', async ({ page }) => {
    await goToUnitHub(page);
    await page.getByRole('link', { name: /Begin at L|Continue climbing/ }).first().click();
    await page.waitForURL(/\/session\/ladder\//);
    await page.waitForLoadState('networkidle');

    const hasIntro = await page.getByText('How the ladder works').isVisible().catch(() => false);
    if (hasIntro) await page.getByRole('button', { name: /Got it/ }).click();

    // Any rung beyond the current should show 🔒
    const lockedRung = page.locator('div').filter({ hasText: /🔒/ }).first();
    // If there is only one rung, there are no locked rungs — either is fine
    const rungs = await page.locator('div').filter({ hasText: /L\d/ }).count();
    if (rungs > 1) {
      await expect(lockedRung).toBeVisible();
    }
  });

  // FC-3: State persists across sessions — exit and return to same rung
  // NOTE: requires migration 017 (ladder_state table). Without it the INSERT
  // fails silently, state is not saved, and the unit hub shows "Begin at L1 →"
  // instead of "Continue climbing →" on return. This test correctly fails when
  // the migration has not been applied.
  test('FC-3: state persists after navigation away and back', async ({ page }) => {
    await goToUnitHub(page);
    await page.getByRole('link', { name: /Begin at L|Continue climbing/ }).first().click();
    await page.waitForURL(/\/session\/ladder\//);
    await page.waitForLoadState('networkidle');

    const hasIntro = await page.getByText('How the ladder works').isVisible().catch(() => false);
    if (hasIntro) {
      await page.getByRole('button', { name: /Got it/ }).click();
      await page.waitForLoadState('networkidle');
    }

    // Record current rung — wait for it to be present first
    const rungLocator = page.getByText(/L\d ●/);
    await expect(rungLocator).toBeVisible({ timeout: 12_000 });
    const rungText = await rungLocator.first().textContent();

    // Navigate away and wait for unit hub
    await page.goBack();
    await page.waitForURL(/\/unit\//);
    await page.waitForLoadState('networkidle');

    // "Continue climbing →" only appears when state was persisted
    await expect(page.getByRole('link', { name: /Continue climbing/ })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('link', { name: /Continue climbing/ }).first().click();
    await page.waitForURL(/\/session\/ladder\//);
    await page.waitForLoadState('networkidle');

    const rungLocatorAfter = page.getByText(/L\d ●/);
    await expect(rungLocatorAfter).toBeVisible({ timeout: 8_000 });
    const rungTextAfter = await rungLocatorAfter.first().textContent();
    expect(rungTextAfter).toBe(rungText);
  });

  // FC-4: Unit hub shows LadderEntryCard with ladder not shown for units
  //       with no questions (edge case — verified structurally)
  test('FC-4: unit hub shows three mode cards', async ({ page }) => {
    await goToUnitHub(page);
    await expect(page.getByText('Review due cards')).toBeVisible();
    // Use exact: true — "Focus session" also appears as part of link text "Start focus session →"
    await expect(page.getByText('Focus session', { exact: true })).toBeVisible();
    // Ladder card shown when unit has content
    await expect(page.getByText("Bloom's ladder")).toBeVisible();
  });

  // FC-5: Ladder entry card always shows a valid action — either "Begin at L[N]"
  //       (not yet started) or "Continue climbing →" (previously entered).
  //       Verifies the rung number is valid when the not-started copy is shown.
  test('FC-5: entry card shows valid action copy', async ({ page }) => {
    await goToUnitHub(page);
    // One of these must be visible — the card renders regardless of student state
    await expect(
      page.getByText(/Begin at L\d|Continue climbing|Review the ladder/).first()
    ).toBeVisible({ timeout: 8_000 });
    // If "Begin at L[N]" is shown, validate the rung number is in range 1–5
    const beginText = await page.getByText(/Begin at L\d/).first()
      .textContent({ timeout: 500 }).catch(() => null);
    if (beginText) {
      const level = Number(beginText.match(/L(\d)/)?.[1]);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(5);
    }
  });
});

test.describe("Bloom's Ladder — mobile rendering", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test('FC-mobile: ladder progress row renders on a 390px viewport', async ({ page }) => {
    if (!EMAIL || !PASS) test.skip();
    await login(page);
    await goToUnitHub(page);
    await page.getByRole('link', { name: /Begin at L|Continue climbing/ }).first().click();
    await page.waitForURL(/\/session\/ladder\//);
    await page.waitForLoadState('networkidle');

    const hasIntro = await page.getByText('How the ladder works').isVisible().catch(() => false);
    if (hasIntro) {
      await page.getByRole('button', { name: /Got it/ }).click();
      await page.waitForLoadState('networkidle');
    }

    // LadderProgress row must be in the viewport — not overflowing horizontally
    const ladder = page.getByText(/L\d ●/).first();
    await expect(ladder).toBeVisible({ timeout: 8_000 });
    await expect(ladder).toBeInViewport();
  });
});
