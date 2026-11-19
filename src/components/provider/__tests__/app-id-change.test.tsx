import { type AppSettings, Passflow } from '@passflow/core';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useUser } from '@/hooks/use-user';
import { PassflowProvider } from '../passflow-provider';
import { jwt } from './support/federated-harness';

const url = 'https://auth.example.com';
const appA = 'app-a';
const appB = 'app-b';

const Session = () => {
  const { isSignedIn } = useAuth();
  const user = useUser();
  return (
    <>
      <p data-testid='signed-in'>{isSignedIn ? 'yes' : 'no'}</p>
      <p data-testid='user'>{JSON.stringify(user)}</p>
    </>
  );
};

const tree = (appId: string) => (
  <PassflowProvider url={url} appId={appId} parseQueryParams={false}>
    <Session />
  </PassflowProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('PassflowProvider when the appId prop changes', () => {
  it("drops app A's session for app B: signed out, and no user", async () => {
    new Passflow({ url, appId: appA, parseQueryParams: false }).setTokens({
      access_token: jwt({ type: 'access', aud: [appA], sub: 'user-a', email: 'a@example.com' }),
      refresh_token: jwt({ type: 'refresh', aud: [appA] }),
    });

    const view = render(tree(appA));
    expect(screen.getByTestId('signed-in').textContent).toBe('yes');
    expect(JSON.parse(screen.getByTestId('user').textContent ?? '{}')).toMatchObject({ id: 'user-a' });

    view.rerender(tree(appB));

    await waitFor(() => expect(screen.getByTestId('signed-in').textContent).toBe('no'));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('user').textContent ?? '')).toEqual({}));
  });
});

const settingsFor = (appId: string | undefined): AppSettings =>
  ({
    name: `${appId} name`,
    auth_strategies: [],
    defaults: { scopes: [`${appId}-scope`], create_tenant_for_new_user: appId === appA },
  }) as unknown as AppSettings;

const Settings = () => {
  const { appSettings, scopes, createTenantForNewUser } = useAppSettings();
  return (
    <>
      <p data-testid='settings-name'>{appSettings?.name ?? ''}</p>
      <p data-testid='scopes'>{scopes.join(' ')}</p>
      <p data-testid='create-tenant'>{String(createTenantForNewUser)}</p>
    </>
  );
};

const settingsTree = (appId: string, props: { scopes?: string[]; createTenantForNewUser?: boolean } = {}) => (
  <PassflowProvider url={url} appId={appId} parseQueryParams={false} {...props}>
    <Settings />
  </PassflowProvider>
);

const spyOnSettings = () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  return vi.spyOn(Passflow.prototype, 'getAppSettings').mockImplementation(async function (this: Passflow) {
    return settingsFor(this.appId);
  });
};

describe('PassflowProvider app settings when the appId prop changes', () => {
  it("fetches app B's settings and drops app A's name, scopes and tenant default", async () => {
    const getAppSettings = spyOnSettings();
    const view = render(settingsTree(appA));
    await waitFor(() => expect(screen.getByTestId('settings-name').textContent).toBe('app-a name'));
    expect(screen.getByTestId('scopes').textContent).toBe('app-a-scope');
    expect(screen.getByTestId('create-tenant').textContent).toBe('true');

    view.rerender(settingsTree(appB));

    await waitFor(() => expect(screen.getByTestId('settings-name').textContent).toBe('app-b name'));
    expect(screen.getByTestId('scopes').textContent).toBe('app-b-scope');
    expect(screen.getByTestId('create-tenant').textContent).toBe('false');
    expect(getAppSettings.mock.contexts.map((passflow) => (passflow as Passflow).appId)).toEqual([appA, appB]);
  });

  it('keeps the scopes and tenant default given as props', async () => {
    const getAppSettings = spyOnSettings();
    const props = { scopes: ['openid', 'custom'], createTenantForNewUser: false };
    const view = render(settingsTree(appA, props));
    await waitFor(() => expect(screen.getByTestId('settings-name').textContent).toBe('app-a name'));

    view.rerender(settingsTree(appB, props));

    await waitFor(() => expect(screen.getByTestId('settings-name').textContent).toBe('app-b name'));
    expect(screen.getByTestId('scopes').textContent).toBe('openid custom');
    expect(screen.getByTestId('create-tenant').textContent).toBe('false');
    expect(getAppSettings).toHaveBeenCalledTimes(2);
  });
});
