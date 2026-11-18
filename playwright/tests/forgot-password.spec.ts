import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { corsHeaders } from './enrollment-contract.helpers';

const passwordChangeNotice = 'You must change your password before you can sign in. Reset your password to continue.';

const openForgotPassword = async (page: Page, search: Record<string, string>) => {
  await page.route('**/settings', (route) =>
    route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') }),
  );
  await page.route('**/app/settings', (route) =>
    route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') }),
  );
  await page.goto(`http://localhost:5173/web/forgot-password?${new URLSearchParams(search)}`);
  await expect(page.getByText('Forgot password?', { exact: true })).toBeVisible();
};

const identifier = (page: Page) => page.locator('input#email_or_username');
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send reset instructions' });

test.describe('forgot password after a forced password change', () => {
  test('shows the notice with the identifier filled in and the button enabled', async ({ page }) => {
    await openForgotPassword(page, {
      default_method: 'email_or_username',
      email: 'jack@example.com',
      reason: 'password_change_required',
    });

    await expect(identifier(page)).toHaveValue('jack@example.com');
    await expect(page.getByRole('status').filter({ hasText: passwordChangeNotice })).toBeVisible();
    await expect(sendButton(page)).toBeEnabled();
  });

  for (const reason of ['expired', 'password_change_required ', 'PASSWORD_CHANGE_REQUIRED', 'Call support at 555-0100']) {
    test(`shows no notice and no URL text for reason "${reason}"`, async ({ page }) => {
      await openForgotPassword(page, {
        default_method: 'email_or_username',
        email: 'jack@example.com',
        reason,
        message: 'Your account is locked. Call support at 555-0100.',
      });

      await expect(page.getByText(passwordChangeNotice)).toHaveCount(0);
      await expect(page.locator('.passflow-login-screen-note')).toHaveCount(0);
      await expect(page.getByText(/Call support/)).toHaveCount(0);
      await expect(page.getByText(/account is locked/)).toHaveCount(0);
    });
  }

  test('never shows text taken from the URL beside its own notice', async ({ page }) => {
    await openForgotPassword(page, {
      default_method: 'email_or_username',
      email: 'jack@example.com',
      reason: 'password_change_required',
      notice: 'Your account is locked. Call support at 555-0100.',
      message: 'Your account is locked. Call support at 555-0100.',
    });

    await expect(page.getByRole('status').filter({ hasText: passwordChangeNotice })).toBeVisible();
    await expect(page.getByText(/Call support/)).toHaveCount(0);
  });
});

test.describe('forgot password identifier', () => {
  test('accepts a username and sends it as the username', async ({ page }) => {
    await page.route('**/auth/password/reset', (route) =>
      route.fulfill({ headers: corsHeaders, json: {} }),
    );
    await openForgotPassword(page, { default_method: 'email_or_username' });

    await identifier(page).fill('jack_r');
    await expect(sendButton(page)).toBeEnabled();

    const reset = page.waitForRequest('**/auth/password/reset');
    await sendButton(page).click();
    expect((await reset).postDataJSON()).toMatchObject({ username: 'jack_r' });
  });

  test('enables the button for a prefilled username without typing', async ({ page }) => {
    await openForgotPassword(page, { default_method: 'email_or_username', username: 'jack_r' });

    await expect(identifier(page)).toHaveValue('jack_r');
    await expect(sendButton(page)).toBeEnabled();
  });
});

test.describe('forgot password empty identifier', () => {
  test('disables the button once a prefilled identifier is cleared', async ({ page }) => {
    await openForgotPassword(page, { default_method: 'email_or_username', email: 'jack@example.com' });
    await expect(sendButton(page)).toBeEnabled();

    await identifier(page).fill('');

    await expect(sendButton(page)).toBeDisabled();
  });

  test('disables the button after typing and deleting on an empty form', async ({ page }) => {
    await openForgotPassword(page, { default_method: 'email_or_username' });

    await identifier(page).pressSequentially('j');
    await expect(sendButton(page)).toBeEnabled();
    await identifier(page).press('Backspace');

    await expect(sendButton(page)).toBeDisabled();
  });

  test('disables the button once a prefilled phone number is cleared', async ({ page }) => {
    await openForgotPassword(page, { default_method: 'phone', phone: '+447700900123' });
    await expect(sendButton(page)).toBeEnabled();

    await page.locator('input#phone').fill('');

    await expect(sendButton(page)).toBeDisabled();
  });
});

test.describe('forgot password phone', () => {
  test('shows a phone number from the URL and sends it', async ({ page }) => {
    await page.route('**/auth/password/reset', (route) => route.fulfill({ headers: corsHeaders, json: {} }));
    await openForgotPassword(page, { default_method: 'phone', phone: '+447700900123' });

    const field = page.locator('input#phone');
    await expect(field).toHaveValue(/^\+44[\d\s]+$/);
    expect((await field.inputValue()).replace(/\D/g, '')).toBe('447700900123');
    await expect(sendButton(page)).toBeEnabled();

    const reset = page.waitForRequest((request) => request.url().endsWith('/auth/password/reset') && request.method() === 'POST');
    await sendButton(page).click();
    expect((await reset).postDataJSON()).toMatchObject({ phone: '+447700900123' });
  });
});
