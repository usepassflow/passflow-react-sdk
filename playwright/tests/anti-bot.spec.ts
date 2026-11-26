import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = 'http://localhost:6107';
const check = '[data-anti-bot-provider]'; // Public anti-bot container marker.
const vendorScript = 'script[data-passflow-anti-bot]';
const vendorUrl = /^https:\/\/(?:challenges\.cloudflare\.com\/|js\.hcaptcha\.com\/|www\.google\.com\/recaptcha\/)/;
const requests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const observed: string[] = [];
  requests.set(page, observed);
  page.on('request', (request) => {
    if (vendorUrl.test(request.url())) observed.push(request.url());
  });
  await page.route(vendorUrl, (route) => route.abort());
});

test.afterEach(async ({ page }) => {
  await expect(page.locator(vendorScript)).toHaveCount(0);
  expect(requests.get(page), 'vendor network requests').toEqual([]);
});

async function openStory(page: Page, id: string) {
  await page.goto(`${storybookUrl}/iframe.html?id=${id}&viewMode=story`);
  await waitForStoryRendered(page);
  return page.locator('#storybook-root');
}

// Storybook's a11y addon can audit the same frame concurrently. Retry only that
// transient error and a reloaded frame; real violations still fail.
async function audit(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { violations } = await new AxeBuilder({ page }).include('#storybook-root').analyze();
      expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
      return;
    } catch (error) {
      const transient =
        error instanceof Error &&
        (error.message.includes('Axe is already running') || error.message.includes('Execution context was destroyed'));
      if (!transient || attempt === 4) throw error;
      await page.waitForTimeout(200);
    }
  }
}

test('REQ-4 AntiBotCheck · BuiltinIdle · draws no check', async ({ page }) => {
  const root = await openStory(page, 'components-antibotcheck--builtin-idle');
  await expect(root.getByRole('region', { name: 'Anti-bot check' })).toBeVisible();
  await expect(root.locator(check)).toHaveCount(0);
  await expect(root.getByRole('status')).toHaveCount(0);
  await audit(page);
});

test('REQ-4 AntiBotCheck · BuiltinSolving · announces the browser check', async ({ page }) => {
  const root = await openStory(page, 'components-antibotcheck--builtin-solving');
  const status = root.getByRole('status');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('Checking your browser…');
  await audit(page);
});

type Vendor = 'turnstile' | 'hcaptcha' | 'recaptcha';
type FakeRecord = Record<'turnstile' | 'hcaptcha', { reset: number }> & {
  recaptcha: { actions: string[]; siteKeys: string[] };
};
const readVendorRecord = (page: Page) =>
  page.evaluate(() => (window as Window & { __passflowFakeAntiBot?: FakeRecord }).__passflowFakeAntiBot);

const storyVendors = [
  { id: 'turnstile', provider: 'turnstile', name: 'Turnstile', marker: 'Turnstile (fake)' },
  { id: 'h-captcha', provider: 'hcaptcha', name: 'HCaptcha', marker: 'hCaptcha (fake)' },
  { id: 'recaptcha', provider: 'recaptcha', name: 'Recaptcha', marker: undefined },
] as const satisfies ReadonlyArray<{ id: string; provider: Vendor; name: string; marker?: string }>;

for (const { id, provider, name, marker } of storyVendors) {
  test(`REQ-6 AntiBotCheck · ${name} · returns a fresh token for every request`, async ({ page }) => {
    const root = await openStory(page, `components-antibotcheck--${id}`);
    const widget = root.locator(`[data-anti-bot-provider="${provider}"]`);
    await expect(widget).toHaveCount(1);
    if (marker) await expect(widget.getByText(marker, { exact: true })).toBeVisible();
    const button = root.getByRole('button', { name: 'Get token' });
    const token = root.getByTestId('anti-bot-token'); // Story harness public output.
    await expect(button).toBeEnabled();
    await expect(token).toHaveText('No token yet');
    await button.click();
    await expect(token).toHaveText(`${provider}-token-1`);
    await button.click();
    await expect(token).toHaveText(`${provider}-token-2`);

    if (provider === 'recaptcha') {
      expect((await readVendorRecord(page))?.recaptcha).toMatchObject({
        actions: ['passflow_auth', 'passflow_auth'],
        siteKeys: ['recaptcha-site-key', 'recaptcha-site-key'],
      });
    } else {
      await expect.poll(async () => (await readVendorRecord(page))?.[provider].reset).toBe(2);
    }
    await audit(page);
  });
}

test('REQ-6 AntiBotCheck · VendorNotReady · cannot request a token before readiness', async ({ page }) => {
  const root = await openStory(page, 'components-antibotcheck--vendor-not-ready');
  await expect(root.getByRole('button', { name: 'Get token' })).toBeDisabled();
  await expect(root.getByTestId('anti-bot-token')).toHaveText('Check not ready');
  await audit(page);
});

for (const { id, name } of [
  { id: 'turnstile-token-refused', name: 'TurnstileTokenRefused' },
  { id: 'h-captcha-token-refused', name: 'HCaptchaTokenRefused' },
]) {
  test(`REQ-6 AntiBotCheck · ${name} · reports refusal rather than a token`, async ({ page }) => {
    const root = await openStory(page, `components-antibotcheck--${id}`);
    await root.getByRole('button', { name: 'Get token' }).click();
    await expect(root.getByTestId('anti-bot-token')).toHaveText('Token refused');
    if (name === 'HCaptchaTokenRefused') {
      await expect.poll(async () => (await readVendorRecord(page))?.hcaptcha.reset).toBe(1);
    }
    await audit(page);
  });
}

test('REQ-8 LoginScreen · CredentialsHumanOnlyCheckingBrowser · shows both credentials and solve status', async ({ page }) => {
  const root = await openStory(page, 'components-loginscreen--credentials-human-only-checking-browser');
  await expect(root.getByRole('button', { name: 'Signing in…' })).toHaveAttribute('aria-busy', 'true');
  await expect(root.getByRole('status').filter({ hasText: 'Checking your browser…' })).toBeVisible();
  await audit(page);
});

test('REQ-8 LoginScreen · CredentialsHumanOnlyTurnstile · presents the widget with the sign-in form', async ({ page }) => {
  const root = await openStory(page, 'components-loginscreen--credentials-human-only-turnstile');
  await expect(root.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(root.getByText('Turnstile (fake)', { exact: true })).toBeVisible();
  await audit(page);
});

test('REQ-8 LoginScreen · EmailAndPassword · does not add a check without antiBot props', async ({ page }) => {
  const root = await openStory(page, 'components-loginscreen--email-and-password');
  await expect(root.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(root.locator(check)).toHaveCount(0);
});
