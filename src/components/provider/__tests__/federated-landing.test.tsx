import { Passflow, PassflowEvent } from '@passflow/core';
import { act, screen, waitFor } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassflowContext, type PassflowContextType } from '@/context';
import { useAuth, usePassflow, useSessionExpired, useUser } from '@/hooks';
import {
  appId,
  authTokens,
  deferred,
  factorAnswer,
  type HttpReply,
  installLandingEnvironment,
  jwt,
  LandingTree,
  makeObserved,
  type Network,
  oidcSlotKey,
  renderLanding,
  slotKey,
  target,
  writeOidcSlot,
  writeSlot,
} from './support/federated-harness';

let network: Network | undefined;
afterEach(() => {
  network?.restore();
  network = undefined;
});

describe('REQ-12 REQ-13 committed federated landing uses real exchange outcomes', () => {
  for (const order of ['settings-first', 'exchange-first'] as const) {
    for (const mode of ['app', 'login-page'] as const) {
      it(`${order}, ${mode}: current provider adopts tokens and only login-page forwards once`, async () => {
        network = installLandingEnvironment();
        writeSlot();
        const observed = makeObserved();
        const view = renderLanding({ observed, mode });
        await waitFor(() => expect(network!.requests.some((request) => request.path === '/auth/pkce_exchange')).toBe(true));
        const response = authTokens();
        if (order === 'settings-first') {
          await network.releaseSettings();
          await waitFor(() => expect(observed.settingsReady).toBe(true));
        }
        await network.releaseExchange(response);
        await waitFor(() => expect(observed.outcome).toBe('signed-in'));
        if (order === 'exchange-first') await network.releaseSettings();
        await waitFor(async () => {
          expect(observed.current!.isAuthenticated()).toBe(true);
          expect((await observed.current!.getTokens(false))?.access_token).toBe(response.access_token);
        });
        expect(sessionStorage.getItem(slotKey)).toBeNull();
        expect(new URLSearchParams(window.location.search).has('code')).toBe(false);
        expect(new URLSearchParams(window.location.search).has('user_state')).toBe(false);
        expect(new URLSearchParams(window.location.search).get('appid')).toBe(appId);
        expect(new URLSearchParams(window.location.search).get('redirectto')).toBe(target);
        if (mode === 'login-page') {
          await waitFor(() => expect(network!.forwards).toHaveLength(1));
          // An SDK-mode app is sent to the address with nothing: its own SDK starts the sign-in.
          expect(network.forwards[0]).toBe(target);
        } else expect(network.forwards).toEqual([]);

        // A rerender and later unrelated sign-in cannot consume the one-shot forward twice.
        network.endpoints.set('/auth/login', { data: response });
        await act(async () => {
          await observed.current!.signIn({ email: 'federated@example.com', password: 'test-password' });
        });
        view.rerender(<LandingTree observed={observed} mode={mode} />);
        await act(async () => {});
        expect(network.forwards).toHaveLength(mode === 'login-page' ? 1 : 0);
        expect(network.requests.filter((request) => request.path === '/auth/pkce_exchange')).toHaveLength(1);
      });
    }

    it(`REQ-13 ${order}: 2FA stays on this page and reaches the registered flow path`, async () => {
      network = installLandingEnvironment();
      writeSlot();
      const observed = makeObserved();
      renderLanding({ observed, flow: false, factorPath: '/web/two-factor-verify' });
      await waitFor(() => expect(network!.requests.some((request) => request.path === '/auth/pkce_exchange')).toBe(true));
      if (order === 'settings-first') {
        await network.releaseSettings();
        await waitFor(() => expect(observed.settingsReady).toBe(true));
      }
      await network.releaseExchange(factorAnswer());
      // Architecture §3: carry app context from the initial landing onto verification.
      await waitFor(() =>
        expect(observed.navigations).toEqual([
          {
            to: '/web/two-factor-verify',
            search: new URLSearchParams({ appid: appId, redirectto: target }).toString(),
            replace: true,
          },
        ]),
      );
      if (order === 'exchange-first') await network.releaseSettings();
      await waitFor(() => expect(observed.current!.isTwoFactorVerificationRequired()).toBe(true));
      expect(observed.current!.isAuthenticated()).toBe(false);
      expect(observed.outcome).toBeUndefined();
      expect(network.forwards).toEqual([]);
    });
  }
});

describe('REQ-12 crafted landing URLs never arm forwarding without a taken slot', () => {
  for (const crafted of [false, true]) {
    for (const method of ['password', 'otp'] as const) {
      it(`${method} SignIn, crafted URL ${crafted}: session is applied without federated outcome or forward`, async () => {
        network = installLandingEnvironment({
          search: crafted ? '?code=forged&user_state=forged&redirectto=' + encodeURIComponent(target) : '',
        });
        const observed = makeObserved();
        renderLanding({ observed });
        await network.releaseSettings();
        await waitFor(() => expect(observed.settingsReady).toBe(true));
        const response = authTokens();
        network.endpoints.set('/auth/login', { data: response });
        network.endpoints.set('/auth/passwordless/complete', { data: { ...response, redirect_url: target } });
        await act(async () => {
          if (method === 'password') await observed.current!.signIn({ email: 'user@example.com', password: 'test-password' });
          else await observed.current!.passwordlessSignInComplete({ challenge_id: 'typed-otp-row', otp: '613907' });
        });
        await waitFor(() => expect(observed.current!.isAuthenticated()).toBe(true));
        await act(async () => {});
        expect(observed.outcome).toBeUndefined();
        expect(network.forwards).toEqual([]);
        expect(network.requests.filter((request) => request.path === '/auth/pkce_exchange')).toEqual([]);
        if (crafted) expect(new URLSearchParams(window.location.search).get('code')).toBe('forged');
      });
    }
  }
});

describe('REQ-14 exchange errors become public failed outcome in either host mode', () => {
  it.each(['app', 'login-page'] as const)('%s mode has no tokens or forward after a failed landing', async (mode) => {
    network = installLandingEnvironment();
    writeSlot();
    const observed = makeObserved();
    // Keep this a non-visual provider/controller test; the boundary copy is checked in Playwright.
    renderLanding({ observed, mode, flow: false });
    await network.releaseSettings();
    await network.releaseExchange(
      {
        error: {
          id: 'error.pkce.exchange',
          message: 'exchange refused',
          status: 400,
          location: '/auth/pkce_exchange',
          time: '2026-11-04T16:42:00Z',
        },
      },
      400,
    );
    await waitFor(() => expect(observed.outcome).toBe('failed'));
    expect(observed.current!.isAuthenticated()).toBe(false);
    expect(network.forwards).toEqual([]);
  });
});

let context: PassflowContextType | undefined;
const ContextProbe = () => {
  context = useContext(PassflowContext);
  return null;
};

describe('SDK-mode landing (authorization code with state)', () => {
  const sdkLanding = `?code=oidc-code&state=sign-in-state&appid=${appId}`;

  it('signs in on the instance that survives a replacement during the token call', async () => {
    network = installLandingEnvironment({ search: sdkLanding });
    writeOidcSlot({ state: 'sign-in-state' });
    const token = deferred<HttpReply>();
    network.endpoints.set('/oidc/token', token.promise);
    const observed = makeObserved();
    renderLanding({ observed, flow: false, children: <ContextProbe /> });
    await network.releaseSettings();
    await waitFor(() => expect(network!.requests.some((request) => request.path === '/oidc/token')).toBe(true));

    const first = observed.current;
    await act(async () => {
      context!.dispatch({ type: 'SET_PASSFLOW_STATE', payload: { scopes: ['openid', 'email', 'id'] } });
    });
    expect(observed.current).not.toBe(first);

    const response = authTokens();
    await act(async () => {
      token.resolve({ data: response });
    });

    await waitFor(() => expect(observed.outcome).toBe('signed-in'));
    await waitFor(async () => {
      expect(observed.current!.isAuthenticated()).toBe(true);
      expect((await observed.current!.getTokens(false))?.access_token).toBe(response.access_token);
    });
    expect(sessionStorage.getItem(oidcSlotKey)).toBeNull();
    expect(new URLSearchParams(window.location.search).has('code')).toBe(false);
    expect(new URLSearchParams(window.location.search).has('state')).toBe(false);
  });

  it.each([
    ['a state that is not this sign-in', { state: 'another-sign-in' }],
    ['an expired proof key', { state: 'sign-in-state', expired: true }],
  ])('a landing refused for %s fails, with no session, and the provider says so', async (_case, slot) => {
    network = installLandingEnvironment({ search: sdkLanding });
    writeOidcSlot(slot);
    const observed = makeObserved();
    renderLanding({ observed, flow: false });
    await network.releaseSettings();

    // The failure screen takes the children's place, the probe among them.
    await waitFor(() => expect(screen.getByTestId('sign-in-return-failed')).toBeTruthy());
    expect(screen.getByText('Sign-in failed. Start again.')).toBeTruthy();
    expect(observed.current!.isAuthenticated()).toBe(false);
    expect(network.requests.some((request) => request.path === '/oidc/token')).toBe(false);
    expect(network.forwards).toEqual([]);
  });

  describe('back at the app root, returns to the page the sign-in started on', () => {
    const returnKey = 'passflow_return_to';

    const landAtRoot = async (storedReturnPath?: string) => {
      network = installLandingEnvironment({ pathname: '/', search: '?code=oidc-code&state=sign-in-state' });
      writeOidcSlot({ state: 'sign-in-state' });
      if (storedReturnPath !== undefined) sessionStorage.setItem(returnKey, storedReturnPath);
      network.endpoints.set('/oidc/token', { data: authTokens() });
      const observed = makeObserved();
      renderLanding({ observed, flow: false });
      await network.releaseSettings();
      await waitFor(() => expect(observed.outcome).toBe('signed-in'));
      await waitFor(() => expect(observed.current!.isAuthenticated()).toBe(true));
      return observed;
    };

    it('navigates once, replacing the landing, to the stored page', async () => {
      const observed = await landAtRoot('/account/settings?tab=2');

      expect(observed.navigations).toEqual([{ to: '/account/settings', search: '?tab=2', replace: true }]);
      expect(sessionStorage.getItem(returnKey)).toBeNull();
      expect(network!.forwards).toEqual([]);
    });

    it('loads a stored page with a fragment in full, since navigate carries no fragment', async () => {
      const observed = await landAtRoot('/account/settings?tab=2#security');

      expect(network!.forwards).toEqual(['/account/settings?tab=2#security']);
      expect(observed.navigations).toEqual([]);
      expect(sessionStorage.getItem(returnKey)).toBeNull();
    });

    it.each(['https://evil.example/x', '//evil.example/x'])(
      'goes nowhere for a stored %j, which is not a path on this origin',
      async (stored) => {
        const observed = await landAtRoot(stored);

        expect(window.location.pathname).toBe('/');
        expect(observed.navigations).toEqual([]);
        expect(sessionStorage.getItem(returnKey)).toBeNull();
        expect(network!.forwards).toEqual([]);
      },
    );

    it('goes nowhere when no page was stored', async () => {
      const observed = await landAtRoot();

      expect(observed.navigations).toEqual([]);
      expect(sessionStorage.getItem(returnKey)).toBeNull();
    });
  });
});

describe('REQ-20 no explicit redirect target does not depend on appSettings render state', () => {
  it('forwards using getAppSettings defaults even when exchange finishes before settings', async () => {
    network = installLandingEnvironment({ search: '?code=landing-code&user_state=state&appid=' + appId });
    writeSlot();
    const observed = makeObserved();
    renderLanding({ observed, successRedirect: null });
    await network.releaseExchange();
    await waitFor(() => expect(observed.outcome).toBe('signed-in'));
    expect(observed.settingsReady).toBe(false);
    expect(network.forwards).toEqual([]);
    await network.releaseSettings();
    await waitFor(() => expect(network!.forwards).toHaveLength(1));
    expect(network.forwards[0]).toContain('app.example.com/after-signin');
  });

  it('stays signed in when settings have no default target', async () => {
    network = installLandingEnvironment({ search: '?code=landing-code&user_state=state&appid=' + appId });
    writeSlot();
    const observed = makeObserved();
    renderLanding({ observed, successRedirect: null });
    await network.releaseExchange();
    await network.releaseSettings({ ...network.settingsData, defaults: {} });
    await waitFor(() => expect(observed.outcome).toBe('signed-in'));
    await act(async () => {});
    expect(network.forwards).toEqual([]);
    expect(observed.current!.isAuthenticated()).toBe(true);
  });

  it('does not forward when the default-settings request fails', async () => {
    network = installLandingEnvironment({ search: '?code=landing-code&user_state=state&appid=' + appId });
    writeSlot();
    const observed = makeObserved();
    renderLanding({ observed, successRedirect: null });
    await network.releaseExchange();
    await waitFor(() => expect(observed.outcome).toBe('signed-in'));
    await network.releaseSettings({ error: { id: 'error.server', message: 'settings unavailable', status: 500 } }, 500);
    await act(async () => {});
    expect(network.forwards).toEqual([]);
  });
});

let events: PassflowEvent[] = [];
const onSessionExpired = vi.fn();
afterEach(() => {
  events = [];
  onSessionExpired.mockReset();
});

const newInstance = () => new Passflow({ url: 'https://auth.example.com', appId, parseQueryParams: false });
const browserStorage = () => ({ local: { ...localStorage }, session: { ...sessionStorage } });
const bringToForeground = () =>
  act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });

const END_EVENTS = [PassflowEvent.SignOut, PassflowEvent.SessionExpired];

const Probe = () => {
  const passflow = usePassflow();
  const { isSignedIn } = useAuth();
  const { id } = useUser();
  useSessionExpired({ onSessionExpired });
  context = useContext(PassflowContext);
  useEffect(() => {
    const subscriber = { onAuthChange: (event: PassflowEvent) => void events.push(event) };
    passflow.subscribe(subscriber, END_EVENTS);
    return () => passflow.unsubscribe(subscriber, END_EVENTS);
  }, [passflow]);
  return (
    <>
      <p data-testid='state'>{isSignedIn ? `signed in as ${id}` : 'signed out'}</p>
      <input aria-label='draft' />
    </>
  );
};

async function mountApp(tokens?: Parameters<Passflow['setTokens']>[0]) {
  network = installLandingEnvironment({ pathname: '/account', search: '?tab=profile' });
  if (tokens) newInstance().setTokens(tokens);
  localStorage.setItem('app-setting', 'kept');
  sessionStorage.setItem('app-draft', 'kept');
  const observed = makeObserved();
  renderLanding({ observed, mode: 'app', flow: false, children: <Probe /> });
  await network.releaseSettings();
  await waitFor(() => expect(observed.settingsReady).toBe(true));
  return observed;
}

describe('a page brought to the foreground', () => {
  it('as a guest, gets SignOut from core and neither navigates nor clears anything', async () => {
    const observed = await mountApp();
    const before = browserStorage();
    const instance = observed.current;
    const field = screen.getByLabelText('draft');

    await bringToForeground();

    expect(events).toEqual([PassflowEvent.SignOut]);
    expect(screen.getByTestId('state').textContent).toBe('signed out');
    expect(browserStorage()).toEqual(before);
    expect(observed.navigations).toEqual([]);
    expect(network!.forwards).toEqual([]);
    expect(window.location.pathname + window.location.search).toBe('/account?tab=profile');
    expect(onSessionExpired).not.toHaveBeenCalled();
    // The page was not remounted.
    expect(observed.current).toBe(instance);
    expect(screen.getByLabelText('draft')).toBe(field);
  });

  it('with a session that has no refresh token, stays signed in', async () => {
    const observed = await mountApp({ access_token: jwt({ type: 'access' }) });
    expect(screen.getByTestId('state').textContent).toBe('signed in as federated-test-user');
    const before = browserStorage();

    await bringToForeground();

    expect(events).toEqual([]);
    expect(screen.getByTestId('state').textContent).toBe('signed in as federated-test-user');
    expect(browserStorage()).toEqual(before);
    expect(observed.navigations).toEqual([]);
    expect(network!.forwards).toEqual([]);
  });
});

describe('a hosted sign-in replayed to an instance that replaced the first one', () => {
  // A previous session with a refresh token is stored; the instance is replaced while the token call runs.
  async function land(response: Record<string, unknown>) {
    network = installLandingEnvironment({ search: `?code=oidc-code&state=sign-in-state&appid=${appId}` });
    newInstance().setTokens(authTokens());
    writeOidcSlot({ state: 'sign-in-state' });
    const token = deferred<HttpReply>();
    network.endpoints.set('/oidc/token', token.promise);
    const observed = makeObserved();
    renderLanding({ observed, flow: false, children: <Probe /> });
    await network.releaseSettings();
    await waitFor(() => expect(network!.requests.some((request) => request.path === '/oidc/token')).toBe(true));
    const first = observed.current;
    await act(async () => {
      context!.dispatch({ type: 'SET_PASSFLOW_STATE', payload: { scopes: ['openid', 'email', 'id'] } });
    });
    expect(observed.current).not.toBe(first);
    await act(async () => {
      token.resolve({ data: response });
    });
    await waitFor(() => expect(observed.outcome).toBe('signed-in'));
    return observed.current!;
  }

  it('keeps every token and the scopes of the sign-in', async () => {
    const response = authTokens();
    await land({ ...response });
    expect(await newInstance().getTokens(false)).toMatchObject({
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      id_token: response.id_token,
      scopes: ['email'],
    });
  });

  it('leaves no refresh token of the session before it', async () => {
    const response = { access_token: jwt({ type: 'access' }), token_type: 'Bearer' };
    const current = await land(response);
    expect(current.getCachedTokens()?.access_token).toBe(response.access_token);
    expect(current.getCachedTokens()?.refresh_token).toBeUndefined();
    const stored = await newInstance().getTokens(false);
    expect(stored?.access_token).toBe(response.access_token);
    expect(stored?.refresh_token).toBeUndefined();
  });
});
