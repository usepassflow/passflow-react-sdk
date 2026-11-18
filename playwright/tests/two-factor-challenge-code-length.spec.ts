import type { Page, Route } from '@playwright/test';
import { expect, test } from '../fixture';
import { jwt } from './email-verification.helpers';
import { appOrigin, corsHeaders } from './enrollment-contract.helpers';

// An app's own page with the SDK's TwoFactorChallenge (src/dev-two-factor-challenge.tsx): the challenge names the
// authenticator's code length, and the code field, Verify and the auto-submit follow it.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const challengeUrl = `${appOrigin}/two-factor-challenge`;

const challengeApi = async (page: Page, challenge: Record<string, unknown>) => {
  const verified: string[] = [];
  await page.route('**/v2/auth/2fa/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { ...corsHeaders, 'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*' },
      });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path === '/v2/auth/2fa/challenge') {
      await route.fulfill({
        headers: corsHeaders,
        json: { challenge_id: 'totp-challenge', method: 'totp', alternative_methods: [], ...challenge },
      });
      return;
    }
    if (path === '/v2/auth/2fa/verify') {
      verified.push(String((request.postDataJSON() as { response?: unknown }).response));
      await route.fulfill({
        headers: corsHeaders,
        json: {
          access_token: jwt({ type: 'access', aud: ['test_app_id'] }),
          refresh_token: jwt({ type: 'refresh', aud: ['test_app_id'] }),
        },
      });
      return;
    }
    await route.fulfill({ status: 501, headers: corsHeaders, json: { error: 'Not mocked' } });
  });
  return verified;
};

const codeField = (page: Page) => page.getByRole('textbox', { name: 'Enter the verification code' });
const boxes = (page: Page) => page.locator('.passflow-field-otp-slots .passflow-field-otp');
const verifyButton = (page: Page) => page.getByRole('button', { name: 'Verify', exact: true });
// Longer than the form's auto-submit delay.
const pastAutoSubmitDelay = (page: Page) => page.waitForTimeout(400);

test('a challenge with no code length shows six boxes', async ({ page }) => {
  await challengeApi(page, {});
  await page.goto(challengeUrl);

  await expect(codeField(page)).toBeVisible();
  await expect(boxes(page)).toHaveCount(6);
  await expect(codeField(page)).toHaveAttribute('maxlength', '6');
});

test('an eight-digit authenticator shows eight boxes', async ({ page }) => {
  await challengeApi(page, { totp_digits: 8 });
  await page.goto(challengeUrl);

  await expect(boxes(page)).toHaveCount(8);
  await expect(codeField(page)).toHaveAttribute('maxlength', '8');
});

test('Verify stays disabled until all eight digits are in', async ({ page }) => {
  await challengeApi(page, { totp_digits: 8 });
  await page.goto(challengeUrl);

  await codeField(page).pressSequentially('123456');
  await expect(verifyButton(page)).toBeDisabled();
  await codeField(page).pressSequentially('7');
  await expect(verifyButton(page)).toBeDisabled();
  await codeField(page).pressSequentially('8');
  await expect(verifyButton(page)).toBeEnabled();
});

test('a full code submits by itself, once, and six digits do not', async ({ page }) => {
  const verified = await challengeApi(page, { totp_digits: 8 });
  await page.goto(challengeUrl);

  await codeField(page).pressSequentially('123456');
  await pastAutoSubmitDelay(page);
  expect(verified).toEqual([]);

  await codeField(page).pressSequentially('78');
  await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
  await pastAutoSubmitDelay(page);
  expect(verified).toEqual(['12345678']);
});

test('a code completed twice within the delay submits only the last one', async ({ page }) => {
  const verified = await challengeApi(page, { totp_digits: 8 });
  await page.goto(challengeUrl);

  await codeField(page).fill('12345678');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('9');

  await expect(page.getByText('Signed in', { exact: true })).toBeVisible();
  await pastAutoSubmitDelay(page);
  expect(verified).toEqual(['12345679']);
});
