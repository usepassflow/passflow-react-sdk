import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixture';
import { jwt } from './email-verification.helpers';

// The demo app's id (src/app.tsx): core keeps only stored tokens whose `aud` names the app.
const DEV_APP_ID = 'test_app_id';
const ACCESS_TOKEN = jwt({
  aud: [DEV_APP_ID],
  exp: 1745751266,
  iat: 1745749466,
  iss: 'https://test.passflow.cloud',
  jti: '-oF8tpDHMf1Cf8GI2s1fw6iTZceGyWUvQVwlutEMBqg',
  passflow_tm: {
    '2wJ96B8zR9SYmTUdCaQF444rNCP': {
      tenant_id: '2wJ96B8zR9SYmTUdCaQF444rNCP',
      tenant_name: 'My Workspace',
      tenant_roles: ['user'],
      root_group_id: '2wJ967HBhB05jS5vzHaOL1XhMsA',
      groups: { '2wJ967HBhB05jS5vzHaOL1XhMsA': ['user'] },
      group_names: { '2wJ967HBhB05jS5vzHaOL1XhMsA': 'default' },
    },
    '2wJAn9YEtKDzgToz326FuPEc6U7': {
      tenant_id: '2wJAn9YEtKDzgToz326FuPEc6U7',
      tenant_name: 'My Workspace',
      tenant_roles: ['owner'],
      root_group_id: '2wJAn6g3QZvslq4bnF2Rj4L37ZJ',
      groups: { '2wJAn6g3QZvslq4bnF2Rj4L37ZJ': ['owner'] },
      group_names: { '2wJAn6g3QZvslq4bnF2Rj4L37ZJ': 'default' },
    },
  },
  scopes: ['id', 'offline', 'tenant', 'email', 'oidc', 'openid', 'access:tenant:all'],
  sub: '2wJAn8A8y6Kbg0ks1bK7dQkdFBv',
  type: 'access',
});
const ID_TOKEN = jwt({
  aud: [DEV_APP_ID],
  email: 'test+1@test.com',
  exp: 1745749766,
  iat: 1745749466,
  id: '2wJAn8A8y6Kbg0ks1bK7dQkdFBv',
  iss: 'https://test.passflow.cloud',
  jti: 'K8cZe5vIKR38dlANadR44jGAy3972zejCE4urBtu394',
  sub: '2wJAn8A8y6Kbg0ks1bK7dQkdFBv',
  type: 'id_token',
});
const VALID_INVITE_TOKEN =
  'eyJhbGciOiJFUzI1NiIsImtpZCI6InB1VzVYY0MySkFvQnJHbjBIakxDTWtrWWwySSIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsiMndKMnVkNGxHd1lZZm82ODJnRWNrV2h6Z3pDIl0sImVtYWlsIjoidGVzdCsxQHRlc3QuY29tIiwiZXhwIjoxNzQ1ODM1MTgyLCJpYXQiOjE3NDU3NDg3ODIsImludml0ZV9pZCI6IjJ3SjlQOFRxdWhnTVdiRGtVQmZrSndXYmZwYSIsImludml0ZXJfaWQiOiIyd0o5NkNHTmF0RVRUWmRmMzJkWWtFcmJpM24iLCJpbnZpdGVyX25hbWUiOiIiLCJpc3MiOiJodHRwczovL3Rlc3QucGFzc2Zsb3cuY2xvdWQiLCJqdGkiOiJ6S3NXNkpEeXFvNmVBdmNqcEg1b2RWM2NxTWg3anVibXZRTk1iTFVrbm5RIiwicGFzc2Zsb3dfdG0iOnsiMndKOTZCOHpSOVNZbVRVZENhUUY0NDRyTkNQIjp7InRlbmFudF9pZCI6IjJ3Sjk2Qjh6UjlTWW1UVWRDYVFGNDQ0ck5DUCIsImdyb3VwcyI6eyIyd0o5NjdIQmhCMDVqUzV2ekhhT0wxWGhNc0EiOlsidXNlciJdfX19LCJwYXlsb2FkIjp7ImRhdGExIjoiSSBhbSBhZGRpdGlvbmFsIGRhdGEgdG8gaW5jbHVkZSIsImRhdGEyIjpmYWxzZX0sInJlZGlyZWN0X3VybCI6Imh0dHBzOi8vand0LmlvIiwic3ViIjoiMndKOTZDR05hdEVUVFpkZjMyZFlrRXJiaTNuIiwidGVuYW50X25hbWUiOiJNeSBXb3Jrc3BhY2UiLCJ0eXBlIjoiaW52aXRlIn0.edUr0dVGw473LOTc9DFs-K0SKeRCUO1ev7czK8_hs8PiAFLwaXrpAhnpmi0t9VPjP2Zooi8a6lCw_oUGFbqjuA';
const APP_ID = '2uocaf41S7tOXb14wrhGTFiSErt';

test.describe('invitation join flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      window.localStorage.setItem('access', token);
    }, ACCESS_TOKEN);

    await page.addInitScript((token) => {
      window.localStorage.setItem('id_token', token);
    }, ID_TOKEN);

    await page.route('**/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/passflow-settings.json') });
    });
    await page.route('**/app/settings', async (route) => {
      await route.fulfill({ path: path.join(__dirname, './responses/app-settings.json') });
    });
  });

  test('invitation join flow with valid token', async ({ page }) => {
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);

    expect(page.url()).toContain(`appId=${APP_ID}`);
    expect(page.url()).toContain(`invite_token=${VALID_INVITE_TOKEN}`);

    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByRole('heading', { name: "You've been invited to join My Workspace." })).toBeVisible();
    await expect(page.getByText('Review the invitation before continuing.')).toBeVisible();
    await expect(page.getByText("You're signed in as test+1@test.com.")).toBeVisible();
    await expect(page.getByText('Continue with this account, or switch accounts?')).toBeVisible();

    const acceptInvitation = page.getByRole('button', { name: 'Accept invitation' });
    const switchAccount = page.getByRole('button', { name: 'Switch account' });
    const createAccount = page.getByRole('button', { name: 'Create a new account' });
    await expect(acceptInvitation).toBeVisible();
    await expect(acceptInvitation).toBeFocused();
    await expect(acceptInvitation).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(acceptInvitation).toHaveCSS('background-color', 'rgb(12, 89, 221)');
    await expect(switchAccount).toHaveCSS('border-color', 'rgb(243, 245, 247)');
    await expect(createAccount).toHaveCSS('border-style', 'none');

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

  test('keeps the invitation actions usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);

    const accept = await page.getByRole('button', { name: 'Accept invitation' }).boundingBox();
    const createAccount = await page.getByRole('button', { name: 'Create a new account' }).boundingBox();
    const branding = await page.locator('.passflow-branding').boundingBox();
    expect(accept).not.toBeNull();
    expect(createAccount).not.toBeNull();
    expect(branding).not.toBeNull();
    if (!accept || !createAccount || !branding) throw new Error('expected invitation action and branding bounds');

    expect(accept.y).toBeGreaterThanOrEqual(0);
    expect(createAccount.y + createAccount.height).toBeLessThanOrEqual(branding.y);
  });

  test('invitation join flow with valid token to accept invitation', async ({ page }) => {
    await page.route('**/user/tenant/join', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 401,
        json: {
          error: {
            id: 'error.token.expired',
            message: 'Error parsing access token: token has invalid claims: token is expired.',
            status: 401,
            location: '/user/tenant/join',
            time: '2026-07-17T00:00:00Z',
          },
        },
      });
    });

    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);

    expect(page.url()).toContain(`appId=${APP_ID}`);
    expect(page.url()).toContain(`invite_token=${VALID_INVITE_TOKEN}`);

    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByText("You've been invited to join My Workspace.")).toBeVisible();
    await expect(page.getByText("You're signed in as test+1@test.com.")).toBeVisible();
    await expect(page.getByText('Continue with this account, or switch accounts?')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a new account' })).toBeVisible();

    await page.getByRole('button', { name: 'Accept invitation' }).click();

    await expect(page.locator('[data-testid="invitation-join"]')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Accepting invitation…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepting invitation…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Switch account' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Create a new account' })).toBeDisabled();

    await expect(page.getByRole('alert')).toHaveText("We couldn't accept this invitation. Try again.");
    await expect(page.getByText('Error parsing access token: token has invalid claims: token is expired.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeEnabled();
  });

  test('REQ-13 invitation join displays its localized domain policy message', async ({ page }) => {
    const message = 'Votre adresse ne peut pas rejoindre ce domaine.';
    await page.route('**/user/tenant/join', (route) =>
      route.fulfill({
        status: 403,
        json: {
          error: {
            id: 'error.invite.email.domain_not_allowed',
            message,
            status: 403,
            location: '/user/tenant/join',
            time: '2026-11-03T18:00:00Z',
          },
        },
      }),
    );
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeEnabled();
    await expect(page).toHaveURL(/\/web\/invitation\?/);
  });

  test('invitation join flow with valid token to switch account', async ({ page }) => {
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);

    expect(page.url()).toContain(`appId=${APP_ID}`);
    expect(page.url()).toContain(`invite_token=${VALID_INVITE_TOKEN}`);

    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByText("You've been invited to join My Workspace.")).toBeVisible();
    await expect(page.getByText("You're signed in as test+1@test.com.")).toBeVisible();
    await expect(page.getByText('Continue with this account, or switch accounts?')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a new account' })).toBeVisible();

    await page.getByRole('button', { name: 'Switch account' }).click();

    expect(page.url()).toContain(`signin?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Sign in to join My Workspace.' })).toBeVisible();
    await expect(page.getByText("After you sign in, you'll continue to the invitation.")).toBeVisible();
  });

  test('invitation join flow with valid token to register', async ({ page }) => {
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);

    expect(page.url()).toContain(`appId=${APP_ID}`);
    expect(page.url()).toContain(`invite_token=${VALID_INVITE_TOKEN}`);

    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByText("You've been invited to join My Workspace.")).toBeVisible();
    await expect(page.getByText("You're signed in as test+1@test.com.")).toBeVisible();
    await expect(page.getByText('Continue with this account, or switch accounts?')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a new account' })).toBeVisible();

    await page.getByRole('button', { name: 'Create a new account' }).click();

    expect(page.url()).toContain(`signup?appId=${APP_ID}&invite_token=${VALID_INVITE_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Create your account to join My Workspace.' })).toBeVisible();
    await expect(page.getByText("After you create your account, you'll continue to the invitation.")).toBeVisible();
  });

  test('invitation join flow with invalid invite token', async ({ page }) => {
    await page.goto(`http://localhost:5173/web/invitation?appId=${APP_ID}&invite_token=invalid-token`);

    expect(page.url()).toContain(`appId=${APP_ID}`);
    expect(page.url()).toContain('invite_token=invalid-token');

    await expect(page).toHaveTitle(/Passflow/);
    await expect(page.getByText('This invitation link is invalid or has expired.')).toBeVisible();
    await expect(page.getByText('Go back to start again.')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
  });
});
