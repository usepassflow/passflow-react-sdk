import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';

async function openStory(page: Page, id: string) {
  await page.goto(`${storybookUrl}/iframe.html?id=components-loginbutton--${id}&viewMode=story`);
  await waitForStoryRendered(page);
}

type Look = { backgroundColor: string; color: string; borderRadius: string; fontFamily: string; outlineColor: string };

/**
 * Resolves the given declarations on a probe element placed inside `host`, so the
 * expectation is the browser's own computed value of the host's variables.
 */
async function resolveInside(host: Locator, declarations: Partial<Record<keyof Look, string>>): Promise<Look> {
  return host.evaluate((element, decl) => {
    const probe = document.createElement('div');
    for (const [property, value] of Object.entries(decl)) {
      probe.style.setProperty(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), value as string);
    }
    probe.style.setProperty('outline-style', 'solid');
    element.append(probe);
    const style = getComputedStyle(probe);
    const look = {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderRadius: style.borderRadius,
      fontFamily: style.fontFamily,
      outlineColor: style.outlineColor,
    };
    probe.remove();
    return look;
  }, declarations);
}

/**
 * Focuses the button from the keyboard and waits for its look to settle on `expected`. Polled because
 * the fixture's reduced motion gives every `passflow-*` element a 0.01ms transition, so the focus ring
 * reads its start colour in the frame the focus lands.
 */
async function expectLook(page: Page, button: Locator, expected: Look) {
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderRadius: style.borderRadius,
          fontFamily: style.fontFamily,
          outlineColor: style.outlineColor,
        };
      }),
    )
    .toEqual(expected);
}

test.describe('LoginButton states', () => {
  test('signed out is named "Sign in" and enabled', async ({ page }) => {
    await openStory(page, 'signed-out');
    const button = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute('aria-busy');
  });

  test('signed in is named by the email and described as signing out', async ({ page }) => {
    await openStory(page, 'signed-in');
    const button = page.getByRole('button', { name: 'jane@example.com', exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toHaveAccessibleDescription('Sign out');
  });

  test('signing out keeps the email, and is disabled and busy', async ({ page }) => {
    await openStory(page, 'signing-out');
    const button = page.getByRole('button', { name: 'jane@example.com', exact: true });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-busy', 'true');
  });

  test("a wrapped child is the button and keeps its own props and content", async ({ page }) => {
    await openStory(page, 'wrapped-child');
    const buttons = page.locator('#storybook-root').getByRole('button');
    await expect(buttons).toHaveCount(1);
    const button = page.getByRole('button', { name: 'Continue with Passflow', exact: true });
    await expect(button).toHaveClass('app-button');
    await expect(button).toHaveAttribute('data-variant', 'ghost');
    await expect(button).toHaveText('Continue with Passflow');
  });

  for (const id of ['shadcn-hsl-triplet', 'shadcn-oklch-hex', 'shadcn-missing-variables']) {
    test(`${id} is named "Sign in"`, async ({ page }) => {
      await openStory(page, id);
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    });
  }
});

test.describe('LoginButton appearance="shadcn"', () => {
  test('reads an older theme whose variables are bare HSL triplets', async ({ page }) => {
    await openStory(page, 'shadcn-hsl-triplet');
    const host = page.getByTestId('shadcn-host');
    const expected = await resolveInside(host, {
      backgroundColor: 'hsl(var(--primary))',
      color: 'hsl(var(--primary-foreground))',
      borderRadius: 'var(--radius)',
      fontFamily: 'var(--font-sans)',
      outlineColor: 'hsl(var(--ring))',
    });
    const passflow = await resolveInside(host, { backgroundColor: 'var(--passflow-primary-color)' });
    expect(expected.backgroundColor).not.toBe(passflow.backgroundColor);

    await expectLook(page, page.getByRole('button', { name: 'Sign in' }), expected);
  });

  test('reads a Tailwind v4 theme whose variables are complete colours (oklch and hex)', async ({ page }) => {
    await openStory(page, 'shadcn-oklch-hex');
    const host = page.getByTestId('shadcn-host');
    const expected = await resolveInside(host, {
      backgroundColor: 'var(--primary)',
      color: 'var(--primary-foreground)',
      borderRadius: 'var(--radius)',
      fontFamily: 'var(--font-sans)',
      outlineColor: 'var(--ring)',
    });
    const passflow = await resolveInside(host, { backgroundColor: 'var(--passflow-primary-color)' });
    expect(expected.backgroundColor).not.toBe(passflow.backgroundColor);

    await expectLook(page, page.getByRole('button', { name: 'Sign in' }), expected);
  });

  test('falls back to the Passflow tokens and the inherited font when the variables are missing', async ({ page }) => {
    await openStory(page, 'shadcn-missing-variables');
    const host = page.getByTestId('shadcn-host');
    const hostFont = await host.evaluate((element) => getComputedStyle(element).fontFamily);
    const expected = await resolveInside(host, {
      backgroundColor: 'var(--passflow-primary-color)',
      color: 'var(--passflow-button-text-color)',
      borderRadius: 'var(--passflow-radius)',
      fontFamily: hostFont,
      outlineColor: 'var(--passflow-focus-color)',
    });
    const passflow = await resolveInside(host, { fontFamily: 'var(--passflow-font-family)' });
    expect(expected.fontFamily).not.toBe(passflow.fontFamily);

    await expectLook(page, page.getByRole('button', { name: 'Sign in' }), expected);
  });
});

test.describe('LoginButton appearance="shadcn" follows a theme switch', () => {
  const colours = (host: Locator) => resolveInside(host, { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' });

  /** Polled: the fixture's reduced motion leaves a 0.01ms transition on every `passflow-*` element. */
  const expectColours = async (button: Locator, expected: { backgroundColor: string; color: string }) => {
    await expect
      .poll(() =>
        button.evaluate((element) => {
          const style = getComputedStyle(element);
          return { backgroundColor: style.backgroundColor, color: style.color };
        }),
      )
      .toEqual(expected);
  };

  test('when <html> gets class="dark"', async ({ page }) => {
    await openStory(page, 'shadcn-theme-switch');
    const host = page.getByTestId('shadcn-host');
    const button = page.getByRole('button', { name: 'Sign in' });
    const light = await colours(host);
    await expectColours(button, { backgroundColor: light.backgroundColor, color: light.color });

    await page.evaluate(() => document.documentElement.classList.add('dark'));
    const dark = await colours(host);
    expect(dark.backgroundColor).not.toBe(light.backgroundColor);
    expect(dark.color).not.toBe(light.color);
    await expectColours(button, { backgroundColor: dark.backgroundColor, color: dark.color });
  });

  test('when prefers-color-scheme turns dark', async ({ page }) => {
    await openStory(page, 'shadcn-theme-switch');
    const host = page.getByTestId('shadcn-host');
    const button = page.getByRole('button', { name: 'Sign in' });
    const light = await colours(host);
    await expectColours(button, { backgroundColor: light.backgroundColor, color: light.color });

    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await colours(host);
    expect(dark.backgroundColor).not.toBe(light.backgroundColor);
    expect(dark.color).not.toBe(light.color);
    await expectColours(button, { backgroundColor: dark.backgroundColor, color: dark.color });
  });
});
