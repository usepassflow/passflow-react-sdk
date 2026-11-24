import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
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
} from '@/components/provider/__tests__/support/federated-harness';

const completePath = '/auth/passwordless/complete';
const checkPath = '/auth/redirect/check';
const exchangePath = '/auth/session/exchange';
const pagePath = '/web/verify-challenge-otp';
const callback = 'https://rp.example.com/callback';
const destination = `${callback}?code=c&state=s`;
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

type AxiosAnswer = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

/**
 * Sends core's requests through `XMLHttpRequest`, as axios does in a browser, and answers them from the stubbed
 * endpoints. The stubbed transport skips XHR, so without this nothing that patches XHR sees a request.
 */
function sendAxiosThroughXhr() {
  const answer = axios.defaults.adapter as AxiosAnswer;
  class AnsweredXhr extends EventTarget {
    status = 0;
    responseText = '';
    config?: InternalAxiosRequestConfig;
    settle?: { resolve: (response: AxiosResponse) => void; reject: (reason: unknown) => void };
    open(_method: string, _url: string) {}
    send(body?: string) {
      if (!this.config || !this.settle) throw new Error('XHR sent outside the axios transport');
      const { resolve, reject } = this.settle;
      void answer({ ...this.config, data: body }).then((response) => {
        this.status = response.status;
        this.responseText = JSON.stringify(response.data);
        this.dispatchEvent(new Event('load'));
        resolve(response);
      }, reject);
    }
  }
  vi.stubGlobal('XMLHttpRequest', AnsweredXhr);
  axios.defaults.adapter = (config) =>
    new Promise<AxiosResponse>((resolve, reject) => {
      const xhr = new AnsweredXhr();
      xhr.config = config;
      xhr.settle = { resolve, reject };
      xhr.open((config.method ?? 'get').toUpperCase(), new URL(config.url ?? '/', config.baseURL).href);
      xhr.send(config.data);
    });
}

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

describe('answers to an emailed sign-in link that carry no form_post', () => {
  it('checks a redirect_url answer with the server and goes there, without a form', async () => {
    const page = await openPage(linkSearch, { data: { redirect_url: destination } });

    await waitFor(() => expect(page.active.forwards).toEqual([destination]));
    await settle(page);
    const checks = page.active.requests.filter((request) => request.path === checkPath);
    expect(checks.map((request) => request.body)).toEqual([{ redirect_url: destination }]);
    expect(page.active.forwards).toEqual([destination]);
    expect(submitted).toEqual([]);
    expectNoSignedInEnding();
    expect(completions(page.active)).toHaveLength(1);
  });

  it('tells the user they are signed in after a token answer, without a form or a navigation', async () => {
    const page = await openPage(linkSearch, { data: authTokens() });

    expect(await screen.findByTestId('signed-in')).toBeInTheDocument();
    expect(screen.getByText(/you're signed in/i)).toBeInTheDocument();
    await settle(page);
    expect(submitted).toEqual([]);
    expect(page.active.forwards).toEqual([]);
    expect(completions(page.active)).toHaveLength(1);
  });
});

// Last in the file: once an OIDC parent's answer is followed, that holds for the rest of the page's life.
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
