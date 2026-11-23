import { ANTI_BOT_HEADER_KEY, Passflow } from '@passflow/core';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appId, installLandingEnvironment, jwt, makeObserved, type Network, renderLanding } from './support/federated-harness';

let network: Network | undefined;
afterEach(() => {
  network?.restore();
  network = undefined;
  vi.restoreAllMocks();
});

async function exchangeHeaders(): Promise<Headers> {
  network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}&parent_challenge_id=parent-1` });
  network.endpoints.set('/oidc/requests/parent-1', { data: {}, status: 404 });
  const destination = 'https://rp.example.com/cb?code=c';
  network.endpoints.set('/auth/session/exchange', { data: { redirect_url: destination } });
  vi.spyOn(window.location, 'assign');
  renderLanding({ observed: makeObserved(), flow: false });
  await network.releaseSettings();
  await waitFor(() => expect(network!.forwards).toEqual([destination]));
  const exchanges = network.requests.filter((request) => request.path === '/auth/session/exchange');
  expect(exchanges).toHaveLength(1);
  return new Headers(exchanges[0]!.headers);
}

describe('session exchange under an OIDC parent', () => {
  it('exchanges only the hosted cookie with expired stored tokens and never refreshes', async () => {
    network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}&parent_challenge_id=parent-1` });
    new Passflow({ url: 'https://auth.example.com', appId, parseQueryParams: false }).setTokens({
      access_token: jwt({ type: 'access', exp: 1_000 }),
      refresh_token: jwt({ type: 'refresh' }),
    });
    // Answer an erroneous refresh too, so a refresh regression fails an assertion rather than hanging.
    network.endpoints.set('/auth/refresh', {
      data: { access_token: jwt({ type: 'access', fresh: true }), refresh_token: jwt({ type: 'refresh' }) },
    });
    network.endpoints.set('/oidc/requests/parent-1', { data: {}, status: 404 });
    const destination = 'https://rp.example.com/cb?code=c';
    network.endpoints.set('/auth/session/exchange', { data: { redirect_url: destination } });

    const assign = vi.spyOn(window.location, 'assign');
    renderLanding({ observed: makeObserved(), flow: false });
    await network.releaseSettings();
    await waitFor(() => expect(network!.forwards).toEqual([destination]));

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(destination);
    const exchanges = network.requests.filter((request) => request.path === '/auth/session/exchange');
    expect(exchanges).toHaveLength(1);
    const exchange = exchanges[0]!;
    expect(exchange.method.toUpperCase()).toBe('POST');
    expect(exchange.body).toEqual({ parent_challenge_id: 'parent-1' });
    const headers = new Headers(exchange.headers);
    expect(headers.get('X-Passflow-ClientID')).toBe(appId);
    expect(headers.has('Authorization')).toBe(false);
    expect(network.requests.filter((request) => request.path === '/auth/refresh')).toEqual([]);
  });

  it('sends the anti-bot token a human_only app asks for', async () => {
    const token = vi.spyOn(Passflow.prototype, 'antiBotToken').mockResolvedValue('solved-token');
    const headers = await exchangeHeaders();
    expect(token).toHaveBeenCalledWith({ operation: 'session.exchange' });
    expect(headers.get(ANTI_BOT_HEADER_KEY)).toBe('solved-token');
  });

  it('sends no anti-bot header when the app needs no token', async () => {
    vi.spyOn(Passflow.prototype, 'antiBotToken').mockResolvedValue(undefined);
    const headers = await exchangeHeaders();
    expect(headers.has(ANTI_BOT_HEADER_KEY)).toBe(false);
  });

  it('still sends the exchange, without the header, when the token fails', async () => {
    vi.spyOn(Passflow.prototype, 'antiBotToken').mockRejectedValue(new Error('The anti-bot solve failed'));
    const headers = await exchangeHeaders();
    expect(headers.has(ANTI_BOT_HEADER_KEY)).toBe(false);
  });
});
