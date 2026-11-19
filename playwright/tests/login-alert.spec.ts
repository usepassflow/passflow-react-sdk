import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

// Never 6006 or 6007: another project's Storybook answers there.
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-loginalert--${id}&viewMode=story`);
  await waitForStoryRendered(page);
  const storyRoot = page.locator('#storybook-root');
  await expect(storyRoot).toBeVisible();
  await expect(storyRoot).not.toBeEmpty();
};

test.describe('LoginAlert', () => {
  test('info is a neutral note announced as a status, not an alert', async ({ page }) => {
    await openStory(page, 'info');
    const note = page.getByRole('status');
    await expect(note).toHaveText(
      'You must change your password before you can sign in. Reset your password to continue.',
    );
    await expect(note).toHaveClass(/passflow-login-screen-note/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('info is styled by the login screen stylesheet', async ({ page }) => {
    await openStory(page, 'info');
    const note = page.getByRole('status');
    await expect(note).toBeVisible();

    const style = await note.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, textAlign: computed.textAlign, padding: computed.paddingTop };
    });
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.textAlign).toBe('center');
    expect(style.padding).not.toBe('0px');
  });

  test('error is announced as an alert with its warning icon', async ({ page }) => {
    await openStory(page, 'error-tone');
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText("We couldn't send the reset instructions. Try again later.");
    await expect(alert).toHaveClass(/passflow-form-error/);
    await expect(alert.locator('.icon-warning')).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
