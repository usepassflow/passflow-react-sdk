import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, Route } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = 'http://localhost:6107';

/** The theme class arrives after the first render and recolours the page through CSS transitions. */
const settleTheme = async (page: Page) => {
  await expect(page.locator('html')).toHaveClass(/storybook-passflow-(light|dark|brand)/);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => !(animation instanceof CSSTransition) || animation.playState !== 'running'),
  );
};

const openStory = async (page: Page, id: string, query = '') => {
  await page.goto(`${storybookUrl}/iframe.html?id=${id}&viewMode=story${query}`);
  await waitForStoryRendered(page);
  await settleTheme(page);
};

/** Shows another story in the page that is already loaded. */
const switchStory = (page: Page, storyId: string) =>
  page.evaluate((id) => {
    const { __STORYBOOK_ADDONS_CHANNEL__: channel } = window as unknown as {
      __STORYBOOK_ADDONS_CHANNEL__: { emit: (event: string, selection: { storyId: string; viewMode: string }) => void };
    };
    channel.emit('setCurrentStory', { storyId: id, viewMode: 'story' });
  }, storyId);

const expectAccessible = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page }).include('#storybook-root').analyze();
  expect(violations.map(({ id, help }) => `${id}: ${help}`)).toEqual([]);
};

const title = (page: Page) => page.getByRole('heading', { name: /^Allow .* to access your account\?$/ });

const typography = (locator: Locator) =>
  locator.evaluate((element) => {
    const { fontSize, fontWeight, color } = getComputedStyle(element);
    return { fontSize, fontWeight, color };
  });

/** Every element starts at or below the bottom of the one before it. */
const expectStacked = async (locators: Locator[]) => {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  for (const [index, box] of boxes.entries()) {
    if (!box) throw new Error(`element ${index} is not rendered`);
    const above = boxes[index - 1];
    if (above) expect(box.y, `element ${index}`).toBeGreaterThanOrEqual(above.y + above.height - 1);
  }
};

test('an unverified client under every warning: literal text, a prominent host, and Allow posts', async ({ page }) => {
  const html = (name: string) => `${name}<img data-injected src=x onerror="window.injected=1"><b data-injected>${name}</b>`;
  const callback = 'https://acme.test/callback?code=1';
  const severities = ['critical', 'high', 'notice', 'info', 'severe'];
  let hold: (route: Route) => void = () => undefined;
  const held = new Promise<Route>((resolve) => {
    hold = resolve;
  });
  await page.route('**/oidc/requests/abc/consent', (route) => hold(route));
  await page.route('https://acme.test/**', (route) => route.fulfill({ contentType: 'text/html', body: 'done' }));
  await page.route('**/oidc/requests/abc', (route) =>
    route.fulfill({
      json: {
        client_id: 'acme-notes-client',
        app_name: html('app'),
        app_logo_url: '',
        requested_scopes: ['openid', 'profile'],
        scope_metadata: [
          { scope: 'openid', label: 'openid', description: '' },
          { scope: 'profile', label: 'View your profile', description: '' },
        ],
        redirect_uri: 'https://acme.test/callback',
        state: 'state-1',
        response_mode: 'query',
        first_party: false,
        csrf_token: 'csrf-1',
        client_kind: 'metadata_document',
        client_host: html('client'),
        redirect_host: html('redirect'),
        verified: 'false',
        resources: [{ uri: html('uri'), name: html('resource') }, null],
        warnings: [...severities.map((severity) => ({ code: severity, severity, message: html(severity) })), null],
      },
    }),
  );
  await openStory(page, 'flows-consentflow--default', '&consent_challenge_id=abc');

  const host = page.getByTestId('consent-client-host');
  await expect(host).toHaveText(html('client'));
  expect(await typography(host)).toEqual(await typography(title(page)));
  await expect(page.getByTestId('consent-verified')).toHaveCount(0);
  await expect(page.getByText(`You'll be sent to ${html('redirect')}`)).toBeVisible();
  for (const name of ['uri', 'resource']) await expect(page.getByText(html(name), { exact: true })).toBeVisible();

  const warnings = severities.map((severity) => page.getByTestId(`consent-warning-${severity}`));
  for (const [index, warning] of warnings.entries()) {
    await expect(warning).toHaveText(html(severities[index] ?? ''));
    await expect(warning).toHaveAttribute('role', index < 2 ? 'alert' : 'status');
  }
  await expectStacked([
    title(page),
    host,
    ...warnings,
    page.getByTestId('consent-redirect-host'),
    page.getByText(html('uri'), { exact: true }),
    page.getByTestId('consent-scope-openid'),
  ]);
  await expect(page.locator('[data-injected]')).toHaveCount(0);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  await expectAccessible(page);

  const allow = page.getByRole('button', { name: 'Allow', exact: true });
  await expect(allow).toBeEnabled();
  await allow.click();
  const route = await held;
  expect(route.request().method()).toBe('POST');
  expect(route.request().postDataJSON()).toEqual({ granted_scopes: ['openid', 'profile'] });
  await expect(allow).toBeDisabled();
  await route.fulfill({ json: { kind: 'redirect', url: callback } });
  await page.waitForURL(callback);
});

test('the badge names a loopback redirect, and a dynamic client has a prominent redirect host', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, 'components-loginscreen-consent-client--verified');
  const badge = page.getByTestId('consent-verified');
  await expect(badge).toHaveText('Verified client');
  const hostSize = Number.parseFloat((await typography(page.getByTestId('consent-client-host'))).fontSize);
  expect(hostSize).toBeLessThan(Number.parseFloat((await typography(title(page))).fontSize));
  await expectAccessible(page);

  await switchStory(page, 'components-loginscreen-consent-client--verified-loopback');
  await expect(badge).toHaveText('Verified client, sending access to an app on this computer');
  await expect(page.getByTestId('consent-redirect-host')).toHaveText('localhost');

  await switchStory(page, 'components-loginscreen-consent-client--unverified-dynamic');
  await expect(badge).toHaveCount(0);
  const redirect = page.getByTestId('consent-redirect-host');
  await expect(redirect).toHaveText('a-very-long-subdomain-that-has-to-wrap.notes.acme-login.example');
  await settleTheme(page);
  expect(await typography(redirect)).toEqual(await typography(title(page)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Unbroken server text wraps inside its own box, and the box stays on the screen.
  for (const text of [
    page.getByTestId('consent-warning-unverified_client'),
    page.getByTestId('consent-warning-long_text'),
    page.getByText(/^https:\/\/mcp\.acme\.example\//),
  ]) {
    const box = await text.boundingBox();
    if (!box) throw new Error('expected rendered text');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await text.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  }
});

test('a device approval lists its resources and scopes before the approval', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, 'components-loginscreen-device-access--one-tap-approval');
  const resources = page.getByTestId('access-resources');
  await expect(resources.getByText('Sample', { exact: true })).toBeVisible();
  await expect(resources.getByText('http://localhost:8090/mcp', { exact: true })).toBeVisible();
  await expect(page.getByTestId('access-scope-offline_access')).toHaveText(/^Offline accessStay signed in/);
  await expect(page.getByTestId('access-scope-mcp')).toHaveText('mcp');
  // Nothing on a device approval can be switched off: the Switch control has role `switch`, so one anywhere fails this.
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.getByTestId('access-scopes').locator('input')).toHaveCount(0);
  await expectStacked([page.getByTestId('access-scopes'), page.getByRole('button', { name: 'Approve', exact: true })]);
  await expectAccessible(page);

  await switchStory(page, 'components-loginscreen-device-access--signed-in-approval');
  const long = page.getByText(/^https:\/\/mcp\.acme\.example\/x+$/);
  await expect(long).toBeVisible();
  expect(await long.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await expectStacked([page.getByTestId('access-scopes'), page.getByRole('button', { name: 'Approve this device' })]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectAccessible(page);
});
