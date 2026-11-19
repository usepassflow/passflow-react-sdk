import type { Page, Route } from '@playwright/test';
import { expect, test } from '../fixture';
import { appOrigin, corsHeaders, screen } from './enrollment-contract.helpers';
import { jwt } from './email-verification.helpers';
import { enterSetupCode, ok, recoveryCodes, type Reply, setupData } from './enrollment-runtime.helpers';

// An app's own page with no PassflowFlow: a signed-in user and the one drop-in two-factor setup.
const accountUrl = appOrigin + '/account';
const paths = { status: '/user/2fa/status', begin: '/user/2fa/setup/begin', confirm: '/user/2fa/setup/confirm' };
const enrolledCopy = 'Two-factor authentication is on for your account.';

test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const signedIn = (page: Page) =>
  page.addInitScript(
    ([access, refresh, id]) => {
      window.localStorage.setItem('access', access);
      window.localStorage.setItem('refresh', refresh);
      window.localStorage.setItem('id_token', id);
    },
    [
      jwt({ type: 'access', aud: ['test_app_id'], email: 'user@example.com' }),
      jwt({ type: 'refresh' }),
      jwt({ type: 'id_token', email: 'user@example.com' }),
    ] as const,
  );

type Replies = Partial<Record<keyof typeof paths, Reply>>;

const userApi = async (page: Page, replies: Replies) => {
  const calls: string[] = [];
  await page.route('**/user/2fa/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { ...corsHeaders, 'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*' },
      });
      return;
    }
    const path = new URL(request.url()).pathname;
    calls.push(path);
    const key = (Object.keys(paths) as (keyof typeof paths)[]).find((name) => paths[name] === path);
    const reply = key ? replies[key] : undefined;
    await route.fulfill({
      status: reply?.status ?? (reply ? 200 : 501),
      headers: corsHeaders,
      json: reply?.json ?? { error: { id: 'error.not.implemented', message: 'Not mocked', status: 501 } },
    });
  });
  return calls;
};

const notEnrolled = ok({ enabled: false, policy: 'optional', recovery_codes_remaining: 0 });
const enrolled = ok({ enabled: true, policy: 'optional', recovery_codes_remaining: 8 });

test('a user already enrolled sees the enrolled state, not Get Started', async ({ page }) => {
  await signedIn(page);
  const calls = await userApi(page, { status: enrolled });
  await page.goto(accountUrl);
  await expect(screen(page, 'setup-enrolled')).toBeVisible();
  await expect(page.getByText(enrolledCopy, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toHaveCount(0);
  expect(calls.filter((path) => path !== paths.status)).toEqual([]);
});

test('a user not enrolled gets Get Started', async ({ page }) => {
  await signedIn(page);
  await userApi(page, { status: notEnrolled });
  await page.goto(accountUrl);
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeEnabled();
  await expect(screen(page, 'setup-enrolled')).toHaveCount(0);
});

test('a status that cannot be read falls back to Get Started', async ({ page }) => {
  await signedIn(page);
  await userApi(page, { status: { status: 500, json: { error: { id: 'error.unexpected', message: 'boom', status: 500 } } } });
  await page.goto(accountUrl);
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeEnabled();
});

test('enrolment under the optional policy runs start, QR, code and recovery codes, then shows the enrolled state', async ({
  page,
}) => {
  await signedIn(page);
  const calls = await userApi(page, {
    status: notEnrolled,
    begin: ok(setupData()),
    confirm: ok({ success: true, enabled: true, recovery_codes: recoveryCodes }),
  });
  await page.goto(accountUrl);
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await expect(page.getByRole('img', { name: '2FA QR Code', exact: true })).toBeVisible();
  await enterSetupCode(page);
  await expect(screen(page, 'recovery-codes').getByRole('listitem')).toHaveText(recoveryCodes);
  await page.getByRole('button', { name: "I've Saved These Codes", exact: true }).click();
  await expect(screen(page, 'setup-enrolled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toHaveCount(0);
  expect(calls.filter((path) => path !== paths.status)).toEqual([paths.begin, paths.confirm]);
});

test('an app with recovery codes off goes from the code straight to the enrolled state', async ({ page }) => {
  await signedIn(page);
  await userApi(page, {
    status: notEnrolled,
    begin: ok(setupData()),
    confirm: ok({ success: true, enabled: true, recovery_codes: [] }),
  });
  await page.goto(accountUrl);
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await enterSetupCode(page);
  await expect(screen(page, 'setup-enrolled')).toBeVisible();
  await expect(screen(page, 'recovery-codes')).toHaveCount(0);
});
