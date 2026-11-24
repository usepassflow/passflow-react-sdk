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
  type HttpReply,
  installLandingEnvironment,
  jwt,
  makeObserved,
  type Network,
  renderLanding,
  writeOidcSlot,
} from './support/federated-harness';

let network: Network | undefined;
let events: PassflowEvent[] = [];
let context: PassflowContextType | undefined;
const onSessionExpired = vi.fn();

afterEach(() => {
  network?.restore();
  network = undefined;
  events = [];
  context = undefined;
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
