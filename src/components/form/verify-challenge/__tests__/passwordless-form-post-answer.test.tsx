import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appId,
  authTokens,
  type HttpReply,
  installLandingEnvironment,
  LandingTree,
  makeObserved,
  type Network,
  renderLanding,
  sendAxiosThroughXhr,
} from '@/components/provider/__tests__/support/federated-harness';
import { authRedirectErrorMessage } from '@/utils';

const completePath = '/auth/passwordless/complete';
const checkPath = '/auth/redirect/check';
const exchangePath = '/auth/session/exchange';
const pagePath = '/web/verify-challenge-otp';
const callback = 'https://rp.example.com/callback';
const destination = `${callback}?code=c&state=s`;
const appTarget = 'https://app.example.com/after-signin';
const fields = { code: 'code +/&=<>"', state: 'state +/&=<>"' };
const formPostAnswer: HttpReply = { data: { form_post: { action: callback, fields } } };
const linkSearch = `?app_id=${appId}&otp=123456&challenge_id=challenge-1`;
const typedCodeSearch = `?type=passwordless&challenge_id=challenge-1&email=${encodeURIComponent('user@example.com')}&challenge_type=otp`;

type Submission = { form: HTMLFormElement; attached: boolean; hidden: boolean };
let network: Network | undefined;
let submitted: Submission[] = [];

afterEach(() => {
  for (const { form } of submitted) form.remove();
  network?.restore();
  network = undefined;
  submitted = [];
});

// The emailed link completes as soon as the page mounts, so the completion's answer is set before the render.
async function openPage(
  search: string,
  completion: HttpReply,
  options: { strict?: boolean; throughXhr?: boolean; parent?: string } = {},
) {
  const active = installLandingEnvironment({ pathname: pagePath, search });
  network = active;
  active.endpoints.set(completePath, completion);
  if (options.throughXhr) sendAxiosThroughXhr();
  if (options.parent) {
    active.endpoints.set(`/oidc/requests/${options.parent}`, {
      data: { request_id: options.parent, redirect_uri: callback, state: fields.state, response_mode: 'form_post' },
    });
    // No hosted session to exchange: the user has to finish the sign-in on this page.
    active.endpoints.set(exchangePath, { status: 401, data: { error: 'login_required' } });
  }
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    const style = window.getComputedStyle(this);
    submitted.push({
      form: this,
      attached: this.isConnected,
      hidden: this.hidden || style.display === 'none' || style.visibility === 'hidden',
    });
  });
  const observed = makeObserved();
  const view = renderLanding({ observed, flow: true }, options.strict);
  // The relying party takes a POST body only from an app that does not use PKCE.
  await active.releaseSettings({ ...active.settingsData, pkce_enabled: false });
  return { active, observed, view };
}

type Page = Awaited<ReturnType<typeof openPage>>;

const completions = (active: Network) => active.requests.filter((request) => request.path === completePath);
const checks = (active: Network) => active.requests.filter((request) => request.path === checkPath);

async function typeCode() {
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '123456' } });
}

function expectPostedAnswer() {
  expect(submitted).toHaveLength(1);
  const submission = submitted[0]!;
  expect(submission.attached).toBe(true);
  expect(submission.hidden).toBe(true);
  expect(submission.form.method.toUpperCase()).toBe('POST');
  expect(submission.form.action).toBe(callback);
  const inputs = Array.from(submission.form.querySelectorAll('input'));
  expect(inputs).toHaveLength(2);
  for (const input of inputs) expect(input.type).toBe('hidden');
  expect(Object.fromEntries(inputs.map((input) => [input.name, input.value]))).toEqual(fields);
}

function expectNoSignedInEnding() {
  expect(screen.queryByText(/you're signed in/i)).not.toBeInTheDocument();
  expect(screen.queryByTestId('signed-in')).not.toBeInTheDocument();
}

async function expectRefusedEnding() {
  expect(await screen.findByText(authRedirectErrorMessage)).toBeInTheDocument();
}

// A second render and a flushed task queue: anything still owed after the answer has happened by now.
// It keeps the first render's wrapper: a different root would mount the page again and open the link a second time.
async function settle({ observed, view }: Page, strict = false) {
  const tree = <LandingTree observed={observed} flow />;
  view.rerender(strict ? <StrictMode>{tree}</StrictMode> : tree);
  await act(async () => {});
}

describe('a form_post answer to an emailed sign-in link', () => {
  it('posts the answer to the relying party once and shows no signed-in ending', async () => {
    const page = await openPage(linkSearch, formPostAnswer);
    await waitFor(() => expect(completions(page.active)).toHaveLength(1));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expectPostedAnswer();
    await settle(page);
    expectPostedAnswer();
    expectNoSignedInEnding();
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });

  it('completes and posts once when the link effect runs twice', async () => {
    const page = await openPage(linkSearch, formPostAnswer, { strict: true });
    await waitFor(() => expect(completions(page.active)).toHaveLength(1));
    await waitFor(() => expect(submitted).toHaveLength(1));
    await settle(page, true);
    expectPostedAnswer();
    expectNoSignedInEnding();
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});

describe('a form_post answer whose action is a script address', () => {
  it.each([
    ['plain', 'javascript:void(0)'],
    ['with a tab inside the scheme', 'java\tscript:void(0)'],
  ])('is not posted, and the page ends in its error (%s)', async (_name, action) => {
    const page = await openPage(linkSearch, { data: { form_post: { action, fields } } });

    await expectRefusedEnding();
    await settle(page);
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
    expect(checks(page.active)).toEqual([]);
    expectNoSignedInEnding();
  });

  it('is not posted from a typed one-time code, and the page ends in its error', async () => {
    const page = await openPage(typedCodeSearch, { data: { form_post: { action: 'javascript:void(0)', fields } } });
    await typeCode();

    await expectRefusedEnding();
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
    expectNoSignedInEnding();
  });
});

describe('a form_post answer that cannot be posted', () => {
  it.each([
    ['an empty action', { form_post: { action: '', fields }, redirect_url: destination }],
    ['no action', { form_post: { fields }, redirect_url: destination }],
    ['no fields', { form_post: { action: callback } }],
  ])('ends in the page error and goes nowhere (%s)', async (_name, data) => {
    const page = await openPage(linkSearch, { data });

    await expectRefusedEnding();
    await settle(page);
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
    expect(checks(page.active)).toEqual([]);
    expectNoSignedInEnding();
  });

  it('beside tokens is not an answer for a parent: the user is signed in', async () => {
    const page = await openPage(linkSearch, { data: { ...authTokens(), form_post: { action: '' } } });

    expect(await screen.findByTestId('signed-in')).toBeInTheDocument();
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
  });
});

describe('a form_post answer to a typed one-time code', () => {
  it('posts the answer to the relying party once and shows no signed-in ending', async () => {
    const page = await openPage(typedCodeSearch, formPostAnswer);
    await typeCode();

    await waitFor(() => expect(completions(page.active)).toHaveLength(1));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expectPostedAnswer();
    await settle(page);
    expectPostedAnswer();
    expectNoSignedInEnding();
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});

describe('a token answer to an emailed sign-in link', () => {
  it('tells the user they are signed in, without a form or a navigation', async () => {
    const page = await openPage(linkSearch, { data: authTokens() });

    expect(await screen.findByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByText(/you're signed in/i)).toBeInTheDocument();
    await settle(page);
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });

  it('checks the redirect_url that comes with tokens before going there', async () => {
    const page = await openPage(linkSearch, { data: { ...authTokens(), redirect_url: appTarget } });
    page.active.endpoints.set(checkPath, { data: { redirect_url: appTarget } });

    await waitFor(() => expect(checks(page.active).map((request) => request.body)).toEqual([{ redirect_url: appTarget }]));
    await waitFor(() => expect(page.active.forwards).toHaveLength(1));
    expect(new URL(page.active.forwards[0]!).origin).toBe(new URL(appTarget).origin);
    expect(submitted).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});

describe('a cookie-delivery answer to an emailed sign-in link', () => {
  it('checks its redirect_url before going there', async () => {
    const page = await openPage(linkSearch, { data: { token_delivery: 'cookie', redirect_url: appTarget } });
    page.active.endpoints.set(checkPath, { data: { redirect_url: appTarget } });

    await waitFor(() => expect(checks(page.active).map((request) => request.body)).toEqual([{ redirect_url: appTarget }]));
    expect(submitted).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});

describe('a redirect_url answer with no tokens', () => {
  it('is followed to a page on the login origin, with no signed-in ending', async () => {
    const askAgain = '/web/signin?parent_challenge_id=parent-1';
    const page = await openPage(linkSearch, { data: { redirect_url: askAgain } });

    await waitFor(() => expect(page.active.forwards).toEqual([askAgain]));
    await settle(page);
    expect(page.active.forwards).toEqual([askAgain]);
    expect(checks(page.active)).toEqual([]);
    expectNoSignedInEnding();
  });

  it.each([
    ['a script address', 'JavaScript:void(0)'],
    ['a script address with a tab inside the scheme', 'java\tscript:void(0)'],
    ['a script address with a line break inside the scheme', 'java\nscript:void(0)'],
    ['a script address after a control character', '\u0001javascript:void(0)'],
    ['a document address', 'data:text/html,hello'],
    ['an address that cannot be read', 'https://'],
  ])('is not followed to %s: the page ends in its error', async (_name, address) => {
    const page = await openPage(linkSearch, { data: { redirect_url: address } });

    await expectRefusedEnding();
    await settle(page);
    expect(page.active.forwards).toEqual([]);
    expect(checks(page.active)).toEqual([]);
    expect(submitted).toEqual([]);
    expectNoSignedInEnding();
  });

  it('is not followed to a script address from a typed one-time code: the page ends in its error', async () => {
    const page = await openPage(typedCodeSearch, { data: { redirect_url: 'java\tscript:void(0)' } });
    await typeCode();

    await expectRefusedEnding();
    expect(page.active.forwards).toEqual([]);
    expect(checks(page.active)).toEqual([]);
    expectNoSignedInEnding();
  });

  it("is followed to an app's own scheme", async () => {
    const appCallback = 'com.example.app:/oauth?code=c&state=s';
    const page = await openPage(linkSearch, { data: { redirect_url: appCallback } });

    await waitFor(() => expect(page.active.forwards).toEqual([appCallback]));
    expect(checks(page.active)).toEqual([]);
    expectNoSignedInEnding();
  });

  it('is followed from a typed one-time code without asking the server to check it', async () => {
    const page = await openPage(typedCodeSearch, { data: { redirect_url: destination } });
    await typeCode();

    await waitFor(() => expect(page.active.forwards).toEqual([destination]));
    await settle(page);
    expect(page.active.forwards).toEqual([destination]);
    expect(checks(page.active)).toEqual([]);
    expect(submitted).toEqual([]);
    expectNoSignedInEnding();
    expect(completions(page.active)).toHaveLength(1);
  });

  it('is followed from the emailed link without asking the server to check it', async () => {
    const page = await openPage(linkSearch, { data: { redirect_url: destination } });

    await waitFor(() => expect(page.active.forwards).toEqual([destination]));
    await settle(page);
    expect(page.active.forwards).toEqual([destination]);
    expect(checks(page.active)).toEqual([]);
    expect(submitted).toEqual([]);
    expectNoSignedInEnding();
    expect(completions(page.active)).toHaveLength(1);
  });

  it('is followed once under an OIDC parent, by the request interceptor alone', async () => {
    const page = await openPage(
      `${linkSearch}&parent_challenge_id=parent-1`,
      { data: { redirect_url: destination } },
      { throughXhr: true, parent: 'parent-1' },
    );
    await waitFor(() => expect(completions(page.active)).toHaveLength(1));
    expect(completions(page.active)[0]!.body.parent_challenge_id).toBe('parent-1');
    await waitFor(() => expect(page.active.forwards).toHaveLength(1));
    await settle(page);
    expect(page.active.forwards).toEqual([destination]);
    expect(checks(page.active)).toEqual([]);
    expect(submitted).toEqual([]);
    expectNoSignedInEnding();
  });
});

describe('a form_post answer to an emailed sign-in link under an OIDC parent', () => {
  it('is posted once, by the request interceptor alone', async () => {
    const page = await openPage(`${linkSearch}&parent_challenge_id=parent-1`, formPostAnswer, {
      throughXhr: true,
      parent: 'parent-1',
    });
    await waitFor(() => expect(completions(page.active)).toHaveLength(1));
    // The interceptor is on: it added the parent to the completion request.
    expect(completions(page.active)[0]!.body.parent_challenge_id).toBe('parent-1');
    await waitFor(() => expect(submitted).toHaveLength(1));
    await settle(page);
    expectPostedAnswer();
    expectNoSignedInEnding();
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});
