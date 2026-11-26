import path from 'node:path';
/* eslint-disable quotes */
import { expect, test } from '../fixture';
import { errorBody } from './email-verification.helpers';
import { corsHeaders } from './enrollment-contract.helpers';
import appSettings from './responses/app-settings.json';

test.describe('default passwordless experience', () => {
  test('has all elements of passwordless signin', async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });

    await page.goto('http://localhost:5173/web/signin');
    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByRole('button', { name: 'Sign In with a Passkey' })).toBeVisible();
    await expect(page.getByText('Passwordless experience')).toBeVisible();
    await expect(page.locator('label div')).toBeChecked();
    await expect(page.getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByText("Don't have an account? Sign Up")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href');
  });
});

test.describe('default signin flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });

    await page.goto('http://localhost:5173/web/signin');
    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByText('Sign In to your account', { exact: true })).toBeVisible();
    await expect(page.getByText('To Passflow', { exact: true })).toBeVisible();
    await page.locator('label div').click();
    await expect(page.locator('label div')).toBeVisible();
    await expect(page.locator('label div')).not.toBeChecked();
    await expect(page.getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByText("Don't have an account? Sign Up")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href');
  });

  test('has all element of default signin settings', async ({ page }) => {
    await expect(page.locator('input#email_or_username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use phone' })).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toHaveAttribute('href');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In with email link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In with a Passkey' })).toBeVisible();
  });

  test('has all element of default signin settings with phone + password', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Use phone' })).toBeVisible();
    await page.getByRole('button', { name: 'Use phone' }).click();
    await expect(page.locator('label', { hasText: 'Phone number' })).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toHaveAttribute('href');
    await expect(page.getByRole('button', { name: 'Use email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In with SMS code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In with email link' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sign In with a Passkey' })).toBeVisible();
  });

  test('keeps the user on sign in when passwordless start fails', async ({ page }) => {
    await page.route('**/auth/passwordless/start', async (route) => {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
    });

    await page.locator('input#email_or_username').fill('jack@example.com');
    const response = page.waitForResponse('**/auth/passwordless/start');
    await page.getByRole('button', { name: 'Sign In with email link' }).click();
    await response;

    await expect(page).toHaveURL(/\/web\/signin$/);
    await expect(page.getByRole('alert')).toHaveText(
      "We couldn't start passwordless sign-in. Check your connection and try again.",
    );
    await expect(page.getByText(/Request failed with status code/i)).toHaveCount(0);
    await expect(page.locator('input#email_or_username')).not.toHaveClass(/passflow-field--error/);
    await expect(page.locator('input#password')).not.toHaveClass(/passflow-field--error/);
  });
});

test.describe('passkey sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });
    await page.route('**/auth/passkey/authenticate/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge_id: 'passkey-challenge-1',
          publicKey: {
            challenge: 'dGVzdC1wYXNza2V5LWNoYWxsZW5nZQ',
            rpId: 'localhost',
            allowCredentials: [],
            userVerification: 'preferred',
            timeout: 60000,
          },
        }),
      });
    });
    await page.addInitScript(() => {
      navigator.credentials.get = () =>
        Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
    });

    await page.goto('http://localhost:5173/web/signin');
  });

  test('shows the passkey error and lets the user try again when the browser cancels', async ({ page }) => {
    const passkey = page.getByRole('button', { name: 'Sign In with a Passkey' });
    const start = page.waitForResponse('**/auth/passkey/authenticate/start');
    await passkey.click();
    await start;

    await expect(page.getByRole('alert')).toHaveText(
      "We couldn't complete passkey sign-in. Try again or use another sign-in method.",
    );
    await expect(page.getByText('Signing in…')).toHaveCount(0);
    await expect(passkey).toBeEnabled();
  });
});

type StuckPasskeyWindow = Window & {
  __settlePasskey?: (settle: (resolve: (value: Credential | null) => void, reject: (reason: unknown) => void) => void) => void;
  __passkeySettled?: boolean;
};

test.describe('passkey sign-in with a prompt that never settles', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });
    await page.route('**/auth/passkey/authenticate/start', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          challenge_id: 'passkey-challenge-1',
          publicKey: {
            challenge: 'dGVzdC1wYXNza2V5LWNoYWxsZW5nZQ',
            rpId: 'localhost',
            allowCredentials: [],
            userVerification: 'preferred',
            timeout: 60000,
          },
        }),
      });
    });
    await page.addInitScript(() => {
      const stuckWindow = window as StuckPasskeyWindow;
      navigator.credentials.get = () =>
        new Promise((resolve, reject) => {
          stuckWindow.__settlePasskey = (settle) => {
            settle(resolve, reject);
            stuckWindow.__passkeySettled = true;
          };
        });
    });

    await page.goto('http://localhost:5173/web/signin');
  });

  test('cancel returns to the form, and the hook ignores the late passkey result', async ({ page }) => {
    const passkey = page.getByRole('button', { name: 'Sign In with a Passkey' });
    let starts = 0;
    page.on('request', (request) => {
      if (request.url().includes('/auth/passkey/authenticate/start')) starts += 1;
    });
    const start = page.waitForResponse('**/auth/passkey/authenticate/start');
    await passkey.click();
    await start;

    await expect(passkey).toHaveAttribute('aria-busy', 'true');
    await expect(passkey).toHaveAttribute('aria-disabled', 'true');
    // A press on the spinning button starts no second passkey request.
    await passkey.click({ force: true });
    await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
    expect(starts).toBe(1);
    await expect(passkey.locator('.passflow-button__spinner')).toBeVisible();
    await expect(passkey).toBeFocused();
    // Screen readers hear the hidden status; no visible progress block is drawn.
    await expect(page.getByRole('status')).toHaveText('Signing in…');
    await expect(page.getByRole('status')).toHaveClass('passflow-visually-hidden');
    await expect(page.locator('.passflow-login-screen-status')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Passwordless experience' })).toBeDisabled();

    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();
    await cancel.click();

    await expect(page.getByRole('alert')).toHaveText('Passkey sign-in was cancelled.');
    await expect(page.getByText('Signing in…')).toHaveCount(0);
    await expect(passkey).toBeEnabled();
    await expect(passkey).not.toHaveAttribute('aria-busy');
    await expect(page.getByRole('status')).toHaveText('');

    await page.evaluate(() => {
      (window as StuckPasskeyWindow).__settlePasskey?.((_resolve, reject) =>
        reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')),
      );
    });
    await page.waitForFunction(() => (window as StuckPasskeyWindow).__passkeySettled === true);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined)))));

    await expect(page.getByRole('alert')).toHaveText('Passkey sign-in was cancelled.');
    await expect(page.getByText('Signing in…')).toHaveCount(0);
    await expect(passkey).toBeEnabled();
  });

  test('while the passkey prompt waits, only Cancel works; after Cancel the form works with its values', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Passwordless experience' });
    if (await toggle.isChecked()) await page.getByText('Passwordless experience').click();
    await expect(toggle).not.toBeChecked();
    const email = page.getByLabel('Email');
    await email.fill('jane@example.com');

    const passkey = page.getByRole('button', { name: 'Sign In with a Passkey' });
    const start = page.waitForResponse('**/auth/passkey/authenticate/start');
    await passkey.click();
    await start;
    await expect(passkey).toHaveAttribute('aria-busy', 'true');

    const signUp = page.getByRole('link', { name: 'Sign Up' });
    const forgot = page.getByRole('link', { name: 'Forgot Password?' });
    await expect(email).toBeDisabled();
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Show password' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Use phone' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In with email link' })).toBeDisabled();
    await expect(toggle).toBeDisabled();
    await expect(signUp).toHaveAttribute('aria-disabled', 'true');
    await expect(signUp).not.toHaveAttribute('href');
    await expect(forgot).toHaveAttribute('aria-disabled', 'true');

    const signInUrl = page.url();
    await signUp.click({ force: true });
    await forgot.click({ force: true });
    await toggle.click({ force: true });
    await email.press('a', { timeout: 1000 }).catch(() => undefined);
    await expect(page).toHaveURL(signInUrl);
    await expect(toggle).not.toBeChecked();
    await expect(email).toHaveValue('jane@example.com');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alert')).toHaveText('Passkey sign-in was cancelled.');
    await expect(email).toBeEnabled();
    await expect(email).toHaveValue('jane@example.com');
    await expect(toggle).toBeEnabled();
    await expect(signUp).not.toHaveAttribute('aria-disabled');
    await signUp.click();
    await expect(page).toHaveURL(/\/web\/signup/);
  });
});

test.describe('default signin flow with providers', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings-with-google.json') });
    });

    await page.goto('http://localhost:5173/web/signin');
  });

  test('preserves default colors with a legacy theme and google provider', async ({ page }) => {
    const passkey = page.getByRole('button', { name: 'Sign In with a Passkey' });
    const provider = page.getByRole('button', { name: 'google' });

    await expect(provider).toBeVisible();
    await expect(passkey).toHaveCSS('background-color', 'rgb(30, 30, 30)');
    await expect(passkey).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(provider).toHaveCSS('background-color', 'rgb(248, 249, 251)');
    await expect(page.locator('.passflow-provider-text')).toHaveCSS('color', 'rgb(30, 30, 30)');
    await expect(page.locator('.passflow-form-divider__line-left')).toHaveCSS('background-color', 'rgb(233, 234, 240)');
  });
});

test.describe('default signin flow without passkey', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings-without-passkey.json') });
    });

    await page.goto('http://localhost:5173/web/signin');
  });

  test('has all element of default signin settings without passkey', async ({ page }) => {
    await expect(page.getByText('Passwordless experience')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In with a Passkey' })).not.toBeVisible();
    await expect(page.locator('input#email_or_username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use phone' })).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toHaveAttribute('href');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In with email link' })).toBeVisible();
  });
});

test.describe('default signin flow with email and password', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings-default.json') });
    });

    await page.goto('http://localhost:5173/web/signin');
  });

  test('has all element of default signin settings with email and password', async ({ page }) => {
    await expect(page.getByText('Passwordless experience')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In with a Passkey' })).not.toBeVisible();
    await expect(page.locator('input#email_or_username')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use phone' })).not.toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password' })).toHaveAttribute('href');
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Sign In with email link' })).not.toBeVisible();
  });
});

test.describe('default signin flow with error', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });

    await page.goto(
      'http://localhost:5173/web/signin?error=error.federated.app.redirect.not.allowed&message=The redirect URL provided is not allowed by the app.',
    );
  });

  test('with error and message', async ({ page }) => {
    await expect(
      page.getByText("We couldn't continue this authentication request. Return to the app and try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText('The redirect URL provided is not allowed by the app.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
  });
});

test.describe('sign-in that requires a password change', () => {
  // Different from the SDK's notice, so the test can tell which one forgot-password shows.
  const serverMessage = 'Your administrator requires a new password. Use the reset link to continue.';
  const passwordChangeNotice = 'You must change your password before you can sign in. Reset your password to continue.';

  test.beforeEach(async ({ page }) => {
    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    const usernamePassword = { strategy: { identity: 'username', challenge: 'password', transport: 'none' }, type: 'internal' };
    await page.route('**/app/settings', (route) =>
      route.fulfill({ json: { ...appSettings, auth_strategies: [usernamePassword, ...appSettings.auth_strategies] } }),
    );
    await page.route('**/auth/login', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: corsHeaders })
        : route.fulfill({
            status: 403,
            headers: corsHeaders,
            json: errorBody('error.api.password.change.required', serverMessage, 403, '/auth/login'),
          }),
    );

    await page.goto('http://localhost:5173/web/signin');
    await expect(page.getByText('Sign In to your account', { exact: true })).toBeVisible();
    await page.locator('label div').click();
    await expect(page.locator('input#password')).toBeVisible();
  });

  for (const [identifier, param] of [
    ['jack@example.com', 'email'],
    ['jack_r', 'username'],
  ] as const) {
    test(`lands on forgot password with the ${param} filled in and the notice shown`, async ({ page }) => {
      await page.locator('input#email_or_username').fill(identifier);
      await page.locator('input#password').fill('Correct-horse-battery-9!');
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();

      await expect(page).toHaveURL((url) => url.pathname === '/web/forgot-password');
      const search = new URL(page.url()).searchParams;
      expect(search.get('reason')).toBe('password_change_required');
      expect(search.get(param)).toBe(identifier);
      expect(search.get('default_method')).toBe('email_or_username');
      expect(page.url()).not.toContain('Correct-horse');
      expect(decodeURIComponent(page.url())).not.toContain('must change');

      await expect(page.locator('input#email_or_username')).toHaveValue(identifier);
      await expect(page.getByRole('status').filter({ hasText: passwordChangeNotice })).toBeVisible();
      await expect(page.getByText(serverMessage)).toHaveCount(0);
      expect(decodeURIComponent(page.url())).not.toContain('administrator');
      await expect(page.getByRole('button', { name: 'Send reset instructions' })).toBeEnabled();
    });
  }

  test('lands on forgot password with the phone filled in and the notice shown', async ({ page }) => {
    await page.getByRole('button', { name: 'Use phone' }).click();
    const phoneField = page.locator('input#phone');
    await phoneField.fill('');
    await phoneField.pressSequentially('+447700900123');
    await page.locator('input#password').fill('Correct-horse-battery-9!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/web/forgot-password');
    const search = new URL(page.url()).searchParams;
    expect(search.get('reason')).toBe('password_change_required');
    expect(search.get('default_method')).toBe('phone');
    expect(search.get('phone')).toBe('+447700900123');
    expect(search.get('email')).toBeNull();
    expect(search.get('username')).toBeNull();
    expect(page.url()).not.toContain('Correct-horse');

    expect((await page.locator('input#phone').inputValue()).replace(/\D/g, '')).toBe('447700900123');
    await expect(page.getByRole('status').filter({ hasText: passwordChangeNotice })).toBeVisible();
    await expect(page.getByText(serverMessage)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send reset instructions' })).toBeEnabled();
  });
});
