import { expect, type Locator, type Page, test } from '@playwright/test';

test.describe('planner browser smoke', () => {
  test('loads the planner shell with an empty graph prompt', async ({ page }) => {
    await openFreshPlanner(page);

    await expect(page.getByText('Beltwise', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Production graph' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Production Targets' })).toBeVisible();
    await expect(page.locator('.empty-graph')).toContainText('Add a target to build a plan.');
  });

  test('solves an Iron Plate target and keeps it after reload', async ({ page }) => {
    await openFreshPlanner(page);
    await configureIronPlateTarget(page);

    const graphNodes = page.locator('.production-node');
    await expectAtLeast(graphNodes, 2);
    await expect(graphNodes.filter({ hasText: 'Iron Plate' }).first()).toBeVisible();
    await expect(page.locator('.edge-label').filter({ hasText: 'Iron Ore' }).first()).toBeVisible();

    await page.reload();

    await expect(page.getByText('Beltwise', { exact: true })).toBeVisible();
    await expect(page.locator('.production-node').filter({ hasText: 'Iron Plate' }).first())
      .toBeVisible();
    await expect(page.getByRole('button', { name: /Choose active plan: .*Iron Plate/i }))
      .toBeVisible();
  });
});

async function openFreshPlanner(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByText('Beltwise', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Production Targets' })).toBeVisible();
}

async function configureIronPlateTarget(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add product target' }).first().click();
  await page.getByRole('button', { name: /Select an item/i }).click();

  const searchInput = page.getByRole('searchbox', { name: 'Search target items' });
  await searchInput.fill('Iron Plate');
  await page.getByRole('option', { name: /^Iron Plate$/ }).click();

  const amountInput = page.getByLabel('Amount per minute').first();
  await amountInput.fill('30');
}

async function expectAtLeast(locator: Locator, expectedCount: number): Promise<void> {
  await expect.poll(async () => locator.count()).toBeGreaterThanOrEqual(expectedCount);
}
