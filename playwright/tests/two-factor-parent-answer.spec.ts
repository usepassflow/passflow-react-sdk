import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { corsHeaders, installEnrollmentBoundary, onState, screen, signInToFactor } from './enrollment-contract.helpers';
import { errorBody } from './passwordless-approval.helpers';

// A sign-in under an OIDC parent finishes its second factor with no tokens: the verify answer names where the browser
// goes next, a redirect or a form post to the relying party.
test.use({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 715, height: 900 } });

const parent = 'parent-2fa';
const callback = 'https://rp.example.test/callback';

type Landing = { method: string; url: string; body: string | null };

const underParent = async (page: Page, path: '/auth/2fa/verify' | '/auth/2fa/recovery', answer: unknown) => {
  await installEnrollmentBoundary(page);
  await onState(page, (route) => route.fulfill({ headers: corsHeaders, json: { enrollment: 'verify', totp_digits: 6 } }));
  await page.route('**/oidc/requests/**', (route) =>
    route.fulfill({ headers: corsHeaders, json: { request_id: parent, redirect_uri: callback, state: 'rp-state' } }),
  );
  await page.route('**/auth/session/exchange', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: corsHeaders })
      : route.fulfill({
          status: 401,
          headers: corsHeaders,
          json: errorBody('error.session.none', 'No hosted session', 401, '/auth/session/exchange'),
        }),
  );
  const factorBodies: Array<Record<string, unknown>> = [];
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    factorBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ headers: corsHeaders, json: answer });
  });
  const landings: Landing[] = [];
  await page.route(`${callback}**`, async (route) => {
    landings.push({ method: route.request().method(), url: route.request().url(), body: route.request().postData() });
    await route.fulfill({ contentType: 'text/html', body: '<h1>Relying party</h1>' });
  });
  await signInToFactor(page, `?parent_challenge_id=${parent}`);
  await expect(screen(page, 'verify')).toBeVisible();
  return { factorBodies, landings };
};

const expectAtRelyingParty = async (page: Page, landings: Landing[]) => {
  await expect(page.getByRole('heading', { name: 'Relying party' })).toBeVisible();
  // One navigation only: nothing after the answer may replace it.
  await page.waitForTimeout(300);
  expect(landings).toHaveLength(1);
  expect(new URL(page.url()).origin + new URL(page.url()).pathname).toBe(callback);
};

test('a code answered with redirect_url goes to the relying party', async ({ page }) => {
  const { factorBodies, landings } = await underParent(page, '/auth/2fa/verify', {
    redirect_url: `${callback}?code=rp-code&state=rp-state`,
  });
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).pressSequentially('123456');

  await expectAtRelyingParty(page, landings);
  expect(factorBodies[0]).toMatchObject({ parent_challenge_id: parent });
  expect(landings[0]).toMatchObject({ method: 'GET', url: `${callback}?code=rp-code&state=rp-state` });
});

test('a code answered with form_post posts the fields to the relying party', async ({ page }) => {
  const { landings } = await underParent(page, '/auth/2fa/verify', {
    form_post: { action: callback, fields: { code: 'rp-code', state: 'rp-state' } },
  });
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).pressSequentially('123456');

  await expectAtRelyingParty(page, landings);
  expect(landings[0]?.method).toBe('POST');
  expect(new URLSearchParams(landings[0]?.body ?? '')).toEqual(new URLSearchParams({ code: 'rp-code', state: 'rp-state' }));
});

test('a recovery code answered with redirect_url goes to the relying party', async ({ page }) => {
  const { factorBodies, landings } = await underParent(page, '/auth/2fa/recovery', {
    redirect_url: `${callback}?code=rp-code&state=rp-state`,
  });
  await page.getByRole('button', { name: 'Use recovery code', exact: true }).click();
  await page.getByRole('textbox', { name: 'Recovery Code', exact: true }).fill('ABCD-EFGH-IJKL');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();

  await expectAtRelyingParty(page, landings);
  expect(factorBodies[0]).toMatchObject({ parent_challenge_id: parent });
});
