import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixture';
import appSettings from './responses/app-settings.json';

// The admin panel's Login Appearance: the application name and the primary colour reach the embedded screens.
const theme = (name: string) => ({
  ...appSettings.login_app_theme,
  application_name: name,
  color_scheme: 'light',
  light_style: { ...appSettings.login_app_theme.light_style, primary_color: '#D6336C' },
});

const withAppearance = async (page: Page, name: string) => {
  await page.route('**/settings', (route) => route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') }));
  await page.route('**/app/settings', (route) =>
    route.fulfill({ json: { ...appSettings, force_passwordless_login: false, login_app_theme: theme(name) } }),
  );
};

test('sign-in names the app from Login Appearance', async ({ page }) => {
  await withAppearance(page, 'Acme Notes');
  await page.goto('http://localhost:5173/web/signin');
  await expect(page.getByText('To Acme Notes', { exact: true })).toBeVisible();
  await expect(page.getByText(/Madappgang/)).toHaveCount(0);
});

test('sign-up names the app from Login Appearance', async ({ page }) => {
  await withAppearance(page, 'Acme Notes');
  await page.goto('http://localhost:5173/web/signup');
  await expect(page.getByText('For Acme Notes', { exact: true })).toBeVisible();
  await expect(page.getByText(/Madappgang/)).toHaveCount(0);
});

test('an app with no application name shows no made-up name', async ({ page }) => {
  await withAppearance(page, '');
  await page.goto('http://localhost:5173/web/signin');
  await expect(page.getByText('Sign In to your account', { exact: true })).toBeVisible();
  await expect(page.getByText(/Madappgang/)).toHaveCount(0);
});

test('the primary colour from Login Appearance colours the embedded sign-in button', async ({ page }) => {
  await withAppearance(page, 'Acme Notes');
  await page.goto('http://localhost:5173/web/signin');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--passflow-primary-color')))
    .toBe('#D6336C');
  // An empty form keeps the button disabled and grey: fill it so the enabled colour shows.
  await page.getByLabel('Email', { exact: true }).fill('mailbox@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Str0ngPassword!724');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCSS('background-color', 'rgb(214, 51, 108)');
});
