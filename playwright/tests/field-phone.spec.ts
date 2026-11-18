import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';

// Never 6006 or 6007: another project's Storybook answers there.
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-fieldphone--${id}&viewMode=story`);
  const storyRoot = page.locator('#storybook-root');
  await expect(storyRoot).toBeVisible();
  const input = page.getByLabel('Phone', { exact: true });
  await expect(input).toBeVisible();
  return input;
};

test.use({ timezoneId: 'America/New_York' });

test.describe('FieldPhone starting value', () => {
  test('shows a prefilled number with its country selected', async ({ page }) => {
    const input = await openStory(page, 'prefilled');
    await expect(input).toHaveValue(/^\+44[\d\s]+$/);
    expect((await input.inputValue()).replace(/\D/g, '')).toBe('447700900123');
    await expect(page.getByRole('button', { name: 'Select country, current GB' })).toBeVisible();
  });

  test('starts empty without a value, on the country of the time zone', async ({ page }) => {
    const input = await openStory(page, 'empty');
    expect((await input.inputValue()).replace(/\D/g, '')).toBe('1');
    await expect(page.getByRole('button', { name: 'Select country, current US' })).toBeVisible();
  });
});
