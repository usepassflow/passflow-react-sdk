import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=${id}&viewMode=story`);
  await waitForStoryRendered(page);
  await expect(page.locator('#storybook-root')).not.toBeEmpty();
};

/** The right edge of every switch track on the screen. */
const trackRightEdges = (page: Page) =>
  page
    .locator('.passflow-switch-track')
    .evaluateAll((tracks) => tracks.map((track) => Math.round(track.getBoundingClientRect().right)));

const expectAccessible = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).include('#storybook-root').analyze();
  expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
};

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 375, height: 812 },
]) {
  test(`required scopes are plain lines and every switch shares one column (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page, 'components-loginscreen-consent-client--mcp-verified-local-client');

    for (const scope of ['openid', 'offline_access', 'notes:read']) {
      await expect(page.getByTestId(`consent-scope-${scope}`).getByRole('switch')).toHaveCount(0);
    }
    await expect(page.getByTestId('consent-scope-openid')).toHaveText("Confirm who you areLets the app know it's you");
    await expect(page.getByTestId('consent-scope-notes:read')).toHaveText('Read your notes');

    await expect(page.getByRole('switch', { name: 'See your email address', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Write and change your notes', exact: true })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Share your notes with other people', exact: true })).not.toBeChecked();
    await expect(page.getByTestId('consent-scope-email')).toHaveText('See your email address');

    const card = page.getByTestId('consent-resource-https://notes.example/mcp');
    for (const scope of ['notes:read', 'notes:write', 'notes:share']) {
      await expect(card.getByTestId(`consent-scope-${scope}`)).toBeVisible();
    }

    const edges = await trackRightEdges(page);
    expect(edges).toHaveLength(3);
    expect(new Set(edges).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expectAccessible(page);
  });
}

test('warnings come first, and the items below the resources share one card', async ({ page }) => {
  await openStory(page, 'components-loginscreen-consent-client--mcp-unverified-with-warnings');

  const lastWarning = await page.getByTestId('consent-warning-unverified_client').boundingBox();
  const redirect = await page.getByTestId('consent-redirect-host').boundingBox();
  if (!lastWarning || !redirect) throw new Error('expected rendered warnings and redirect');
  expect(lastWarning.y + lastWarning.height).toBeLessThanOrEqual(redirect.y);

  const cards = await page
    .locator('[data-testid="consent-scope-openid"], [data-testid="consent-scope-offline_access"], [data-testid="consent-scope-email"]')
    .evaluateAll((rows) => rows.map((row) => row.closest('.passflow-consent-scope')));
  expect(cards).toHaveLength(3);
  expect(new Set(cards).size).toBe(1);
});

test('a switch inside a resource card toggles its own scope', async ({ page }) => {
  await openStory(page, 'components-loginscreen-consent-client--mcp-verified-local-client');

  await page.getByText('Share your notes with other people').click();
  await expect(page.getByRole('switch', { name: 'Share your notes with other people' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Write and change your notes' })).toBeChecked();
});

test('Allow grants the required scopes and the switches that are on, hidden mcp included', async ({ page }) => {
  await openStory(page, 'flows-consentflow--mcp-verified-local-client');

  await expect(page.getByTestId('consent-scope-mcp')).toHaveCount(0);
  await page.getByText('See your email address').click();
  await page.getByText('Share your notes with other people').click();
  await page.getByRole('button', { name: 'Allow', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText(
    'Allow would grant: mcp, notes:read, notes:write, notes:share, openid, offline_access.',
  );
});

test('an old server payload keeps every scope a switch and its resource card bare', async ({ page }) => {
  await openStory(page, 'flows-consentflow--old-server');

  for (const label of ['Sign in', 'Email', 'Offline access', 'mcp']) {
    await expect(page.getByRole('switch', { name: label, exact: true })).toBeChecked();
  }
  await expect(page.getByTestId('consent-resource-https://notes.example/mcp').getByRole('listitem')).toHaveCount(0);
  expect(new Set(await trackRightEdges(page)).size).toBe(1);
});
