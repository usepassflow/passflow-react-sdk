import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import settings from './responses/passflow-settings.json';

type PasswordPolicy = (typeof settings)['password_policy'];

const openSignUpWithPolicy = async (page: Page, overrides: Partial<PasswordPolicy>) => {
  const policy = { ...settings.password_policy, ...overrides };
  await page.route('**/settings', (route) => route.fulfill({ json: { ...settings, password_policy: policy } }));
  await page.route('**/settings/password', (route) => route.fulfill({ json: policy }));
  await page.route('**/app/settings', (route) =>
    route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') }),
  );

  await page.goto('http://localhost:5173/web/signup');
  await expect(page.getByText('Create your account', { exact: true })).toBeVisible();
  // Leave the passwordless experience so the password field and its rules show.
  await page.locator('label div').click();
  await expect(page.locator('input#password')).toBeVisible();
};

test.describe('password rules under the field', () => {
  test('show no length rule when the minimum length is not restricted', async ({ page }) => {
    await openSignUpWithPolicy(page, {
      restrict_min_password_length: false,
      min_password_length: 12,
      require_lowercase: false,
      require_uppercase: false,
      require_number: true,
      require_symbol: false,
    });

    await expect(page.getByText('Must contain a number', { exact: true })).toBeVisible();
    await expect(page.getByText(/At least \d+ characters/)).toHaveCount(0);
  });

  test('show no "Must contain" line when no character class is required', async ({ page }) => {
    await openSignUpWithPolicy(page, {
      restrict_min_password_length: true,
      min_password_length: 8,
      require_lowercase: false,
      require_uppercase: false,
      require_number: false,
      require_symbol: false,
    });

    await expect(page.getByText('At least 8 characters', { exact: true })).toBeVisible();
    await expect(page.getByText(/Must contain/)).toHaveCount(0);
  });
});
