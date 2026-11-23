import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginCredentialsState, LoginScreenProps } from '@/components/ui';
import { SignInForm } from '../signin';
import { SignUpForm } from '../signup';

type BotMode = 'bot_friendly' | 'human_only';
type Tool = {
  name: string;
  annotations: { readOnlyHint: boolean };
  inputSchema: { properties?: Record<string, object>; required?: string[] };
  execute: (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: true }>;
};
const modelContext = () => ({
  registerTool: vi.fn<(tool: Tool, options: { signal: AbortSignal }) => Promise<undefined> | void>(),
});
/**
 * A browser whose `registerTool` answers with `answer`. A plain function, not a `vi.fn`: a mock observes the promises it
 * returns, which would mark a rejection as handled and hide the one the page leaves unhandled.
 */
const answeringContext = (answer: (tool: Tool, signal: AbortSignal) => Promise<undefined>) => {
  const signals: AbortSignal[] = [];
  return {
    signals,
    api: {
      registerTool: (tool: Tool, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return answer(tool, options.signal);
      },
    },
  };
};

const hooks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  complete: vi.fn(),
  social: vi.fn(),
  popup: vi.fn(),
  finish: vi.fn(),
  navigate: vi.fn(),
  readError: vi.fn(),
  readCompleteError: vi.fn(),
  core: {
    signIn: vi.fn(),
    signUp: vi.fn(),
    passwordlessSignIn: vi.fn(),
    passwordlessSignInComplete: vi.fn(),
    federatedAuthWithRedirect: vi.fn(),
    passkeyAuthenticate: vi.fn(),
    isAuthenticated: () => false,
    isTwoFactorVerificationRequired: () => false,
  },
}));

const enabledStrategies = ['fixture:email-password-otp-passkey-google'];
let appSettings: { auth_strategies: string[]; defaults: { redirect: string }; bot_mode?: BotMode } | null;
let screenProps: LoginScreenProps | undefined;

// Supply normalized auth methods rather than assuming a wire serialization for auth_strategies.
vi.mock('@/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils')>()),
  getAuthMethods: (strategies: unknown) => {
    const enabled = Array.isArray(strategies) && strategies.includes(enabledStrategies[0]);
    return {
      internal: {
        email: { password: enabled, otp: enabled, magicLink: false },
        username: { password: false, otp: false, magicLink: false },
        phone: { password: false, otp: false, magicLink: false },
      },
      passkey: enabled,
      fim: { providers: enabled ? ['google'] : [] },
    };
  },
}));
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  LoginScreen: (props: LoginScreenProps) => {
    screenProps = props;
    return null;
  },
}));
vi.mock('@/components/provider/passflow-provider', () => ({
  hasFollowedOIDCRedirect: () => false,
  readParentChallengeIdFromURL: () => undefined,
}));

const auth = (fetch: typeof hooks.signIn) => ({
  fetch,
  readError: hooks.readError,
  reset: vi.fn(),
  isError: false,
  error: null,
  isLoading: false,
  emailCode: { step: { kind: 'none' } },
});
vi.mock('@/hooks/use-passflow', () => ({ usePassflow: () => hooks.core }));

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  usePassflow: () => hooks.core,
  useNavigation: () => ({ navigate: hooks.navigate }),
  useSignInEnding: () => ({ ending: 'none', retry: vi.fn(), finishSignIn: hooks.finish }),
  useProvider: () => ({ federatedWithRedirect: hooks.social, federatedWithPopup: hooks.popup }),
  useAppSettings: () => ({
    appSettings,
    scopes: ['openid'],
    createTenantForNewUser: false,
    passwordPolicy: null,
    currentStyles: null,
    isError: false,
    error: '',
    loginAppTheme: null,
  }),
  useAntiBot: () => undefined,
  usePasswordlessComplete: () => ({ fetch: hooks.complete, readError: hooks.readCompleteError }),
  useSignIn: () => auth(hooks.signIn),
  useSignUp: () => auth(hooks.signUp),
}));

const forms = [
  { name: 'sign-in', Form: SignInForm, passwordTool: 'sign_in_password', fetch: hooks.signIn },
  { name: 'sign-up', Form: SignUpForm, passwordTool: 'sign_up_password', fetch: hooks.signUp },
] as const;
const formProps = { successAuthRedirect: '/dashboard', twoFactorVerifyPath: '/two-factor' };
const settings = (bot_mode?: BotMode, enabled = true) => ({
  ...(bot_mode ? { bot_mode } : {}),
  auth_strategies: enabled ? enabledStrategies : [],
  defaults: { redirect: '/dashboard' },
});
const credentials = { identifier: 'person@example.com', password: 'sample-password' };
const textAnswer = (text: string) => ({ content: [{ type: 'text', text }] });
const errorAnswer = (text: string) => ({ ...textAnswer(text), isError: true });
const mountedGlobals: Array<() => void> = [];

function setContext(target: Document | Navigator, api: unknown) {
  const original = Object.getOwnPropertyDescriptor(target, 'modelContext');
  Object.defineProperty(target, 'modelContext', { configurable: true, value: api });
  mountedGlobals.push(() => {
    if (original) Object.defineProperty(target, 'modelContext', original);
    else Reflect.deleteProperty(target, 'modelContext');
  });
}

function registered(api: ReturnType<typeof modelContext>, name: string) {
  const definition = api.registerTool.mock.calls.find(([tool]) => tool.name === name)?.[0];
  if (!definition) throw new Error(`Expected the browser to receive ${name}`);
  return definition;
}

async function execute(api: ReturnType<typeof modelContext>, name: string, args: unknown) {
  let answer: Awaited<ReturnType<Tool['execute']>> | undefined;
  await act(async () => {
    answer = await registered(api, name).execute(args);
  });
  return answer;
}

beforeEach(() => {
  vi.resetAllMocks();
  appSettings = settings('bot_friendly');
  screenProps = undefined;
  setContext(document, undefined);
  setContext(navigator, undefined);
  hooks.signIn.mockResolvedValue('signed-in');
  hooks.signUp.mockResolvedValue('signed-in');
  hooks.complete.mockResolvedValue({ redirect_url: '/dashboard' });
  hooks.readError.mockReturnValue(null);
  hooks.readCompleteError.mockReturnValue('');
});
afterEach(() => {
  cleanup();
  while (mountedGlobals.length) mountedGlobals.pop()?.();
  vi.restoreAllMocks();
});

describe.each(forms)('$name WebMCP', ({ Form, passwordTool, fetch }) => {
  it.each(['bot_friendly', undefined] as const)(
    'REQ-9 registers once on %s and aborts one shared signal on unmount',
    (mode) => {
      appSettings = settings(mode);
      const doc = modelContext();
      const nav = modelContext();
      setContext(document, doc);
      setContext(navigator, nav);

      const view = render(<Form {...formProps} />);
      expect(registered(doc, passwordTool)).toBeDefined();
      expect(nav.registerTool).not.toHaveBeenCalled();
      const initial = [...doc.registerTool.mock.calls];
      const signals = initial.map(([, options]) => options.signal);
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      expect(new Set(signals).size).toBe(1);
      expect(signals[0].aborted).toBe(false);
      view.rerender(<Form {...formProps} />);
      expect(doc.registerTool.mock.calls).toEqual(initial);

      view.unmount();
      expect(signals[0].aborted).toBe(true);
    },
  );

  it.each([
    ['rejects', (name: string) => Promise.reject(new DOMException(`Duplicate tool name: ${name}`, 'InvalidStateError'))],
    [
      'throws',
      (name: string) => {
        throw new DOMException(`Duplicate tool name: ${name}`, 'InvalidStateError');
      },
    ],
  ] as const)('drops every tool, unreported, when one registration %s', async (_how, fail) => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const doc = modelContext();
      doc.registerTool.mockImplementation((tool) =>
        tool.name === passwordTool ? fail(tool.name) : Promise.resolve(undefined),
      );
      setContext(document, doc);
      render(<Form {...formProps} />);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const signals = doc.registerTool.mock.calls.map(([, options]) => options.signal);
      expect(signals.length).toBeGreaterThan(1);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('reports nothing when StrictMode aborts registrations that are still settling', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { api, signals } = answeringContext(
        (_tool, signal) =>
          new Promise<undefined>((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            setTimeout(() => resolve(undefined), 10);
          }),
      );
      setContext(document, api);
      const view = render(
        <StrictMode>
          <Form {...formProps} />
        </StrictMode>,
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(new Set(signals).size).toBe(2);
      expect(signals.at(-1)?.aborted).toBe(false);
      view.unmount();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('REQ-9 waits for settings and never registers on human_only', () => {
    const doc = modelContext();
    setContext(document, doc);
    appSettings = null;
    const view = render(<Form {...formProps} />);
    expect(doc.registerTool).not.toHaveBeenCalled();

    appSettings = settings('human_only');
    view.rerender(<Form {...formProps} />);
    expect(doc.registerTool).not.toHaveBeenCalled();

    appSettings = settings('bot_friendly');
    view.rerender(<Form {...formProps} />);
    expect(registered(doc, passwordTool)).toBeDefined();
  });

  it.each([undefined, { registerTool: true }])(
    'REQ-9 falls back to navigator when document API is unusable (%j)',
    (unusable) => {
      const nav = modelContext();
      setContext(document, unusable);
      setContext(navigator, nav);
      render(<Form {...formProps} />);
      expect(registered(nav, passwordTool)).toBeDefined();
    },
  );

  it('REQ-9 leaves the credential form usable and does not log when neither API exists', async () => {
    const logs = (['debug', 'error', 'info', 'log', 'warn'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    render(<Form {...formProps} />);
    const state = screenProps?.state;
    if (state?.kind !== 'credentials') throw new Error('Expected credentials screen');
    await act(async () => {
      state.onPassword({
        method: 'email_or_username',
        emailOrUsername: credentials.identifier,
        phone: '',
        password: credentials.password,
      });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('REQ-10 advertises only discovery/status when auth methods are all disabled', async () => {
    appSettings = settings('bot_friendly', false);
    const doc = modelContext();
    setContext(document, doc);
    render(<Form {...formProps} />);

    expect(doc.registerTool.mock.calls.map(([tool]) => tool.name).sort()).toEqual(['get_auth_status', 'list_auth_methods']);
    const answer = await execute(doc, 'list_auth_methods', {});
    expect(answer?.isError).toBeUndefined();
    expect(answer?.content).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(JSON.parse(answer!.content[0].text)).toEqual({
      flow: Form === SignInForm ? 'sign-in' : 'sign-up',
      password: [],
      passwordless: [],
      passkey: false,
      social: [],
    });
  });

  it('REQ-10 marks discovery tools read-only and gives enabled password tools required string inputs', () => {
    const doc = modelContext();
    setContext(document, doc);
    render(<Form {...formProps} />);

    for (const name of ['get_auth_status', 'list_auth_methods']) {
      expect(registered(doc, name).annotations.readOnlyHint).toBe(true);
    }
    const password = registered(doc, passwordTool);
    expect(password.annotations.readOnlyHint).toBe(false);
    expect(password.inputSchema.properties).toEqual({
      identifier: expect.objectContaining({ type: 'string' }),
      password: expect.objectContaining({ type: 'string' }),
    });
    expect([...(password.inputSchema.required ?? [])].sort()).toEqual(['identifier', 'password']);
    expect(doc.registerTool.mock.calls.map(([tool]) => tool.name)).not.toContain(
      passwordTool === 'sign_in_password' ? 'sign_up_password' : 'sign_in_password',
    );
  });

  it.each([
    [null, 'Arguments must be an object.'],
    [{ identifier: '  ', password: 'x' }, 'identifier is required.'],
    [{ identifier: 'person@example.com', password: 42 }, 'password is required.'],
    [{ identifier: 'person', password: 'x' }, 'Signing in with username is not enabled for this app.'],
    [{ identifier: '+14155552671', password: 'x' }, 'Signing in with phone is not enabled for this app.'],
  ])('REQ-11 rejects invalid arguments (%j) with readable text and no auth request', async (args, message) => {
    const doc = modelContext();
    setContext(document, doc);
    render(<Form {...formProps} />);
    expect(await execute(doc, passwordTool, args)).toEqual(errorAnswer(message));
    expect(fetch).not.toHaveBeenCalled();
    expect(hooks.core.signIn).not.toHaveBeenCalled();
    expect(hooks.core.signUp).not.toHaveBeenCalled();
  });

  it('REQ-12 submits the same password payload as the human form, marked as an agent action', async () => {
    const doc = modelContext();
    setContext(document, doc);
    const previousUrl = window.location.href;
    window.history.replaceState(null, '', '?invite_token=invite-fixture');
    try {
      render(<Form {...formProps} />);
      const state = screenProps?.state as LoginCredentialsState | undefined;
      if (state?.kind !== 'credentials') throw new Error('Expected credentials screen');
      await act(async () => {
        state.onPassword({
          method: 'email_or_username',
          emailOrUsername: credentials.identifier,
          phone: '',
          password: credentials.password,
        });
      });
      expect(await execute(doc, passwordTool, credentials)).toEqual(
        textAnswer('Signed in. The page is finishing the sign-in.'),
      );

      expect(fetch).toHaveBeenCalledTimes(2);
      const [[humanPayload, humanMethod, humanOptions], [agentPayload, agentMethod, agentOptions]] = fetch.mock.calls;
      const credentialsWithScopes = { email: credentials.identifier, password: credentials.password, scopes: ['openid'] };
      expect(humanPayload).toMatchObject({
        ...(passwordTool === 'sign_up_password' ? { user: credentialsWithScopes } : credentialsWithScopes),
        invite_token: 'invite-fixture',
      });
      expect(agentPayload).toEqual(humanPayload);
      expect([humanMethod, agentMethod]).toEqual(['password', 'password']);
      expect(humanOptions).toBeUndefined();
      expect(agentOptions).toEqual({ agentTool: true });
      expect(hooks.core.signIn).not.toHaveBeenCalled();
      expect(hooks.core.signUp).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, '', previousUrl);
    }
  });

  it('REQ-12 finishes complete_passwordless at the redirect the server answered with', async () => {
    const doc = modelContext();
    setContext(document, doc);
    hooks.complete.mockResolvedValue({ redirect_url: 'https://rp.example.com/after-code' });
    render(<Form {...formProps} />);

    expect(await execute(doc, 'complete_passwordless', { challenge_id: 'test-challenge', code: '123456' })).toEqual(
      textAnswer('Signed in. The page is finishing the sign-in.'),
    );
    expect(hooks.finish).toHaveBeenCalledExactlyOnceWith('https://rp.example.com/after-code', '/dashboard');
    expect(hooks.navigate).not.toHaveBeenCalled();
  });

  it('REQ-12 sends complete_passwordless to the second factor before any redirect', async () => {
    const doc = modelContext();
    setContext(document, doc);
    vi.spyOn(hooks.core, 'isTwoFactorVerificationRequired').mockReturnValue(true);
    hooks.complete.mockResolvedValue({ redirect_url: 'https://rp.example.com/after-code' });
    render(<Form {...formProps} />);

    expect(await execute(doc, 'complete_passwordless', { challenge_id: 'test-challenge', code: '123456' })).toEqual(
      textAnswer('The sign-in needs a second factor. Ask the user to finish it on the page.'),
    );
    expect(hooks.navigate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: '/two-factor' }));
    expect(hooks.finish).not.toHaveBeenCalled();
  });

  it.each([
    [
      'second factor',
      'two-factor-required',
      null,
      textAnswer('The sign-in needs a second factor. Ask the user to finish it on the page.'),
    ],
    ['form error', false, { message: 'Check your credentials.', scope: 'form' }, errorAnswer('Check your credentials.')],
    ['extra step', false, null, textAnswer('The sign-in needs one more step on the page. Ask the user to look at the page.')],
  ])('REQ-11 reports a %s as text', async (_, outcome, error, expected) => {
    const doc = modelContext();
    setContext(document, doc);
    fetch.mockResolvedValue(outcome);
    hooks.readError.mockReturnValue(error);
    render(<Form {...formProps} />);
    expect(await execute(doc, passwordTool, credentials)).toEqual(expected);
  });

  it('REQ-11 turns a rejected action into a safe text result', async () => {
    const doc = modelContext();
    setContext(document, doc);
    fetch.mockRejectedValue(new Error('private diagnostic'));
    render(<Form {...formProps} />);
    expect(await execute(doc, passwordTool, credentials)).toEqual(errorAnswer('Something went wrong. Try again.'));
  });
});

describe('sign-in WebMCP methods', () => {
  it('REQ-10 asks the user to start a passkey and does not start authentication', async () => {
    const doc = modelContext();
    setContext(document, doc);
    render(<SignInForm {...formProps} />);
    expect(registered(doc, 'sign_in_passkey').annotations.readOnlyHint).toBe(false);
    expect(await execute(doc, 'sign_in_passkey', {})).toEqual(
      textAnswer('Ask the user to click the passkey button on the page. A passkey sign-in cannot be started by an agent.'),
    );
    expect(hooks.signIn).not.toHaveBeenCalled();
    expect(hooks.core.passkeyAuthenticate).not.toHaveBeenCalled();
  });

  it('REQ-10 and REQ-12 advertises enabled social providers and sends the agent option with redirect', async () => {
    const doc = modelContext();
    setContext(document, doc);
    render(<SignInForm {...formProps} />);
    const social = registered(doc, 'start_social');
    expect(social.annotations.readOnlyHint).toBe(false);
    expect(social.inputSchema.properties?.provider).toMatchObject({ type: 'string', enum: ['google'] });
    expect(social.inputSchema.required).toEqual(['provider']);

    expect(await execute(doc, 'start_social', { provider: 'github' })).toEqual(
      errorAnswer('github sign-in is not enabled for this app.'),
    );
    expect(hooks.social).not.toHaveBeenCalled();
    expect(await execute(doc, 'start_social', { provider: 'google' })).toEqual(
      textAnswer("Opening google sign-in. The user finishes it on the provider's page."),
    );
    expect(hooks.social).toHaveBeenCalledTimes(1);
    expect(hooks.social.mock.calls[0][0]).toBe('google');
    expect(hooks.social.mock.calls[0].at(-1)).toEqual({ agentTool: true });
    expect(hooks.core.federatedAuthWithRedirect).not.toHaveBeenCalled();
  });

  it('REQ-11 and REQ-12 starts OTP without navigation or exposing the match code and completes it as an agent', async () => {
    const doc = modelContext();
    setContext(document, doc);
    hooks.signIn.mockResolvedValue({ challenge_type: 'otp', challenge_id: 'test-challenge', match_code: 'matching-secret' });
    render(<SignInForm {...formProps} />);
    for (const name of ['start_passwordless', 'complete_passwordless']) {
      expect(registered(doc, name).annotations.readOnlyHint).toBe(false);
    }

    const url = window.location.href;
    expect(await execute(doc, 'start_passwordless', { identifier: credentials.identifier })).toEqual(
      textAnswer(
        'A code was sent to person@example.com. Ask the user for it, then call complete_passwordless with challenge_id "test-challenge" and the code.',
      ),
    );
    expect(hooks.signIn).toHaveBeenCalledWith(expect.objectContaining({ email: credentials.identifier }), 'passwordless', {
      agentTool: true,
    });
    expect(hooks.navigate).not.toHaveBeenCalled();
    expect(window.location.href).toBe(url);
    expect(hooks.core.passwordlessSignIn).not.toHaveBeenCalled();

    expect(await execute(doc, 'complete_passwordless', { challenge_id: 'test-challenge', code: '123456' })).toEqual(
      textAnswer('Signed in. The page is finishing the sign-in.'),
    );
    expect(hooks.complete).toHaveBeenCalledWith(
      { challenge_id: 'test-challenge', challenge_type: 'otp', otp: '123456' },
      { agentTool: true },
    );
    expect(hooks.finish).toHaveBeenCalledTimes(1);
    expect(hooks.core.passwordlessSignInComplete).not.toHaveBeenCalled();
  });
});
