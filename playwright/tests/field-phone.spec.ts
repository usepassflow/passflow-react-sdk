import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

// Never 6006 or 6007: another project's Storybook answers there.
const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

const openStory = async (page: Page, id: string) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-fieldphone--${id}&viewMode=story`);
  await waitForStoryRendered(page);
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

const digits = (text: string) => text.replace(/\D/g, '');

test.describe('FieldPhone country switch', () => {
  test('reports the new number to the form once, and each keystroke once', async ({ page }) => {
    const input = await openStory(page, 'prefilled');
    const received = page.getByTestId('field-phone-story-value');
    const changes = page.getByTestId('field-phone-story-changes');
    await expect(received).toHaveText('+447700900123');
    await expect(changes).toHaveText('0');

    await page.getByRole('button', { name: 'Select country, current GB' }).click();
    await page.locator('[role="option"][title="Germany"]').click();

    await expect(page.getByRole('button', { name: 'Select country, current DE' })).toBeVisible();
    await expect(input).toHaveValue(/^\+49\s?$/);
    await expect(received).toHaveText(await input.inputValue());
    await expect(changes).toHaveText('1');

    await input.press('End');
    await input.pressSequentially('3');
    expect(digits(await input.inputValue())).toBe('493');
    await expect(received).toHaveText(await input.inputValue());
    await expect(changes).toHaveText('2');
  });
});
