import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { jwt } from './email-verification.helpers';
import { appOrigin, setupPasswordless } from './passwordless-approval.helpers';

// The in-app step-up dialog on an app page (/step-up, see src/dev-step-up.tsx) whose own API answers 403 with the
// server's challenge body. The page mounts PassflowFlow under /step-up/auth unless `?flow=0`.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const appId = 'step-up-app';
const unsatisfiableCopy =
  "This account can't reach the security level this app asks for. Add a passkey on this device, or contact the app.";

type Challenge = { acr_values?: string; max_age?: number; available_factors?: string[]; sign_in_required?: boolean };
const challenge = (body: Challenge) => ({ status: 403, json: { error: 'upgrade_required', ...body } });
/** The server's whole 403 when only a fresh sign-in can meet the requirement. */
const signInAgain = { status: 403, json: { available_factors: [], error: 'upgrade_required', sign_in_required: true } };

/** How the page's last protected call settled: `sign-in-required`, else its status or the code it rejected with. */
const protectedSettled = (page: Page) => page.evaluate(() => document.documentElement.dataset.protectedResult ?? '');

const dialog = (page: Page) => page.getByTestId('upgrade-dialog');

const signedInOnStepUp = async (
  page: Page,
  protectedReplies: Array<{ status: number; json: unknown }>,
  options: { flow?: boolean } = {},
) => {
  await setupPasswordless(page, { pkce: false });
  await page.addInitScript(
    ({ access, refresh }) => {
      localStorage.setItem('access', access);
      localStorage.setItem('refresh', refresh);
    },
    {
      access: jwt({ type: 'access', aud: [appId], scopes: ['openid'] }),
      refresh: jwt({ type: 'refresh', aud: [appId] }),
    },
  );
  let calls = 0;
  await page.route('**/api/protected', async (route) => {
    const reply = protectedReplies[Math.min(calls++, protectedReplies.length - 1)];
    await route.fulfill(reply as { status: number; json: unknown });
  });
  await page.goto(`${appOrigin}/step-up${options.flow === false ? '?flow=0' : ''}`);
  await expect(page.getByRole('button', { name: 'Load protected' })).toBeVisible();
  return { calls: () => calls };
};

const loadProtected = (page: Page) => page.getByRole('button', { name: 'Load protected' }).click();

/** The commit round of an in-app step-up: `POST /auth/refresh` carrying the proof. */
const commitReplies = async (
  page: Page,
  reply: (index: number) => { status: number; json: unknown; headers?: Record<string, string> },
) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/auth/refresh', async (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill(reply(bodies.length - 1));
  });
  return bodies;
};

const submitTotp = async (page: Page) => {
  await dialog(page).getByTestId('upgrade-dialog-code').fill('123456');
  await dialog(page).getByTestId('upgrade-dialog-submit').click();
};

test("lists exactly the server's factors, in its order, with the first selected", async ({ page }) => {
  await signedInOnStepUp(page, [challenge({ acr_values: '2', available_factors: ['recovery_codes', 'totp'] })]);
  await loadProtected(page);

  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByTestId('upgrade-dialog-alternatives').click();
  const factors = dialog(page).locator('[data-testid^="upgrade-dialog-factor-"]');
  await expect(factors).toHaveCount(2);
  await expect(factors.nth(0)).toHaveAttribute('data-testid', 'upgrade-dialog-factor-recovery_codes');
  await expect(factors.nth(1)).toHaveAttribute('data-testid', 'upgrade-dialog-factor-totp');
  await expect(factors.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog(page).getByTestId('upgrade-dialog-factor-passkey')).toHaveCount(0);
  // The recovery-code field, not the authenticator one.
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toHaveAttribute('maxlength', '16');
});

test('sign-in required closes the dialog and goes to the app sign-in route, with no retry', async ({ page }) => {
  const api = await signedInOnStepUp(page, [signInAgain]);
  await loadProtected(page);

  await expect(page).toHaveURL((url) => url.pathname === '/step-up/auth/signin');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => protectedSettled(page)).toBe('sign-in-required');
  expect(api.calls()).toBe(1);
});

test('sign-in required on an app with no sign-in route of its own goes to the hosted login', async ({ page }) => {
  await signedInOnStepUp(page, [signInAgain], { flow: false });
  await loadProtected(page);

  await expect(page).toHaveURL((url) => url.pathname.startsWith('/web') && url.searchParams.get('appId') === appId);
});

test('an older server that sends an empty list is sign-in required too', async ({ page }) => {
  await signedInOnStepUp(page, [challenge({ acr_values: '2', available_factors: [] })]);
  await loadProtected(page);

  await expect(page).toHaveURL((url) => url.pathname === '/step-up/auth/signin');
  await expect(dialog(page)).toHaveCount(0);
});

test('unsatisfiable shows why with a Close action, and goes nowhere', async ({ page }) => {
  const api = await signedInOnStepUp(page, [challenge({ acr_values: '3', available_factors: [], sign_in_required: false })]);
  await loadProtected(page);

  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText(unsatisfiableCopy, { exact: true })).toBeVisible();
  await expect(dialog(page).locator('[data-testid^="upgrade-dialog-factor-"]')).toHaveCount(0);
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL((url) => url.pathname === '/step-up');
  expect(api.calls()).toBe(1);
});

test('a rate-limited answer says how long to wait, and asks for no new code', async ({ page }) => {
  await signedInOnStepUp(page, [challenge({ acr_values: '2', available_factors: ['totp'] })]);
  const commits = await commitReplies(page, () => ({
    status: 429,
    headers: { 'retry-after': '30' },
    json: { error: { id: 'error.rate.limited', message: 'Slow down.' } },
  }));
  await loadProtected(page);
  await submitTotp(page);

  await expect(dialog(page).getByText('Too many attempts. Try again in 30 seconds.', { exact: true })).toBeVisible();
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(commits).toHaveLength(1);
});

test("a rate-limited answer with no wait shows the server's text", async ({ page }) => {
  await signedInOnStepUp(page, [challenge({ acr_values: '2', available_factors: ['totp'] })]);
  await commitReplies(page, () => ({ status: 429, json: { error: { id: 'error.rate.limited', message: 'Slow down.' } } }));
  await loadProtected(page);
  await submitTotp(page);

  await expect(dialog(page).getByText('Slow down.', { exact: true })).toBeVisible();
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toHaveCount(0);
});

test('insufficient offers Sign in again, which goes to the app sign-in route', async ({ page }) => {
  await signedInOnStepUp(page, [
    challenge({ acr_values: '2', available_factors: ['totp'] }),
    challenge({ acr_values: '3', available_factors: ['totp'] }),
  ]);
  await commitReplies(page, () => ({
    status: 200,
    json: {
      access_token: jwt({ type: 'access', aud: [appId], acr: '2' }),
      refresh_token: jwt({ type: 'refresh', aud: [appId] }),
    },
  }));
  await loadProtected(page);
  await submitTotp(page);

  const signInAgain = dialog(page).getByRole('button', { name: 'Sign in again', exact: true });
  await expect(signInAgain).toBeVisible();
  await signInAgain.click();
  await expect(page).toHaveURL((url) => url.pathname === '/step-up/auth/signin');
  await expect(dialog(page)).toHaveCount(0);
});

test('a requirement that no factor can meet any more closes the open chooser and says why', async ({ page }) => {
  const api = await signedInOnStepUp(page, [
    challenge({ acr_values: '2', available_factors: ['totp'] }),
    challenge({ acr_values: '3', available_factors: [], sign_in_required: false }),
  ]);
  await loadProtected(page);
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toBeVisible();

  // A second protected call joins the open step-up and raises it to a level this account cannot reach.
  void page.evaluate(() => fetch('/api/protected').catch(() => undefined));

  await expect(dialog(page).getByText(unsatisfiableCopy, { exact: true })).toBeVisible();
  await expect(dialog(page).getByTestId('upgrade-dialog-code')).toHaveCount(0);
  await expect(page).toHaveURL((url) => url.pathname === '/step-up');
  expect(api.calls()).toBe(2);
});
