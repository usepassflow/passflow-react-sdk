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

const destination = 'https://rp.example.com/cb?code=c';
const antiBotRequired = {
  data: { error: { id: 'error.api.anti_bot.required', message: 'Anti-bot check required' } },
  status: 403,
};

/** Runs the exchange; the first answer is `firstAnswer`, every later one forwards to `destination`. */
async function runExchange(firstAnswer: { data: unknown; status?: number }) {
  network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}&parent_challenge_id=parent-1` });
  network.endpoints.set('/oidc/requests/parent-1', { data: {}, status: 404 });
  const answers = [firstAnswer];
  const endpoints = network.endpoints;
  const get = endpoints.get.bind(endpoints);
  vi.spyOn(endpoints, 'get').mockImplementation((path: string) =>
    path === '/auth/session/exchange' ? (answers.shift() ?? { data: { redirect_url: destination } }) : get(path),
  );
  endpoints.set('/auth/session/exchange', { data: { redirect_url: destination } });
  vi.spyOn(window.location, 'assign');
  renderLanding({ observed: makeObserved(), flow: false });
  await network.releaseSettings();
  return () => network!.requests.filter((request) => request.path === '/auth/session/exchange');
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

  it('sends the exchange once more with an anti-bot token when the server asks for one', async () => {
    const token = vi.spyOn(Passflow.prototype, 'antiBotToken').mockResolvedValue('solved-token');
    const exchanges = await runExchange(antiBotRequired);
    await waitFor(() => expect(network!.forwards).toEqual([destination]));
    expect(token).toHaveBeenCalledWith({ operation: 'session.exchange' });
    expect(exchanges()).toHaveLength(2);
    expect(new Headers(exchanges()[0]!.headers).has(ANTI_BOT_HEADER_KEY)).toBe(false);
    expect(new Headers(exchanges()[1]!.headers).get(ANTI_BOT_HEADER_KEY)).toBe('solved-token');
  });

  it('asks for no anti-bot token when the server does not refuse the exchange', async () => {
    const token = vi.spyOn(Passflow.prototype, 'antiBotToken');
    const exchanges = await runExchange({ data: { redirect_url: destination } });
    await waitFor(() => expect(network!.forwards).toEqual([destination]));
    expect(token).not.toHaveBeenCalled();
    expect(exchanges()).toHaveLength(1);
    expect(new Headers(exchanges()[0]!.headers).has(ANTI_BOT_HEADER_KEY)).toBe(false);
  });

  it('keeps the refusal when no token can be made', async () => {
    const token = vi.spyOn(Passflow.prototype, 'antiBotToken').mockRejectedValue(new Error('The anti-bot solve failed'));
    const exchanges = await runExchange(antiBotRequired);
    await waitFor(() => expect(token).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exchanges()).toHaveLength(1);
    expect(network!.forwards).toEqual([]);
  });
});
