import path from 'node:path';
import { expect, test } from '../fixture';
import { appOrigin, password, tokens } from './email-verification.helpers';
import appSettings from './responses/app-settings-default.json';

// The app page shows PassflowFlow while signed out and returns to its own address, written in full, after a sign-in.
const pageUrl = `${appOrigin}/in-app`;

test('a sign-in through PassflowFlow back to this page updates it without loading it again', async ({ page }) => {
  await page.route('**/settings', (route) =>
    route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') }));
  await page.route('**/app/settings', (route) =>
    route.fulfill({ json: { ...appSettings, pkce_enabled: true, defaults: { redirect: pageUrl } } }));
  await page.route('**/auth/login', (route) => route.fulfill({ json: tokens() }));
  let redirectChecks = 0;
  await page.route('**/auth/redirect/check', (route) => {
    redirectChecks += 1;
    return route.fulfill({ json: { redirect_url: pageUrl } });
  });

  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });

  await page.goto(pageUrl);
  await page.getByLabel('Email', { exact: true }).fill('mailbox@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  // A full load would drop this mark.
  await page.evaluate(() => {
    (window as Window & { __sameDocument?: boolean }).__sameDocument = true;
  });
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page.getByRole('button', { name: /mailbox@example\.com/ })).toBeVisible();
  await expect(page).toHaveURL(pageUrl);
  expect(await page.evaluate(() => (window as Window & { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  expect(loads).toBe(1);
  expect(redirectChecks).toBe(0);
});
