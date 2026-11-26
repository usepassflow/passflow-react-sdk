import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { corsHeaders, installEnrollmentBoundary, onState, screen, signInToFactor } from './enrollment-contract.helpers';
import { tokens } from './email-verification.helpers';
import { begin, endpoint, enterSetupCode, failure, finish, ok, paths, setupData } from './enrollment-runtime.helpers';
import { waitForStoryRendered } from './storybook.helpers';

// "Trust this device" shows unless the server says this sign-in may not ask for it.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const storybookUrl = process.env.STORYBOOK_URL ?? 'http://localhost:6107';
const trust = (page: Page) => page.getByRole('switch', { name: 'Trust this device' });

const cases = [
  { name: 'false hides it', field: { device_trust_available: false }, shown: false },
  { name: 'true shows it', field: { device_trust_available: true }, shown: true },
  { name: 'absent shows it', field: {}, shown: true },
] as const;

const landOnVerify = async (page: Page, field: Record<string, unknown>) => {
  await installEnrollmentBoundary(page);
  await onState(page, (route) =>
    route.fulfill({ headers: corsHeaders, json: { enrollment: 'verify', totp_digits: 6, ...field } }),
  );
  const verifies: Array<Record<string, unknown>> = [];
  await page.route('**/auth/2fa/verify', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    verifies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ headers: corsHeaders, json: tokens() });
  });
  await signInToFactor(page);
  await expect(screen(page, 'verify')).toBeVisible();
  return verifies;
};

for (const { name, field, shown } of cases) {
  test(`device_trust_available ${name} on the sign-in code and recovery screens`, async ({ page }) => {
    await landOnVerify(page, field);
    await expect(page.getByRole('textbox', { name: 'Verification code', exact: true })).toBeVisible();
    await expect(trust(page)).toHaveCount(shown ? 1 : 0);

    await page.getByRole('button', { name: 'Use recovery code', exact: true }).click();
    await expect(screen(page, 'recovery')).toBeVisible();
    await expect(trust(page)).toHaveCount(shown ? 1 : 0);
  });
}

test('with device trust unavailable, a code asks for no trust', async ({ page }) => {
  const verifies = await landOnVerify(page, { device_trust_available: false });
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).pressSequentially('123456');
  await expect.poll(() => verifies.length).toBe(1);
  expect(verifies[0]).not.toHaveProperty('trust_device');
});

test('the code screen after enrolling here keeps the server answer: false hides it', async ({ page }) => {
  await installEnrollmentBoundary(page);
  await onState(page, (route) =>
    route.fulfill({ headers: corsHeaders, json: { enrollment: 'direct', device_trust_available: false } }),
  );
  await endpoint(page, paths.begin, [ok(setupData())]);
  await endpoint(page, paths.confirm, [ok({ enabled: true, recovery_codes: ['A1B2-C3D4'] })]);
  // The held code went stale on the codes screen, so the sign-in asks for a fresh one.
  await endpoint(page, paths.verify, [failure('error.api.request.2fa_code.invalid', 401)]);
  await signInToFactor(page);
  await begin(page);
  await enterSetupCode(page);
  await finish(page);
  await expect(screen(page, 'verify')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Verification code', exact: true })).toBeVisible();
  await expect(trust(page)).toHaveCount(0);
});

test('the catalog has the code screen without the trust option', async ({ page }) => {
  await page.goto(`${storybookUrl}/iframe.html?id=components-loginscreen--two-factor-code-totp-no-trust-device&viewMode=story`);
  await waitForStoryRendered(page);
  await expect(page.getByRole('textbox', { name: 'Verification code', exact: true })).toBeVisible();
  await expect(trust(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use recovery code', exact: true })).toBeVisible();
});
