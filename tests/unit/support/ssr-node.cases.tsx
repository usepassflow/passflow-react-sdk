import {
  ConsentFlow,
  DeviceVerifyFlow,
  ForgotPassword,
  ForgotPasswordSuccess,
  InvitationJoin,
  LoginButton,
  PassflowFlow,
  PassflowProvider,
  ResetPassword,
  SignIn,
  SignInForm,
  SignUp,
  SignUpForm,
  TwoFactorChallenge,
  TwoFactorRecoveryForm,
  TwoFactorSetupFlow,
  TwoFactorSetupForm,
  TwoFactorSetupMagicLinkFlow,
  TwoFactorVerifyFlow,
  TwoFactorVerifyForm,
  VerifyChallengeMagicLink,
  VerifyChallengeOTP,
} from '@passflow/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A server render runs in Node: no window, no document, no storage. Every public
// screen has to render there with the provider around it, quietly.

const flowPaths = [
  '/signin',
  '/signup',
  '/verify-challenge-otp',
  '/verify-challenge-magic-link',
  '/forgot-password',
  '/forgot-password/success',
  '/password/reset',
  '/invitation',
  '/two-factor-verify',
  '/two-factor-setup',
  '/two-factor-setup-magic-link/some-token',
];

const standaloneScreens: Array<[string, () => ReactNode]> = [
  ['SignIn', () => <SignIn />],
  ['SignUp', () => <SignUp />],
  ['SignInForm', () => <SignInForm />],
  ['SignUpForm', () => <SignUpForm />],
  ['ForgotPassword', () => <ForgotPassword />],
  ['ForgotPasswordSuccess', () => <ForgotPasswordSuccess />],
  ['ResetPassword', () => <ResetPassword />],
  ['InvitationJoin', () => <InvitationJoin />],
  ['VerifyChallengeOTP', () => <VerifyChallengeOTP numInputs={6} shouldAutoFocus={false} signUpPath='/signup' />],
  ['VerifyChallengeMagicLink', () => <VerifyChallengeMagicLink />],
  ['TwoFactorVerifyFlow', () => <TwoFactorVerifyFlow />],
  ['TwoFactorSetupFlow', () => <TwoFactorSetupFlow />],
  ['TwoFactorSetupMagicLinkFlow', () => <TwoFactorSetupMagicLinkFlow />],
  ['TwoFactorVerifyForm', () => <TwoFactorVerifyForm />],
  ['TwoFactorRecoveryForm', () => <TwoFactorRecoveryForm />],
  ['TwoFactorSetupForm', () => <TwoFactorSetupForm />],
  ['TwoFactorChallenge', () => <TwoFactorChallenge />],
  ['ConsentFlow', () => <ConsentFlow />],
  ['DeviceVerifyFlow', () => <DeviceVerifyFlow />],
  ['LoginButton', () => <LoginButton />],
];

const layoutEffectWarning = 'useLayoutEffect does nothing on the server';

const messagesOf = (calls: unknown[][]) => calls.map((args) => args.map(String).join(' '));

export function ssrNodeCases(engine: 'default' | '18.3.1') {
  const serverRender = (child: ReactNode) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const render = () =>
      renderToString(
        <PassflowProvider url='https://auth.example.test' appId='app_test'>
          {child}
        </PassflowProvider>,
      );
    return { render, consoleError, consoleWarn };
  };

  const expectQuietServerRender = (child: ReactNode) => {
    const { render, consoleError, consoleWarn } = serverRender(child);

    expect(render).not.toThrow();
    if (engine === '18.3.1') {
      const messages = [...messagesOf(consoleError.mock.calls), ...messagesOf(consoleWarn.mock.calls)];
      expect(messages.filter((message) => message.includes(layoutEffectWarning))).toEqual([]);
    }
    expect(messagesOf(consoleError.mock.calls)).toEqual([]);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe(`a server render in Node, React ${engine}`, () => {
    it('runs with no window and no document', () => {
      expect(typeof window).toBe('undefined');
      expect(typeof document).toBe('undefined');
    });

    // These cover the server render of the flow at each path; the screens themselves render after hydration.
    it.each(flowPaths)('PassflowFlow with the app location at %s renders', (pathname) => {
      expectQuietServerRender(<PassflowFlow location={{ pathname, search: '' }} navigate={() => undefined} />);
    });

    it('PassflowFlow on its own browser history renders', () => {
      expectQuietServerRender(<PassflowFlow />);
    });

    it.each(standaloneScreens)('%s mounted on its own renders', (_name, screen) => {
      expectQuietServerRender(screen());
    });
  });
}
