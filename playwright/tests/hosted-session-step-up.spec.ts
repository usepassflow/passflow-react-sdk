import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { appOrigin, setupPasswordless } from './passwordless-approval.helpers';

// The hosted login page under an OIDC parent: the session exchange answers 403 with the server's challenge body, and
// the page steps the hosted session up, shows the sign-in form, or says why it cannot.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const appId = 'hosted-step-up-app';
const parent = 'parent-step-up';
const callback = 'https://rp.example.test/callback';
const unsatisfiableCopy =
  "This account can't reach the security level this app asks for. Add a passkey on this device, or contact the app.";

type Challenge = { acr_values?: string; max_age?: number; available_factors?: string[]; sign_in_required?: boolean };

/** The server's whole 403 when only a fresh sign-in can meet the requirement. */
const signInAgain = { available_factors: [], error: 'upgrade_required', sign_in_required: true };

const onHostedLogin = async (
  page: Page,
  refusal: Challenge,
  retry: { status: number; json: unknown } = { status: 401, json: {} },
  options: { settingsAfterRefusal?: boolean } = {},
) => {
  await setupPasswordless(page, { pkce: false, createTenant: options.settingsAfterRefusal });
  await page.route(`**/oidc/requests/${parent}`, (route) =>
    route.fulfill({ json: { request_id: parent, app_name: 'Acme Portal', redirect_uri: callback, state: 'rp-state' } }),
  );
  let refused: () => void = () => undefined;
  const refusalSent = new Promise<void>((resolve) => {
    refused = resolve;
  });
  if (options.settingsAfterRefusal) {
    // The app's settings answer after the refusal, while the step-up dialog is open, and change a field core reads.
    await page.route('**/app/settings', async (route) => {
      await refusalSent;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fallback();
    });
  }
  let exchanges = 0;
  await page.route('**/auth/session/exchange', async (route) => {
    exchanges += 1;
    if (exchanges === 1) {
      await route.fulfill({ status: 403, json: { error: 'upgrade_required', ...refusal } });
      refused();
    } else await route.fulfill(retry);
  });
  const stepUps: string[] = [];
  await page.route('**/auth/session/upgrade**', (route) => {
    stepUps.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 204, body: '' });
  });
  const landings: string[] = [];
  await page.route(`${callback}**`, async (route) => {
    landings.push(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<h1>Relying party</h1>' });
  });
  await page.goto(`${appOrigin}/hosted/signin?appid=${appId}&parent_challenge_id=${parent}`);
  return { exchanges: () => exchanges, stepUps, landings };
};

const dialog = (page: Page) => page.getByTestId('upgrade-dialog');
const signInForm = (page: Page) => page.getByLabel('Email', { exact: true });

const expectNoChooser = async (page: Page) => {
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('[data-testid^="upgrade-dialog-factor-"]')).toHaveCount(0);
};

test('(a) sign-in required shows the sign-in form, no chooser', async ({ page }) => {
  const hosted = await onHostedLogin(page, signInAgain);

  await expect(signInForm(page)).toBeVisible();
  await expectNoChooser(page);
  expect(hosted.stepUps).toEqual([]);
  expect(hosted.exchanges()).toBe(1);
  expect(hosted.landings).toEqual([]);
});

test('(b) a level no factor of this account reaches shows why: no chooser, no form, nothing to the app', async ({ page }) => {
  const hosted = await onHostedLogin(page, { acr_values: '3', available_factors: [], sign_in_required: false });

  await expect(page.getByText(unsatisfiableCopy, { exact: true })).toBeVisible();
  await expectNoChooser(page);
  await expect(signInForm(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(hosted.stepUps).toEqual([]);
  expect(hosted.exchanges()).toBe(1);
  expect(hosted.landings).toEqual([]);
});

test('(c) a TOTP-only account at level 2 is offered its authenticator and recovery codes, never a passkey', async ({
  page,
}) => {
  await onHostedLogin(page, { acr_values: '2', available_factors: ['totp', 'recovery_codes'], sign_in_required: false });

  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByTestId('upgrade-dialog-alternatives').click();
  const factors = dialog(page).locator('[data-testid^="upgrade-dialog-factor-"]');
  await expect(factors).toHaveCount(2);
  await expect(factors.nth(0)).toHaveAttribute('data-testid', 'upgrade-dialog-factor-totp');
  await expect(factors.nth(1)).toHaveAttribute('data-testid', 'upgrade-dialog-factor-recovery_codes');
  await expect(dialog(page).getByTestId('upgrade-dialog-factor-passkey')).toHaveCount(0);
  await expect(signInForm(page)).toHaveCount(0);
});

test('the step-up dialog stays open when the app settings arrive after the refusal', async ({ page }) => {
  const hosted = await onHostedLogin(
    page,
    { acr_values: '2', available_factors: ['totp', 'recovery_codes'], sign_in_required: false },
    { status: 200, json: { redirect_url: `${callback}?code=rp-code&state=rp-state` } },
    { settingsAfterRefusal: true },
  );

  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog(page)).toBeVisible();
  expect(hosted.landings).toEqual([]);
  await dialog(page).getByTestId('upgrade-dialog-code').fill('123456');
  await dialog(page).getByTestId('upgrade-dialog-submit').click();

  await expect(page.getByRole('heading', { name: 'Relying party' })).toBeVisible();
  expect(hosted.stepUps).toEqual(['/auth/session/upgrade']);
  expect(hosted.exchanges()).toBe(2);
  expect(hosted.landings).toEqual([`${callback}?code=rp-code&state=rp-state`]);
});

test('(d) an older server that names no factor is sign-in required: the form, never unmet_authentication_requirements', async ({
  page,
}) => {
  const hosted = await onHostedLogin(page, { acr_values: '2', available_factors: [] });

  await expect(signInForm(page)).toBeVisible();
  await expectNoChooser(page);
  await page.waitForTimeout(300);
  expect(hosted.landings).toEqual([]);
  expect(page.url()).not.toContain('unmet_authentication_requirements');
  expect(hosted.exchanges()).toBe(1);
});

test('a rate-limited step-up says how long to wait, with no form and nothing to the app', async ({ page }) => {
  const hosted = await onHostedLogin(page, { acr_values: '2', available_factors: ['totp'], sign_in_required: false });
  await page.route('**/auth/session/upgrade', (route) =>
    route.fulfill({ status: 429, headers: { 'retry-after': '30' }, json: { error: 'Slow down.' } }),
  );
  await dialog(page).getByTestId('upgrade-dialog-code').fill('123456');
  await dialog(page).getByTestId('upgrade-dialog-submit').click();

  await expect(page.getByText('Too many attempts. Try again in 30 seconds.', { exact: true })).toBeVisible();
  await expectNoChooser(page);
  await expect(signInForm(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(hosted.exchanges()).toBe(1);
  expect(hosted.landings).toEqual([]);
});

test('a step-up that succeeds tries the exchange once more and goes back to the app', async ({ page }) => {
  const hosted = await onHostedLogin(
    page,
    { acr_values: '2', available_factors: ['totp'], sign_in_required: false },
    { status: 200, json: { redirect_url: `${callback}?code=rp-code&state=rp-state` } },
  );
  await dialog(page).getByTestId('upgrade-dialog-code').fill('123456');
  await dialog(page).getByTestId('upgrade-dialog-submit').click();

  await expect(page.getByRole('heading', { name: 'Relying party' })).toBeVisible();
  expect(hosted.stepUps).toEqual(['/auth/session/upgrade']);
  expect(hosted.exchanges()).toBe(2);
  expect(hosted.landings).toEqual([`${callback}?code=rp-code&state=rp-state`]);
});
