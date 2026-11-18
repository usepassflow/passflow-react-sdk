import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { land, runtime } from './enrollment-runtime.helpers';

// Never 6006 or 6007: another project's Storybook answers there.
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=${id}&viewMode=story`);
  const storyRoot = page.locator('#storybook-root');
  await expect(storyRoot).toBeVisible();
  await expect(storyRoot).not.toBeEmpty();
};

test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

test('step-up dialog takes an eight-digit authenticator code', async ({ page }) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-upgradedialog--challenge&viewMode=story`);
  await expect(page.getByRole('dialog')).toBeVisible();
  const code = page.getByTestId('upgrade-dialog-code');

  await code.pressSequentially('12345678');

  await expect(code).toHaveValue('12345678');
  await expect(code).toHaveAttribute('maxlength', '8');
});

test('device-verify second factor hint names no fixed code length', async ({ page }) => {
  await openStory(page, 'components-loginscreen--device-second-factor');
  await expect(page.getByLabel('Authenticator code')).toBeVisible();

  await expect(page.getByText('Enter the code from your authenticator app.', { exact: true })).toBeVisible();
  await expect(page.getByText(/\d+-dig[i]t/)).toHaveCount(0);
});

test('recovery code field shows the twelve-character code format', async ({ page }) => {
  await runtime(page, 'verify');
  await land(page, 'verify');
  await page.getByRole('button', { name: 'Use recovery code', exact: true }).click();

  await expect(page.getByRole('textbox', { name: 'Recovery Code', exact: true })).toHaveAttribute(
    'placeholder',
    'XXXX-XXXX-XXXX',
  );
});
