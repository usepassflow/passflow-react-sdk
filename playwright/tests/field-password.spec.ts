import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';

// Never 6006 or 6007: another project's Storybook answers there.
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-fieldpassword--${id}&viewMode=story`);
  const storyRoot = page.locator('#storybook-root');
  await expect(storyRoot).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
};

const lengthRule = /At least \d+ characters/;

test.describe('FieldPassword rules follow the policy', () => {
  test('a restricted minimum and required classes show both lines', async ({ page }) => {
    await openStory(page, 'full-policy');
    await expect(page.getByText('At least 8 characters', { exact: true })).toBeVisible();
    await expect(page.getByText('Must contain a number, lowercase letter, and uppercase letter', { exact: true })).toBeVisible();
  });

  test('an unrestricted minimum shows no length line', async ({ page }) => {
    await openStory(page, 'length-not-restricted');
    await expect(page.getByText('Must contain a number', { exact: true })).toBeVisible();
    await expect(page.getByText(lengthRule)).toHaveCount(0);
  });

  test('no required class shows no "Must contain" line', async ({ page }) => {
    await openStory(page, 'length-only');
    await expect(page.getByText('At least 8 characters', { exact: true })).toBeVisible();
    await expect(page.getByText(/Must contain/)).toHaveCount(0);
  });

  test('a policy that enforces neither lists no rules', async ({ page }) => {
    await openStory(page, 'no-requirements');
    await expect(page.getByText(lengthRule)).toHaveCount(0);
    await expect(page.getByText(/Must contain/)).toHaveCount(0);
    await expect(page.locator('.passflow-password-validation')).toHaveCount(0);
  });

  test('a restricted minimum of zero shows no length line', async ({ page }) => {
    await openStory(page, 'restricted-zero-minimum');
    await expect(page.getByText('Must contain a number, lowercase letter, and uppercase letter', { exact: true })).toBeVisible();
    await expect(page.getByText(lengthRule)).toHaveCount(0);
  });

  test('typing still marks a met rule', async ({ page }) => {
    await openStory(page, 'length-only');
    await page.getByLabel('Password', { exact: true }).fill('longenough');
    await expect(page.locator('p.passflow-password-validation-item--success')).toHaveText('At least 8 characters');
  });
});
