import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { appOrigin } from './enrollment-contract.helpers';
import appSettings from './responses/app-settings.json';

// An app's own page with no PassflowFlow, started a hosted sign-in in SDK mode (`authRedirect()`), and the answer came
// back as `?code=&state=`. The proof key the page wrote before it left is in sessionStorage.
const accountUrl = appOrigin + '/account';
const failedCopy = 'Sign-in failed. Start again.';
const api = 'http://localhost:5432';

const seedSlot = (page: Page, state: string) =>
  page.addInitScript(
    ([slot]) => {
      if (new URLSearchParams(window.location.search).has('code')) window.sessionStorage.setItem('passflow_oidc_pkce', slot);
    },
    [
      JSON.stringify({
        verifier: `verifier-${'v'.repeat(43)}`,
        state,
        clientId: 'test_app_id',
        redirectUri: accountUrl,
        scopes: ['openid'],
        expiresAt: Date.now() + 600_000,
      }),
    ] as const,
  );

const sdkModeApp = async (page: Page) => {
  await page.route('**/app/settings', (route) =>
    route.fulfill({ json: { ...appSettings, pkce_enabled: true, public_client: true } }),
  );
  let exchanges = 0;
  await page.route('**/oidc/token', (route) => {
    exchanges += 1;
    return route.fulfill({ status: 500, json: {} });
  });
  await page.route(`${api}/oidc/authorize**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Hosted sign-in</h1>' }),
  );
  return { exchanges: () => exchanges };
};

test('a return whose state is not this sign-in tells the user, and Sign in again starts a new sign-in', async ({ page }) => {
  const app = await sdkModeApp(page);
  await seedSlot(page, 'state-this-page-wrote');
  await page.goto(`${accountUrl}?code=answer-code&state=state-of-another-sign-in`);
  await expect(page.getByText(failedCopy, { exact: true })).toBeVisible();
  expect(app.exchanges()).toBe(0);
  expect(await page.evaluate(() => window.localStorage.getItem('access'))).toBeNull();

  await page.getByRole('button', { name: 'Sign in again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hosted sign-in' })).toBeVisible();
  const authorize = new URL(page.url());
  expect(authorize.pathname).toBe('/oidc/authorize');
  expect(authorize.searchParams.get('redirect_uri')).toBe(`${appOrigin}/`);

  // sessionStorage belongs to the app's origin, so read it back there; a load with no code takes no return path.
  await page.goto(accountUrl);
  expect(await page.evaluate(() => window.sessionStorage.getItem('passflow_return_to'))).toBe('/account');
});

test('a page with no return shows the app as it is', async ({ page }) => {
  await sdkModeApp(page);
  await page.goto(accountUrl);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText(failedCopy, { exact: true })).toHaveCount(0);
});
