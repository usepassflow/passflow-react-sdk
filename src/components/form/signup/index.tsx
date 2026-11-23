import type {
  PassflowAuthOptions,
  PassflowPasskeyRegisterStartPayload,
  PassflowPasswordlessResponse,
  PassflowPasswordlessSignInPayload,
  PassflowSignUpPayload,
  PassflowUserPayload,
  Providers,
} from '@passflow/core';
import { phone } from 'phone';
import queryString from 'query-string';
import type { FC } from 'react';
import { useMemo } from 'react';
import { ErrorComponent } from '@/components/error';
import { SignInEndingScreen } from '@/components/form/signed-in';
import { hasFollowedOIDCRedirect } from '@/components/provider/passflow-provider';
import {
  type LoginCredentialsValues,
  type LoginMethodConfig,
  LoginScreen,
  type LoginScreenChrome,
  type LoginScreenState,
} from '@/components/ui';
import { routes, useSearchSource } from '@/context';
import { withError, withHydration } from '@/hocs';
import {
  useAntiBot,
  useAppSettings,
  useNavigation,
  usePassflow,
  usePasswordlessComplete,
  useProvider,
  useSignInEnding,
  useSignUp,
} from '@/hooks';
import { useAuthAgentTools } from '@/hooks/use-auth-agent-tools';
import type { DefaultMethod, FederatedLanding, SuccessAuthRedirect } from '@/types';
import {
  type AuthMethods,
  authRedirectErrorFrom,
  emailRegex,
  getAuthMethods,
  getInvitationAuthChrome,
  getPasswordlessData,
  getUrlErrors,
  routeToSecondFactor,
  urlWithoutParentChallenge,
  useUrlParams,
} from '@/utils';
import {
  AGENT_TOOL_OPTIONS,
  AGENT_TOOL_TEXT,
  credentialsFromIdentity,
  passwordlessStartAnswer,
  passwordPolicyAnswer,
  signInAnswer,
} from '@/utils/agent-tools';

const getSignUpMethodConfig = (authMethods: AuthMethods): LoginMethodConfig => {
  const identities: LoginMethodConfig['identities'] = [];

  if (authMethods.hasEmailMethods || authMethods.hasUsernameMethods) {
    const label =
      authMethods.hasEmailMethods && authMethods.hasUsernameMethods
        ? 'Email or username'
        : authMethods.hasUsernameMethods
          ? 'Username'
          : 'Email';
    identities.push({
      id: 'email_or_username',
      label,
      selectLabel: authMethods.hasUsernameMethods && !authMethods.hasEmailMethods ? 'Use username' : 'Use email',
      requiredMessage: `${label} is required`,
      format: authMethods.hasEmailMethods && !authMethods.hasUsernameMethods ? 'email' : undefined,
      password: authMethods.internal.email.password || authMethods.internal.username.password,
      passwordlessLabel: getPasswordlessData(authMethods, 'email_or_username')?.label,
    });
  }

  if (authMethods.hasPhoneMethods) {
    identities.push({
      id: 'phone',
      label: 'Phone number',
      selectLabel: 'Use phone',
      requiredMessage: 'Phone number is required',
      password: authMethods.internal.phone.password,
      passwordlessLabel: getPasswordlessData(authMethods, 'phone')?.label,
    });
  }

  return {
    identities,
    passkey: authMethods.passkey,
    providers: authMethods.fim.providers,
  };
};

export type TSignUp = {
  successAuthRedirect?: SuccessAuthRedirect;
  relyingPartyId?: string;
  federatedDisplayMode?: 'modal' | 'redirect';
  federatedLanding?: FederatedLanding;
  signInPath?: string;
  verifyOTPPath?: string;
  verifyMagicLinkPath?: string;
  twoFactorVerifyPath?: string;
};

const SignUpFormScreen: FC<TSignUp> = ({
  successAuthRedirect,
  relyingPartyId = window.location.hostname,
  federatedLanding,
  signInPath = routes.signin.path,
  verifyOTPPath = routes.verify_otp.path,
  verifyMagicLinkPath = routes.verify_magic_link.path,
  twoFactorVerifyPath = routes.two_factor_verify.path,
}) => {
  const passflow = usePassflow();
  const { navigate } = useNavigation();
  const { ending, retry, finishSignIn } = useSignInEnding();
  const searchSource = useSearchSource();
  const {
    appSettings,
    scopes,
    createTenantForNewUser,
    passwordPolicy,
    currentStyles,
    isError: isErrorApp,
    error: errorApp,
    loginAppTheme,
  } = useAppSettings();
  const { federatedWithRedirect } = useProvider(successAuthRedirect, createTenantForNewUser, federatedLanding);

  if (isErrorApp) throw new Error(errorApp);

  const authMethods = useMemo(() => getAuthMethods(appSettings?.auth_strategies), [appSettings]);
  const loginMethods = useMemo(() => getSignUpMethodConfig(authMethods), [authMethods]);
  const { error: errorUrl, message: messageUrl } = getUrlErrors();

  if (errorUrl) {
    console.error('[passflow] sign-up redirect returned an error', { error: errorUrl, message: messageUrl });
    throw new Error(authRedirectErrorFrom(errorUrl, messageUrl));
  }

  const { get } = useUrlParams({ invite_token: '' });
  const inviteToken = get('invite_token');
  const invitationChrome = getInvitationAuthChrome(inviteToken, 'sign-up');
  const { fetch, isError, error, readError, reset, isLoading, emailCode } = useSignUp();
  const passwordlessComplete = usePasswordlessComplete();

  // The server can answer a sign-up with a 2FA token in place of tokens, as it
  // does a sign-in, so the 2FA screen comes before any success redirect.
  const completeRegistration = async ({ oidcMayOwnRedirect = false } = {}) => {
    if (routeToSecondFactor(passflow, navigate, twoFactorVerifyPath ?? routes.two_factor_verify.path, searchSource.read()))
      return;
    if (oidcMayOwnRedirect && hasFollowedOIDCRedirect()) return;
    await finishSignIn(successAuthRedirect, appSettings?.defaults?.redirect);
  };

  // Resolves as soon as the outcome is known: the completion it starts may leave the page, and an agent tool still
  // needs its answer.
  const submitPassword = async (userPayload: PassflowUserPayload, options?: PassflowAuthOptions) => {
    const payload = {
      user: userPayload,
      create_tenant: createTenantForNewUser,
      ...(inviteToken ? { invite_token: inviteToken } : {}),
    } as PassflowSignUpPayload;

    const status = await fetch(payload, 'password', options);
    if (status) void completeRegistration({ oidcMayOwnRedirect: true });
    return status;
  };

  const submitPasskey = async () => {
    const payload = {
      relying_party_id: relyingPartyId,
      create_tenant: createTenantForNewUser,
      redirect_url: successAuthRedirect ?? '',
      ...(inviteToken ? { invite_token: inviteToken } : {}),
      scopes,
    } as PassflowPasskeyRegisterStartPayload;

    if (await fetch(payload, 'passkey')) await completeRegistration({ oidcMayOwnRedirect: true });
  };

  const startPasswordless = async (
    userPayload: Partial<PassflowPasswordlessSignInPayload>,
    method: DefaultMethod | null,
    options?: PassflowAuthOptions,
  ) => {
    const challengeType = getPasswordlessData(authMethods, method)?.challengeType;
    const payload = {
      ...userPayload,
      challenge_type: challengeType,
      create_tenant: createTenantForNewUser,
      ...(successAuthRedirect ? { redirect_url: successAuthRedirect } : {}),
      ...(inviteToken ? { invite_token: inviteToken } : {}),
    } as PassflowPasswordlessSignInPayload;

    return { payload, challengeType, response: await fetch(payload, 'passwordless', options) };
  };

  const submitPasswordless = async (userPayload: Partial<PassflowPasswordlessSignInPayload>, method: DefaultMethod | null) => {
    const { payload, challengeType, response } = await startPasswordless(userPayload, method);
    if (!response) return;

    // The match code is shown only by the tab holding it: it never goes in a URL.
    const { match_code: _matchCode, ...startAnswer } = response as PassflowPasswordlessResponse;
    const params = new URLSearchParams(searchSource.read());
    // The attempt's own address is the one sent at start, not one left on this page's URL.
    params.delete('redirect_url');
    const newParams = queryString.stringify({
      ...Object.fromEntries(params.entries()),
      ...payload,
      ...startAnswer,
      type: 'passwordless',
      challenge_type: challengeType,
      create_tenant: createTenantForNewUser,
    });

    if (challengeType === 'otp') navigate({ to: verifyOTPPath ?? routes.verify_otp.path, search: newParams });
    if (challengeType === 'magic_link')
      navigate({ to: verifyMagicLinkPath ?? routes.verify_magic_link.path, search: newParams });
  };

  const handlePassword = (values: LoginCredentialsValues, options?: PassflowAuthOptions) => {
    const isEmail = Boolean(values.emailOrUsername.match(emailRegex));
    const isUsername = values.method === 'email_or_username' && !isEmail && values.emailOrUsername.length > 0;
    const validatedPhone = phone(values.phone);
    const user = {
      ...(isEmail ? { email: values.emailOrUsername } : {}),
      ...(isUsername ? { username: values.emailOrUsername } : {}),
      ...(validatedPhone.isValid ? { phone_number: validatedPhone.phoneNumber } : {}),
      password: values.password,
      scopes,
    } as PassflowUserPayload;

    return submitPassword(user, options);
  };

  const passwordlessPayloadFrom = (values: LoginCredentialsValues) => {
    const isEmail = Boolean(values.emailOrUsername.match(emailRegex));
    const validatedPhone = phone(values.phone);
    return {
      ...(isEmail ? { email: values.emailOrUsername } : {}),
      ...(validatedPhone.isValid ? { phone: validatedPhone.phoneNumber } : {}),
      scopes,
    } as Partial<PassflowPasswordlessSignInPayload>;
  };

  const handlePasswordless = async (values: LoginCredentialsValues) => {
    await submitPasswordless(passwordlessPayloadFrom(values), values.method);
  };

  const handleProvider = (provider: Providers, options?: PassflowAuthOptions) =>
    federatedWithRedirect(provider, inviteToken ?? undefined, options);

  // The emailed code answers like a sign-up: the same 2FA, OIDC and redirect path follows.
  const verifyEmailCode = async (code: string) => {
    if (await emailCode.verify(code)) await completeRegistration({ oidcMayOwnRedirect: true });
  };

  const resendEmailCode = async () => {
    if (await emailCode.resend()) await completeRegistration({ oidcMayOwnRedirect: true });
  };

  const antiBot = useAntiBot(appSettings);

  // An agent runs the same handlers as the screen. A passwordless start stays on this page, so the code can be
  // completed through the tools registered here.
  useAuthAgentTools({
    flow: 'sign-up',
    appSettings,
    authMethods,
    actions: {
      password: async ({ identity, password }) => {
        // The screen checks the password rules before it sends; so does the tool.
        const refusal = passwordPolicyAnswer(passwordPolicy, password);
        if (refusal) return refusal;
        return signInAnswer(await handlePassword(credentialsFromIdentity(identity, password), AGENT_TOOL_OPTIONS), readError());
      },
      startPasswordless: async ({ identity }) => {
        const values = credentialsFromIdentity(identity);
        const start = await startPasswordless(passwordlessPayloadFrom(values), values.method, AGENT_TOOL_OPTIONS);
        return passwordlessStartAnswer(identity.value, start, readError());
      },
      completePasswordless: async ({ challengeId, code }) => {
        const response = await passwordlessComplete.fetch(
          { challenge_id: challengeId, challenge_type: 'otp', otp: code },
          AGENT_TOOL_OPTIONS,
        );
        if (!response) return { text: passwordlessComplete.readError() || AGENT_TOOL_TEXT.failed, isError: true };
        const outcome = passflow.isTwoFactorVerificationRequired() ? 'two-factor-required' : 'signed-in';
        void completeRegistration({ oidcMayOwnRedirect: true });
        return signInAnswer(outcome, null);
      },
      startSocial: async ({ provider }) => {
        handleProvider(provider, AGENT_TOOL_OPTIONS);
        return { text: AGENT_TOOL_TEXT.social(provider) };
      },
    },
  });

  // The application name set in the admin panel's Login Appearance.
  const appName = loginAppTheme?.application_name?.trim();
  const chrome: LoginScreenChrome = {
    title: invitationChrome?.title ?? 'Create your account',
    subtitle: invitationChrome?.subtitle ?? (appName ? `For ${appName}` : undefined),
    variant: 'sign-in',
    customCss: currentStyles?.custom_css,
    customLogo: currentStyles?.logo_url,
    customLogoAlt: `${loginAppTheme?.application_name ?? 'Application'} logo`,
    removeBranding: loginAppTheme?.remove_passflow_logo,
  };

  if (ending !== 'none') return <SignInEndingScreen ending={ending} onRetry={retry} />;

  const { step } = emailCode;

  if (step.kind !== 'none') {
    const stepState: LoginScreenState =
      step.kind === 'code'
        ? {
            kind: 'email-code',
            message: step.message,
            error: emailCode.error,
            busy: emailCode.isVerifying,
            resend: {
              restartKey: step.challengeId,
              busy: emailCode.isResending,
              onResend: () => void resendEmailCode(),
            },
            secondaryAction: { label: 'Use a different email', onClick: emailCode.cancel },
            onSubmit: (code) => void verifyEmailCode(code),
          }
        : {
            kind: 'status',
            tone: 'info',
            message: step.message,
            primaryAction: { label: 'Back to sign up', onClick: emailCode.cancel },
          };

    return (
      <LoginScreen
        chrome={{
          ...chrome,
          title: 'Check your email',
          subtitle:
            step.kind === 'code' ? 'Enter the code to finish creating your account' : 'Follow the link to finish signing up',
        }}
        state={stepState}
        antiBot={antiBot}
      />
    );
  }

  return (
    <LoginScreen
      chrome={chrome}
      antiBot={antiBot}
      state={{
        kind: 'credentials',
        methods: loginMethods,
        passwordPolicy,
        credentialPurpose: 'sign-up',
        forcePasskey: Boolean(appSettings?.force_passwordless_login && authMethods.passkey),
        allowPasskeyToggle: true,
        busy: isLoading,
        primaryLabel: isLoading ? 'Creating account…' : 'Sign Up',
        passwordlessLabelPrefix: 'Sign Up with',
        passkeyLabel: 'Sign Up with a Passkey',
        error: isError ? error : null,
        footer: {
          prompt: 'Already have an account?',
          label: 'Sign In',
          to: signInPath ?? routes.signin.path,
          search: searchSource.read(),
        },
        onPassword: (values) => void handlePassword(values),
        onPasswordless: (values) => void handlePasswordless(values),
        onPasskey: () => void submitPasskey(),
        onProvider: (provider) => handleProvider(provider),
        onReset: reset,
        onStartAgain: () => window.location.assign(urlWithoutParentChallenge(window.location.href)),
      }}
    />
  );
};

export const SignUpForm = withHydration(SignUpFormScreen);

export const SignUp = withError(SignUpFormScreen, ErrorComponent);
