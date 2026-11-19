import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import { appOrigin, password, tokens } from './email-verification.helpers';
import appSettings from './responses/app-settings-default.json';

// The app page shows PassflowFlow while signed out and returns to a full address on its own origin after a sign-in.
const pageUrl = `${appOrigin}/in-app`;

type MarkedWindow = Window & { __sameDocument?: boolean };

const mockServer = async (page: Page) => {
  await page.route('**/settings', (route) =>
    route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') }));
  await page.route('**/app/settings', (route) =>
    route.fulfill({ json: { ...appSettings, pkce_enabled: true, defaults: { redirect: pageUrl } } }));
  await page.route('**/auth/login', (route) => route.fulfill({ json: tokens() }));
  let redirectChecks = 0;
  await page.route('**/auth/redirect/check', (route) => {
    redirectChecks += 1;
    return route.fulfill({ json: { redirect_url: route.request().postDataJSON().redirect_url } });
  });
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });
  return { redirectChecks: () => redirectChecks, loads: () => loads };
};

/** Signs in on the open page, after marking the document: a full load drops the mark. */
const signIn = async (page: Page) => {
  await page.getByLabel('Email', { exact: true }).fill('mailbox@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.evaluate(() => {
    (window as MarkedWindow).__sameDocument = true;
  });
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
};

const sameDocument = (page: Page) => page.evaluate(() => (window as MarkedWindow).__sameDocument === true);

test('a sign-in through PassflowFlow back to this page updates it without loading it again', async ({ page }) => {
  const server = await mockServer(page);
  await page.goto(pageUrl);
  await signIn(page);

  await expect(page.getByRole('button', { name: /mailbox@example\.com/ })).toBeVisible();
  await expect(page).toHaveURL(pageUrl);
  expect(await sameDocument(page)).toBe(true);
  expect(server.loads()).toBe(1);
  expect(server.redirectChecks()).toBe(0);
});

test('on the browser router the address keeps its fragment', async ({ page }) => {
  const target = `${appOrigin}/in-app?tab=docs#install`;
  const server = await mockServer(page);
  await page.goto(`${pageUrl}?to=${encodeURIComponent(target)}`);
  await signIn(page);

  await expect(page.getByRole('button', { name: /mailbox@example\.com/ })).toBeVisible();
  await expect(page).toHaveURL(target);
  expect(await sameDocument(page)).toBe(true);
  expect(server.redirectChecks()).toBe(0);
});

test('on the hash router a full address whose route is in the fragment is left for as it is', async ({ page }) => {
  const target = `${appOrigin}/in-app?router=hash#/dashboard`;
  await mockServer(page);
  await page.goto(`${pageUrl}?router=hash&to=${encodeURIComponent(target)}`);
  await signIn(page);

  await expect(page).toHaveURL(target);
  await expect(page.getByRole('button', { name: /mailbox@example\.com/ })).toBeVisible();
});

test('with a location the app passes from a hash router, a full address is left for as it is', async ({ page }) => {
  const target = `${appOrigin}/in-app?router=controlled-hash#/dashboard`;
  await mockServer(page);
  await page.goto(`${pageUrl}?router=controlled-hash&to=${encodeURIComponent(target)}`);
  await signIn(page);

  await expect(page).toHaveURL(target);
  await expect(page.getByRole('button', { name: /mailbox@example\.com/ })).toBeVisible();
});

test('on the memory router a full address to another page on this origin really goes there', async ({ page }) => {
  const target = `${appOrigin}/elsewhere`;
  await mockServer(page);
  await page.route(target, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Elsewhere</h1>' }));
  await page.goto(`${pageUrl}?router=memory&to=${encodeURIComponent(target)}`);
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Elsewhere' })).toBeVisible();
  await expect(page).toHaveURL(target);
});
