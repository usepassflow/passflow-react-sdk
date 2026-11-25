import { Passflow } from '@passflow/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRedirectErrorMessage } from '@/utils';
import {
  appId,
  deferred,
  type HttpReply,
  installLandingEnvironment,
  jwt,
  LandingTree,
  makeObserved,
  type Network,
  renderLanding,
  sendAxiosThroughXhr,
} from './support/federated-harness';

const exchangePath = '/auth/session/exchange';
const callback = 'https://rp.example.com/callback';
const state = 'original state +/&=?';
const destination = `${callback}?code=exchanged`;
const parent = { request_id: 'parent-1', redirect_uri: callback, state };
const deliveryModes = ['query', 'form_post'] as const;
type DeliveryMode = (typeof deliveryModes)[number];
const constraints = [
  { name: 'assurance', body: { acr_values: '2' } },
  { name: 'freshness', body: { max_age: 60 } },
  { name: 'both', body: { acr_values: '2', max_age: 60 } },
] as const;
type Submission = { form: HTMLFormElement; attached: boolean; hidden: boolean };
let network: Network | undefined;
let submitted: Submission[] = [];
let assigned: string[] = [];

afterEach(() => {
  for (const { form } of submitted) form.remove();
  network?.restore();
  network = undefined;
  submitted = [];
  assigned = [];
});

function installHosted(metadata: Record<string, unknown> = parent, metadataStatus = 200) {
  const active = installLandingEnvironment({
    pathname: '/web/signin',
    search: `?appid=${appId}&parent_challenge_id=parent-1`,
  });
  network = active;
  const assign = window.location.assign;
  vi.spyOn(window.location, 'assign').mockImplementation((url) => {
    assigned.push(String(url));
    assign.call(window.location, url);
  });
  active.endpoints.set('/oidc/requests/parent-1', { data: metadata, status: metadataStatus });
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    const style = window.getComputedStyle(this);
    submitted.push({
      form: this,
      attached: this.isConnected,
      hidden: this.hidden || style.display === 'none' || style.visibility === 'hidden',
    });
  });
  return active;
}

function expectNoSignIn() {
  expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/password/i, { selector: 'input' })).not.toBeInTheDocument();
}

async function expectSignIn(active: Network) {
  expect(await screen.findByRole('textbox', { name: /email/i })).toBeVisible();
  expect(active.forwards).toEqual([]);
  expect(submitted).toEqual([]);
}

function expectExchanges(active: Network, count: number) {
  const exchanges = active.requests.filter((request) => request.path === exchangePath);
  expect(exchanges).toHaveLength(count);
  for (const request of exchanges) {
    expect(request.method.toUpperCase()).toBe('POST');
    expect(request.body).toEqual({ parent_challenge_id: 'parent-1' });
    const headers = new Headers(request.headers);
    expect(headers.get('X-Passflow-ClientID')).toBe(appId);
    expect(headers.has('Authorization')).toBe(false);
  }
  expect(active.requests.filter((request) => request.path === '/auth/refresh')).toEqual([]);
}

function submittedFields(action: string = callback) {
  expect(submitted).toHaveLength(1);
  const submission = submitted[0]!;
  expect(submission.attached).toBe(true);
  expect(submission.hidden).toBe(true);
  expect(submission.form.method.toUpperCase()).toBe('POST');
  expect(submission.form.action).toBe(action);
  const inputs = Array.from(submission.form.querySelectorAll('input'));
  for (const input of inputs) expect(input.type).toBe('hidden');
  const fields = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
  expect(inputs).toHaveLength(Object.keys(fields).length);
  return fields;
}

async function expectRpError(active: Network, error: string, mode: DeliveryMode) {
  if (mode === 'query') {
    await waitFor(() => expect(active.forwards).toHaveLength(1));
    const answer = new URL(active.forwards[0]!);
    expect(answer.origin + answer.pathname).toBe(callback);
    expect(answer.searchParams.get('error')).toBe(error);
    expect(answer.searchParams.get('state')).toBe(state);
    expect(submitted).toEqual([]);
  } else {
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submittedFields()).toEqual({ error, error_description: expect.any(String), state });
    expect(active.forwards).toEqual([]);
  }
  expectNoSignIn();
}

async function mountHeld(metadata: Record<string, unknown> = parent, metadataStatus = 200, throughXhr = false) {
  const active = installHosted(metadata, metadataStatus);
  if (throughXhr) sendAxiosThroughXhr();
  const first = deferred<HttpReply>();
  active.endpoints.set(exchangePath, first.promise);
  const observed = makeObserved();
  const view = renderLanding({ observed, flow: true });
  await active.releaseSettings();
  // Hold the exchange at the HTTP boundary, without requiring child hooks to update while it is pending.
  await waitFor(() => {
    expect(active.requests.some((request) => request.path === exchangePath)).toBe(true);
  });
  return { active, first, observed, view };
}

type Held = Awaited<ReturnType<typeof mountHeld>>;

async function releaseFirst(held: Held, reply: HttpReply) {
  await act(async () => {
    held.first.resolve(reply);
  });
}

const upgradePath = '/auth/session/upgrade';

function expectNoElevation(active: Network) {
  expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
  expect(active.requests.filter((request) => request.path === upgradePath)).toEqual([]);
}

async function finishElevation(held: Held, retry: HttpReply) {
  held.active.endpoints.set(upgradePath, { data: null, status: 204 });
  held.active.endpoints.set(exchangePath, retry);
  fireEvent.click(screen.getByTestId('upgrade-dialog-alternatives'));
  fireEvent.click(screen.getByTestId('upgrade-dialog-factor-totp'));
  fireEvent.change(screen.getByTestId('upgrade-dialog-code'), { target: { value: '123456' } });
  await act(async () => {
    fireEvent.click(screen.getByTestId('upgrade-dialog-submit'));
  });
  await waitFor(() => {
    const upgrades = held.active.requests.filter((request) => request.path === upgradePath);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]!.method.toUpperCase()).toBe('POST');
    expect(upgrades[0]!.body).toMatchObject({ type: 'totp' });
  });
}

async function dismissSuccessfulElevation() {
  const dismiss = await screen.findByTestId('upgrade-dialog-dismiss');
  await act(async () => {
    fireEvent.click(dismiss);
  });
}

async function rejectElevation(held: Held) {
  await act(async () => {
    fireEvent.click(screen.getByTestId('upgrade-dialog-cancel'));
  });
  expectNoElevation(held.active);
}

async function expectElevationPending(held: Held) {
  await waitFor(() => expect(screen.getByTestId('upgrade-dialog')).toBeVisible());
  expectNoSignIn();
  expect(held.active.forwards).toEqual([]);
  expect(submitted).toEqual([]);
  expectExchanges(held.active, 1);
}

describe('hosted cookie exchange', () => {
  for (const scenario of [
    { name: 'no stored tokens', metadata: {}, stored: false, expired: false },
    { name: 'valid stored tokens', metadata: {}, stored: true, expired: false },
    { name: 'prompt_login with old stored tokens', metadata: { oidc_prompt_login: true }, stored: true, expired: true },
    { name: 'max_age with old stored tokens', metadata: { max_age: 60 }, stored: true, expired: true },
    {
      name: 'prompt_login and max_age with old stored tokens',
      metadata: { oidc_prompt_login: true, max_age: 60 },
      stored: true,
      expired: true,
    },
  ]) {
    it(`exchanges once without Bearer or refresh despite ${scenario.name}`, async () => {
      const active = installHosted({ ...parent, ...scenario.metadata });
      if (scenario.stored) {
        new Passflow({ url: 'https://auth.example.com', appId, parseQueryParams: false }).setTokens({
          access_token: jwt({ type: 'access', exp: scenario.expired ? 1_000 : 4102444800, auth_time: 1 }),
          refresh_token: jwt({ type: 'refresh' }),
        });
      }
      active.endpoints.set('/auth/refresh', {
        data: { access_token: jwt({ type: 'access' }), refresh_token: jwt({ type: 'refresh' }) },
      });
      active.endpoints.set(exchangePath, { data: { redirect_url: destination } });
      const observed = makeObserved();
      const view = renderLanding({ observed, flow: true });
      await active.releaseSettings();
      await waitFor(() => expect(active.forwards).toEqual([destination]));
      view.rerender(<LandingTree observed={observed} flow />);
      await act(async () => {});
      expectExchanges(active, 1);
      expect(active.forwards).toEqual([destination]);
      expect(assigned).toEqual([destination]);
      expect(submitted).toEqual([]);
      expectNoSignIn();
    });
  }

  for (const status of [400, 401]) {
    it(`renders sign-in after an interactive ${status}`, async () => {
      const held = await mountHeld();
      await releaseFirst(held, { status, data: { error: 'login_required' } });
      await expectSignIn(held.active);
      expectExchanges(held.active, 1);
    });
  }

  for (const mode of deliveryModes) {
    for (const status of [400, 401]) {
      it(`answers login_required via ${mode} for silent ${status} without sign-in`, async () => {
        const held = await mountHeld({ ...parent, oidc_prompt_none: true, response_mode: mode });
        await releaseFirst(held, { status, data: { error: 'login_required' } });
        await expectRpError(held.active, 'login_required', mode);
        expectExchanges(held.active, 1);
      });
    }
  }
});

describe('hosted exchange step-up decisions', () => {
  for (const mode of deliveryModes) {
    for (const constraint of [{ name: 'bare', body: {} }, ...constraints]) {
      it(`answers interaction_required via ${mode} without elevation for silent ${constraint.name} 403`, async () => {
        const held = await mountHeld({ ...parent, oidc_prompt_none: true, response_mode: mode });
        await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', ...constraint.body } });
        await expectRpError(held.active, 'interaction_required', mode);
        expectNoElevation(held.active);
        expectExchanges(held.active, 1);
      });
    }
  }

  it('renders sign-in without elevation for a 403 without constraints', async () => {
    const held = await mountHeld();
    await releaseFirst(held, { status: 403, data: { error: 'upgrade_required' } });
    await expectSignIn(held.active);
    expectNoElevation(held.active);
    expectExchanges(held.active, 1);
  });

  for (const constraint of constraints) {
    it(`translates ${constraint.name}, hides sign-in during elevation and retries once to redirect`, async () => {
      const held = await mountHeld();
      expectNoSignIn();
      await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', ...constraint.body } });
      await expectElevationPending(held);
      // Exercise each wire constraint through the real dialog rather than inspecting facade calls.
      await finishElevation(held, { data: { redirect_url: destination } });
      await waitFor(() => expect(held.active.forwards).toEqual([destination]));
      held.view.rerender(<LandingTree observed={held.observed} flow />);
      await act(async () => {});
      expectExchanges(held.active, 2);
      expect(held.active.forwards).toEqual([destination]);
      expect(assigned).toEqual([destination]);
      expect(submitted).toEqual([]);
      expectNoSignIn();
    });
  }

  it('submits a successful retry form_post once without navigation or sign-in', async () => {
    const held = await mountHeld();
    await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', acr_values: '2' } });
    await expectElevationPending(held);
    const fields = { code: 'retry-code +/&', state };
    await finishElevation(held, { data: { form_post: { action: callback, fields } } });
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submittedFields()).toEqual(fields);
    expect(held.active.forwards).toEqual([]);
    expectExchanges(held.active, 2);
    expectNoSignIn();
  });

  for (const constraint of constraints) {
    it(`renders sign-in after successful ${constraint.name} elevation followed by retry 401`, async () => {
      const held = await mountHeld();
      await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', ...constraint.body } });
      await expectElevationPending(held);
      await finishElevation(held, { status: 401, data: { error: 'login_required' } });
      await waitFor(() => expectExchanges(held.active, 2));
      await dismissSuccessfulElevation();
      await expectSignIn(held.active);
      expectExchanges(held.active, 2);
      expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
    });
  }

  for (const mode of deliveryModes) {
    for (const constraint of constraints) {
      for (const status of [400, 403, 500]) {
        it(`answers unmet_authentication_requirements via ${mode} after ${constraint.name} retry ${status}, without a third exchange`, async () => {
          const held = await mountHeld({ ...parent, response_mode: mode });
          await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', ...constraint.body } });
          await expectElevationPending(held);
          await finishElevation(held, { status, data: { error: 'upgrade_required', ...constraint.body } });
          await expectRpError(held.active, 'unmet_authentication_requirements', mode);
          expectExchanges(held.active, 2);
        });
      }
    }
  }

  for (const mode of deliveryModes) {
    it(`renders sign-in without an RP ${mode} answer or retry when freshness-only elevation rejects`, async () => {
      const held = await mountHeld({ ...parent, response_mode: mode });
      await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', max_age: 60 } });
      await expectElevationPending(held);
      await rejectElevation(held);
      await expectSignIn(held.active);
      expectExchanges(held.active, 1);
      expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
    });
  }

  for (const mode of deliveryModes) {
    for (const constraint of constraints.filter((value) => 'acr_values' in value.body)) {
      it(`answers unmet_authentication_requirements via ${mode} when ${constraint.name} elevation rejects`, async () => {
        const held = await mountHeld({ ...parent, response_mode: mode });
        await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', ...constraint.body } });
        await expectElevationPending(held);
        await rejectElevation(held);
        await expectRpError(held.active, 'unmet_authentication_requirements', mode);
        expectExchanges(held.active, 1);
        expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
      });
    }
  }
});

describe('RP error fallback without a destination', () => {
  for (const mode of deliveryModes) {
    for (const branch of ['silent-400', 'silent-401', 'silent-403', 'cancelled-assurance', 'retry-refused'] as const) {
      it(`renders sign-in without an RP ${mode} answer for ${branch} when redirect_uri is missing`, async () => {
        const silent = branch.startsWith('silent-');
        const held = await mountHeld({ request_id: 'parent-1', state, response_mode: mode, oidc_prompt_none: silent });
        if (branch === 'silent-400' || branch === 'silent-401') {
          await releaseFirst(held, {
            status: branch === 'silent-400' ? 400 : 401,
            data: { error: 'login_required' },
          });
        } else {
          await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', acr_values: '2' } });
          if (!silent) {
            await expectElevationPending(held);
            if (branch === 'cancelled-assurance') await rejectElevation(held);
            else {
              await finishElevation(held, { status: 403, data: { error: 'upgrade_required', acr_values: '2' } });
              await waitFor(() => expectExchanges(held.active, 2));
              await dismissSuccessfulElevation();
            }
          }
        }
        await expectSignIn(held.active);
        expectExchanges(held.active, branch === 'retry-refused' ? 2 : 1);
        expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
        if (silent) expectNoElevation(held.active);
      });
    }
  }

  it('renders sign-in when metadata failed to load and assurance elevation rejects', async () => {
    const held = await mountHeld({}, 404);
    await releaseFirst(held, { status: 403, data: { error: 'upgrade_required', acr_values: '2' } });
    await expectElevationPending(held);
    await rejectElevation(held);
    await expectSignIn(held.active);
    expectExchanges(held.active, 1);
    expect(screen.queryByTestId('upgrade-dialog')).not.toBeInTheDocument();
  });
});

describe('issuer of the errors the browser makes', () => {
  const issuer = 'https://auth.example.com/realm?a=1&b=2';
  const ownIss = `${callback}?tenant=7&iss=https%3A%2F%2Fother.example`;
  const stepUp = { status: 403, data: { error: 'upgrade_required', acr_values: '2' } };
  const errors = [
    {
      error: 'login_required',
      branch: 'silent 401',
      silent: true,
      drive: (held: Held) => releaseFirst(held, { status: 401, data: { error: 'login_required' } }),
    },
    {
      error: 'interaction_required',
      branch: 'silent 403',
      silent: true,
      drive: (held: Held) => releaseFirst(held, stepUp),
    },
    {
      error: 'unmet_authentication_requirements',
      branch: 'cancelled elevation',
      silent: false,
      drive: async (held: Held) => {
        await releaseFirst(held, stepUp);
        await expectElevationPending(held);
        await rejectElevation(held);
      },
    },
  ];
  const cases = errors.flatMap((scenario) => deliveryModes.map((mode) => ({ ...scenario, mode })));
  type Case = (typeof cases)[number];

  async function answer({ error, mode, silent, drive }: Case, metadata: Record<string, unknown>) {
    const held = await mountHeld({ ...parent, response_mode: mode, oidc_prompt_none: silent, ...metadata });
    await drive(held);
    let params = new URLSearchParams();
    if (mode === 'query') {
      await waitFor(() => expect(held.active.forwards).toHaveLength(1));
      expect(submitted).toEqual([]);
      params = new URL(held.active.forwards[0]!).searchParams;
    } else {
      await waitFor(() => expect(submitted).toHaveLength(1));
      expect(held.active.forwards).toEqual([]);
      // submittedFields checks that the action is the unchanged redirect URI and that no field repeats.
      const fields = submittedFields(String(metadata.redirect_uri ?? callback));
      for (const [name, value] of Object.entries(fields)) params.append(name, value);
    }
    expect(params.getAll('error')).toEqual([error]);
    expect(params.getAll('state')).toEqual([state]);
    return params;
  }

  // Every error goes through one answer, so one case per error code and per mode is enough.
  const pick = (error: string, mode: (typeof deliveryModes)[number]) => {
    const scenario = cases.find((item) => item.error === error && item.mode === mode);
    if (!scenario) throw new Error(`no case for ${error} via ${mode}`);
    return scenario;
  };

  it.each([
    [pick('login_required', 'query'), ownIss],
    [pick('interaction_required', 'form_post'), ownIss],
    [pick('unmet_authentication_requirements', 'query'), callback],
  ])('sends one iss with $error via $mode', async (scenario, redirect_uri) => {
    const params = await answer(scenario, { issuer, redirect_uri });
    expect(params.getAll('iss')).toEqual([issuer]);
    if (scenario.mode === 'query' && redirect_uri === ownIss) expect(params.getAll('tenant')).toEqual(['7']);
  });

  it('sends no iss when the issuer is empty', async () => {
    const params = await answer(pick('login_required', 'form_post'), { issuer: '' });
    expect(params.has('iss')).toBe(false);
  });
});

describe('an address the browser would run or open as a document', () => {
  const script = 'java\tscript:void(0)';

  async function expectRefused(held: Held) {
    expect(await screen.findByText(authRedirectErrorMessage)).toBeVisible();
    expect(screen.queryByText(/continuing/i)).not.toBeInTheDocument();
    expectNoSignIn();
    expect(held.active.forwards).toEqual([]);
    expect(assigned).toEqual([]);
    expect(submitted).toEqual([]);
  }

  it.each([
    ['a redirect answer to a script address', { redirect_url: script }],
    ['a form_post answer to a script address', { form_post: { action: script, fields: { code: 'c', state } } }],
    [
      'a form_post answer with an empty action',
      { form_post: { action: '', fields: { code: 'c', state } }, redirect_url: destination },
    ],
    ['a form_post answer with no action', { form_post: { fields: { code: 'c', state } }, redirect_url: destination }],
    ['a form_post answer with no fields', { form_post: { action: callback } }],
  ])('%s is not followed, and the page ends in its error', async (_name, data) => {
    const held = await mountHeld();
    await releaseFirst(held, { data });
    await expectRefused(held);
  });

  it('a password sign-in answered with a script address ends in the error, not signed in', async () => {
    const held = await mountHeld(parent, 200, true);
    await releaseFirst(held, { status: 401, data: { error: 'login_required' } });
    const user = userEvent.setup();
    await user.type(await screen.findByRole('textbox', { name: /email/i }), 'hosted@example.com');
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'test-password');
    held.active.endpoints.set('/auth/login', { data: { redirect_url: script } });

    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(held.active.requests.some((request) => request.path === '/auth/login')).toBe(true));
    await expectRefused(held);
    expect(screen.queryByText(/you're signed in/i)).not.toBeInTheDocument();
    expect(held.active.requests.filter((request) => request.path === '/auth/redirect/check')).toEqual([]);
  });

  for (const mode of deliveryModes) {
    it(`gets no relying-party error via ${mode}: sign-in renders`, async () => {
      const held = await mountHeld({ ...parent, redirect_uri: script, oidc_prompt_none: true, response_mode: mode });
      await releaseFirst(held, { status: 401, data: { error: 'login_required' } });
      await expectSignIn(held.active);
      expect(assigned).toEqual([]);
    });
  }

  it("does not stop a redirect answer to an app's own scheme", async () => {
    const appCallback = 'com.example.app:/oauth?code=exchanged';
    const held = await mountHeld();
    await releaseFirst(held, { data: { redirect_url: appCallback } });
    await waitFor(() => expect(held.active.forwards).toEqual([appCallback]));
  });
});
