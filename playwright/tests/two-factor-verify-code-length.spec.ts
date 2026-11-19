import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { corsHeaders, installEnrollmentBoundary, onState, screen, signInToFactor } from './enrollment-contract.helpers';
import { tokens } from './email-verification.helpers';

// The sign-in verify screen sizes its code entry from the enrolment the server reports for the pending sign-in.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const boxes = (page: Page) => screen(page, 'verify').locator('.passflow-field-otp-slots .passflow-field-otp');
const codeField = (page: Page) => page.getByRole('textbox', { name: 'Verification code', exact: true });

/** Lands on the verify screen for an account whose authenticator gives `lengths[n]` digits on the n-th sign-in. */
const landOnVerify = async (page: Page, lengths: Array<6 | 8>) => {
  await installEnrollmentBoundary(page, lengths[0]);
  let reads = 0;
  await onState(page, (route) =>
    route.fulfill({
      headers: corsHeaders,
      json: { enrollment: 'verify', totp_digits: lengths[Math.min(reads++, lengths.length - 1)] },
    }),
  );
  const verified: string[] = [];
  await page.route('**/auth/2fa/verify', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    verified.push((route.request().postDataJSON() as { code: string }).code);
    await route.fulfill({ headers: corsHeaders, json: tokens() });
  });
  await signInToFactor(page);
  await expect(screen(page, 'verify')).toBeVisible();
  return verified;
};

for (const length of [6, 8] as const) {
  test(`a ${length}-digit enrolment gets ${length} code boxes on the sign-in verify screen`, async ({ page }) => {
    await landOnVerify(page, [length]);

    await expect(boxes(page)).toHaveCount(length);
    await expect(codeField(page)).toHaveAttribute('maxlength', String(length));
    await expect(page.getByText(`Enter the ${length}-dig${'i'}t code from your authenticator app`)).toBeVisible();
  });
}

test('an eight-digit code keeps Verify disabled at six and submits by itself at eight', async ({ page }) => {
  const verified = await landOnVerify(page, [8]);
  const verify = page.getByRole('button', { name: 'Verify', exact: true });

  await codeField(page).pressSequentially('123456');
  await expect(verify).toBeDisabled();
  expect(verified).toEqual([]);

  await codeField(page).pressSequentially('78');
  await expect.poll(() => verified).toEqual(['12345678']);
});

test('the next sign-in takes its own length, not the last one', async ({ page }) => {
  await landOnVerify(page, [8, 6]);
  await expect(boxes(page)).toHaveCount(8);

  await signInToFactor(page);
  await expect(screen(page, 'verify')).toBeVisible();
  await expect(boxes(page)).toHaveCount(6);
  await expect(codeField(page)).toHaveAttribute('maxlength', '6');
});
