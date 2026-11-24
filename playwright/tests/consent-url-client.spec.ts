import type { Locator, Page, Route } from '@playwright/test';
import { expect, test } from '../fixture';
import { waitForStoryRendered } from './storybook.helpers';

const storybookUrl = 'http://localhost:6107';

const openStory = async (page: Page, id: string, query = '') => {
  await page.goto(`${storybookUrl}/iframe.html?id=${id}&viewMode=story${query}`);
  await waitForStoryRendered(page);
  const storyRoot = page.locator('#storybook-root');
  await expect(storyRoot).toBeVisible();
  await expect(storyRoot).not.toBeEmpty();
  // The theme class arrives after the first render and recolours the page through CSS transitions.
  await expect(page.locator('html')).toHaveClass(/storybook-passflow-(light|dark|brand)/);
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => !(animation instanceof CSSTransition) || animation.playState !== 'running'),
  );
  return storyRoot;
};

const openConsent = (page: Page, name: string) => openStory(page, `components-loginscreen--consent-${name}`);

const title = (page: Page) => page.getByRole('heading', { name: /^Allow .* to access your account\?$/ });
const allow = (page: Page) => page.getByRole('button', { name: 'Allow', exact: true });

const typography = (locator: Locator) =>
  locator.evaluate((element) => {
    const { fontSize, fontWeight, color } = getComputedStyle(element);
    return { fontSize, fontWeight, color };
  });

const bounds = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('expected a rendered element');
  return box;
};

/** Every element starts at or below the bottom of the one before it. */
const expectStacked = async (locators: Locator[]) => {
  const boxes = await Promise.all(locators.map(bounds));
  for (const [index, box] of boxes.entries()) {
    const above = boxes[index - 1];
    if (above) expect(box.y, `element ${index}`).toBeGreaterThanOrEqual(above.y + above.height - 1);
  }
};

const warnings = {
  critical: { code: 'phishing_domain', text: 'is reported as a phishing site', alert: true },
  high: { code: 'brand_lookalike', text: 'uses the name of a well-known brand', alert: true },
  notice: { code: 'localhost_redirect', text: 'runs on your computer', alert: false },
  info: { code: 'unverified_client', text: 'is not verified', alert: false },
};

test.describe('Consent client identity', () => {
  test('a verified client has a badge and a secondary host', async ({ page }) => {
    await openConsent(page, 'verified-client');

    const host = page.getByTestId('consent-client-host');
    await expect(host).toHaveText('notes.acme.example');
    await expect(page.getByTestId('consent-verified')).toHaveText('Verified client');
    const [hostStyle, titleStyle] = [await typography(host), await typography(title(page))];
    expect(parseFloat(hostStyle.fontSize)).toBeLessThan(parseFloat(titleStyle.fontSize));
    await expectStacked([title(page), host, page.getByTestId('consent-verified'), page.getByTestId('consent-redirect-host')]);
  });

  for (const { story, testId, text } of [
    { story: 'unverified-client', testId: 'consent-client-host', text: 'notes.acme-login.example' },
    {
      story: 'unverified-dynamic-client',
      testId: 'consent-redirect-host',
      text: 'a-very-long-subdomain-that-has-to-wrap.notes.acme-login.example',
    },
  ]) {
    test(`${story}: the host is as prominent as the title and there is no badge`, async ({ page }) => {
      await openConsent(page, story);

      const host = page.getByTestId(testId);
      await expect(host).toHaveText(text);
      expect(await typography(host)).toEqual(await typography(title(page)));
      await expectStacked([title(page), host]);
      await expect(page.getByTestId('consent-verified')).toHaveCount(0);
    });
  }

  test('a long host wraps on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openConsent(page, 'unverified-dynamic-client');

    const box = await bounds(page.getByTestId('consent-redirect-host'));
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a verified client that redirects to this computer says so', async ({ page }) => {
    await openConsent(page, 'verified-loopback');

    await expect(page.getByTestId('consent-verified')).toHaveText('Verified client, sending access to an app on this computer');
    await expect(page.getByTestId('consent-redirect-host')).toHaveText('localhost');
  });

  for (const { story, host } of [
    { story: 'verified-client', host: 'notes.acme.example' },
    { story: 'verified-loopback', host: 'localhost' },
    { story: 'unverified-client', host: 'notes.acme-login.example' },
    { story: 'unverified-dynamic-client', host: 'a-very-long-subdomain-that-has-to-wrap.notes.acme-login.example' },
  ]) {
    test(`${story}: names where the user will be sent`, async ({ page }) => {
      const storyRoot = await openConsent(page, story);

      await expect(page.getByTestId('consent-redirect-host')).toHaveText(host);
      await expect(storyRoot).toContainText(new RegExp(`You['’]ll be sent to\\s*${host.replaceAll('.', '\\.')}`));
    });
  }

  test('lists resources with their name and address', async ({ page }) => {
    await openConsent(page, 'verified-client');

    for (const text of [
      'Acme MCP',
      'https://mcp.acme.example/mcp',
      'https://api.acme.example/a-resource-without-a-name/that-has-a-long-address',
    ]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
  });
});

test.describe('Consent warnings', () => {
  for (const [severity, { code, text, alert }] of Object.entries(warnings)) {
    test(`${severity}: ${alert ? 'is' : 'is not'} an alert and Allow is enabled`, async ({ page }) => {
      await openConsent(page, `warning-${severity}`);

      const warning = page.getByTestId(`consent-warning-${code}`);
      await expect(warning).toBeVisible();
      await expect(warning).toContainText(text);
      await expect(page.getByRole('alert')).toHaveCount(alert ? 1 : 0);
      if (alert) await expect(page.getByRole('alert')).toContainText(text);
      await expect(allow(page)).toBeEnabled();
    });
  }

  test('all warnings stand above the scopes in the given order', async ({ page }) => {
    await openConsent(page, 'all-warnings');

    await expectStacked([
      ...Object.values(warnings).map(({ code }) => page.getByTestId(`consent-warning-${code}`)),
      page.getByText('Verify your identity', { exact: true }),
    ]);
    await expect(page.getByRole('alert')).toHaveCount(2);
    await expect(allow(page)).toBeEnabled();
  });

  test('redirect host, resources, warnings and scopes follow each other', async ({ page }) => {
    await openConsent(page, 'verified-loopback');

    await expectStacked([
      page.getByTestId('consent-redirect-host'),
      page.getByText('https://mcp.acme.example/mcp', { exact: true }),
      page.getByTestId('consent-warning-localhost_redirect'),
      page.getByText('Verify your identity', { exact: true }),
    ]);
  });
});

test.describe('Consent flow', () => {
  const callback = 'https://acme.test/callback?code=1';
  const oldResponse = {
    client_id: 'acme-notes-client',
    app_name: 'Acme Notes',
    app_logo_url: '',
    requested_scopes: ['openid', 'profile'],
    scope_metadata: [{ scope: 'profile', label: 'View your profile', description: 'Your name and picture.' }],
    redirect_uri: 'https://acme.test/callback',
    state: 'state-1',
    response_mode: 'query',
    first_party: false,
    csrf_token: 'csrf-1',
  };
  const urlClient = {
    ...oldResponse,
    issuer: 'https://auth.example.com',
    client_kind: 'metadata_document',
    client_host: 'notes.acme.example',
    redirect_host: 'acme.test',
    verified: false,
    resources: [{ uri: 'https://mcp.example.com/mcp', name: 'Example MCP' }],
    warnings: [{ code: 'phishing_domain', severity: 'critical', message: 'Reported as a phishing site.' }],
  };

  const openFlow = async (page: Page, response: Record<string, unknown>) => {
    await page.route('**/oidc/requests/abc', (route) => route.fulfill({ json: response }));
    const storyRoot = await openStory(page, 'flows-consentflow--default', '&consent_challenge_id=abc');
    await expect(title(page)).toBeVisible();
    return storyRoot;
  };

  test('Allow posts the decision even with a critical warning, and only the request in flight locks it', async ({ page }) => {
    let hold: (route: Route) => void = () => undefined;
    const held = new Promise<Route>((resolve) => {
      hold = resolve;
    });
    await page.route('**/oidc/requests/abc/consent', (route) => hold(route));
    await page.route('https://acme.test/**', (route) => route.fulfill({ contentType: 'text/html', body: 'done' }));
    await openFlow(page, urlClient);
    await expect(page.getByRole('alert')).toContainText('Reported as a phishing site.');

    await expect(allow(page)).toBeEnabled();
    await allow(page).click();
    const route = await held;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ granted_scopes: ['openid', 'profile'] });
    await expect(page.getByRole('button', { name: 'Allow' })).toBeDisabled();
    await expect(page.getByTestId('consent-warning-phishing_domain')).toBeVisible();

    await route.fulfill({ json: { kind: 'redirect', url: callback } });
    await page.waitForURL(callback);
  });

  test('server text is shown literally', async ({ page }) => {
    const html = (name: string) => `${name}<img data-injected src=x onerror="window.injected=1"><b data-injected>${name}</b>`;
    const storyRoot = await openFlow(page, {
      ...urlClient,
      app_name: html('app'),
      client_host: html('client'),
      redirect_host: html('redirect'),
      resources: [{ uri: html('uri'), name: html('resource') }],
      warnings: [
        { code: 'phishing_domain', severity: 'critical', message: html('critical') },
        { code: 'unverified_client', severity: 'info', message: html('info') },
      ],
    });

    await expect(page.getByTestId('consent-client-host')).toHaveText(html('client'));
    await expect(page.getByTestId('consent-redirect-host')).toHaveText(html('redirect'));
    await expect(page.getByTestId('consent-warning-phishing_domain')).toContainText(html('critical'));
    await expect(page.getByTestId('consent-warning-unverified_client')).toContainText(html('info'));
    for (const name of ['app', 'uri', 'resource']) await expect(storyRoot).toContainText(html(name));
    await expect(page.locator('[data-injected]')).toHaveCount(0);
    expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  });

  for (const { name, response } of [
    { name: 'without the client fields', response: oldResponse },
    { name: 'with null lists', response: { ...oldResponse, resources: null, warnings: null } },
  ]) {
    test(`a response ${name} shows only the app and its scopes`, async ({ page }) => {
      const storyRoot = await openFlow(page, response);

      await expect(title(page)).toHaveText('Allow Acme Notes to access your account?');
      await expect(page.getByRole('checkbox', { name: 'View your profile' })).toBeChecked();
      await expect(allow(page)).toBeEnabled();
      for (const testId of ['consent-client-host', 'consent-redirect-host', 'consent-verified', /^consent-warning-/]) {
        await expect(page.getByTestId(testId)).toHaveCount(0);
      }
      await expect(storyRoot).not.toContainText(/You['’]ll be sent to/);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }
});
