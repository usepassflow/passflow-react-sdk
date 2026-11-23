import type {
  PassflowAuthOptions,
  PassflowPasskeyAuthenticateStartPayload,
  PassflowPasswordlessResponse,
  PassflowPasswordlessSignInPayload,
  PassflowSignInPayload,
  Providers,
} from '@passflow/core';
import { phone } from 'phone';
import queryString from 'query-string';
import type { FC } from 'react';
import { useMemo, useRef } from 'react';
import { ErrorComponent } from '@/components/error';
import { SignInEndingScreen } from '@/components/form/signed-in';
import { hasFollowedOIDCRedirect, readParentChallengeIdFromURL } from '@/components/provider/passflow-provider';
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
  useSignIn,
  useSignInEnding,
} from '@/hooks';
import { useAuthAgentTools } from '@/hooks/use-auth-agent-tools';
import type { FederatedLanding, SuccessAuthRedirect } from '@/types';
import {
  type AuthMethods,
  authRedirectErrorFrom,
  emailRegex,
  getAuthMethods,
  getIdentityLabel,
  getInvitationAuthChrome,
  getPasswordlessData,
  getUrlErrors,
  passwordChangeRequiredReason,
  routeToSecondFactor,
  urlWithoutParentChallenge,
  useUrlParams,
} from '@/utils';
import {
  AGENT_TOOL_OPTIONS,
  AGENT_TOOL_TEXT,
  credentialsFromIdentity,
  passwordlessStartAnswer,
  signInAnswer,
} from '@/utils/agent-tools';

const getLoginMethodConfig = (authMethods: AuthMethods): LoginMethodConfig => {
  const identities: LoginMethodConfig['identities'] = [];

  if (authMethods.hasSignInEmailMethods || authMethods.hasSignInUsernameMethods) {
    const label = getIdentityLabel(authMethods, 'label') ?? 'Email or username';
    identities.push({
      id: 'email_or_username',
      label,
      selectLabel: getIdentityLabel(authMethods, 'button') ?? 'Use email',
      requiredMessage: `${label} is required`,
      format: authMethods.hasSignInEmailMethods && !authMethods.hasSignInUsernameMethods ? 'email' : undefined,
      password: authMethods.internal.email.password || authMethods.internal.username.password,
      passwordlessLabel: getPasswordlessData(authMethods, 'email_or_username')?.label,
    });
  }

  if (authMethods.hasSignInPhoneMethods) {
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

export type TSignIn = {
  successAuthRedirect?: SuccessAuthRedirect;
  relyingPartyId?: string;
  federatedDisplayMode?: 'modal' | 'redirect';
  federatedLanding?: FederatedLanding;
  signUpPath?: string;
  verifyOTPPath?: string;
  verifyMagicLinkPath?: string;
  forgotPasswordPath?: string;
  twoFactorVerifyPath?: string;
};

const SignInFormScreen: FC<TSignIn> = ({
  successAuthRedirect,
  relyingPartyId = window.location.hostname,
  federatedLanding,
  signUpPath = routes.signup.path,
  verifyOTPPath = routes.verify_otp.path,
  verifyMagicLinkPath = routes.verify_magic_link.path,
  forgotPasswordPath = routes.forgot_password.path,
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
  const loginMethods = useMemo(() => getLoginMethodConfig(authMethods), [authMethods]);
  const { error: errorUrl, message: messageUrl } = getUrlErrors();

  if (errorUrl) {
    console.error('[passflow] sign-in redirect returned an error', { error: errorUrl, message: messageUrl });
    throw new Error(authRedirectErrorFrom(errorUrl, messageUrl));
  }

  const { get } = useUrlParams({ invite_token: '' });
  const inviteToken = get('invite_token');
  const invitationChrome = getInvitationAuthChrome(inviteToken, 'sign-in');
  // The identifier of the password sign-in in flight, carried to forgot-password if the password must change.
  const passwordIdentityRef = useRef<Pick<PassflowSignInPayload, 'email' | 'username' | 'phone'>>({});
  const goToPasswordReset = () => {
    const identity = passwordIdentityRef.current;
    const params = new URLSearchParams(searchSource.read());
    for (const name of ['email', 'username', 'phone']) params.delete(name);
    navigate({
      to: forgotPasswordPath ?? routes.forgot_password.path,
      search: queryString.stringify({
        ...Object.fromEntries(params.entries()),
        ...identity,
        default_method: identity.phone ? 'phone' : 'email_or_username',
        reason: passwordChangeRequiredReason,
      }),
    });
  };
  const { fetch, isError, error, readError, reset, cancelPasskey, isLoading, pendingOperation, emailCode } = useSignIn({
    onPasswordChangeRequired: goToPasswordReset,
  });
  const passwordlessComplete = usePasswordlessComplete();

  const oidcLayerOwnsRedirect = (): boolean => {
    if (hasFollowedOIDCRedirect()) return true;
    if (readParentChallengeIdFromURL()) {
      console.error(
        '[passflow] login took the legacy token path while parent_challenge_id is present on the URL — the OIDC interceptor did not engage and the RP redirect will not happen',
      );
    }
    return false;
  };

  const completeAuthentication = async () => {
    if (routeToSecondFactor(passflow, navigate, twoFactorVerifyPath ?? routes.two_factor_verify.path, searchSource.read()))
      return;
    if (oidcLayerOwnsRedirect()) return;
    await finishSignIn(successAuthRedirect, appSettings?.defaults?.redirect);
  };

  // Resolves as soon as the outcome is known: the completion it starts may leave the page, and an agent tool still
  // needs its answer.
  const submitPassword = async (userPayload: PassflowSignInPayload, options?: PassflowAuthOptions) => {
    const payload = {
      ...userPayload,
      ...(inviteToken && { invite_token: inviteToken }),
    } as PassflowSignInPayload;

    const { email, username, phone: phoneNumber } = userPayload;
    passwordIdentityRef.current = {
      ...(email && { email }),
      ...(username && { username }),
      ...(phoneNumber && { phone: phoneNumber }),
    };
    const status = await fetch(payload, 'password', options);
    if (status) void completeAuthentication();
    return status;
  };

  const submitPasskey = async (passkeyPayload: PassflowPasskeyAuthenticateStartPayload) => {
    const payload = {
      ...passkeyPayload,
      ...(inviteToken && { invite_token: inviteToken }),
    } as PassflowPasskeyAuthenticateStartPayload;

    passwordIdentityRef.current = {};
    const response = await fetch(payload, 'passkey');
    if (response) await completeAuthentication();
  };

  const startPasswordless = async (
    userPayload: Partial<PassflowPasswordlessSignInPayload>,
    method: LoginCredentialsValues['method'],
    options?: PassflowAuthOptions,
  ) => {
    const challengeType = getPasswordlessData(authMethods, method)?.challengeType;
    const payload = {
      ...userPayload,
      challenge_type: challengeType,
      create_tenant: createTenantForNewUser,
      ...(successAuthRedirect && { redirect_url: successAuthRedirect }),
      ...(inviteToken && { invite_token: inviteToken }),
    } as PassflowPasswordlessSignInPayload;

    passwordIdentityRef.current = {};
    return { payload, challengeType, response: await fetch(payload, 'passwordless', options) };
  };

  const submitPasswordless = async (
    userPayload: Partial<PassflowPasswordlessSignInPayload>,
    method: LoginCredentialsValues['method'],
  ) => {
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
    const payload = {
      ...(isEmail && { email: values.emailOrUsername }),
      ...(isUsername && { username: values.emailOrUsername }),
      ...(validatedPhone.isValid && { phone: validatedPhone.phoneNumber }),
      scopes,
      password: values.password,
    };

    return submitPassword(payload as PassflowSignInPayload, options);
  };

  const passwordlessPayloadFrom = (values: LoginCredentialsValues) => {
    const isEmail = Boolean(values.emailOrUsername.match(emailRegex));
    const validatedPhone = phone(values.phone);
    return {
      ...(isEmail && { email: values.emailOrUsername }),
      ...(validatedPhone.isValid && { phone: validatedPhone.phoneNumber }),
      scopes,
    } as Partial<PassflowPasswordlessSignInPayload>;
  };

  const handlePasswordless = async (values: LoginCredentialsValues) => {
    await submitPasswordless(passwordlessPayloadFrom(values), values.method);
  };

  const handlePasskey = async () => {
    await submitPasskey({ relying_party_id: relyingPartyId, scopes });
  };

  const handleProvider = (provider: Providers, options?: PassflowAuthOptions) =>
    federatedWithRedirect(provider, inviteToken ?? undefined, options);

  // The emailed code answers like a sign-in: the same 2FA, OIDC and redirect path follows.
  const verifyEmailCode = async (code: string) => {
    if (await emailCode.verify(code)) await completeAuthentication();
  };

  const resendEmailCode = async () => {
    if (await emailCode.resend()) await completeAuthentication();
  };

  const antiBot = useAntiBot(appSettings);

  // An agent runs the same handlers as the screen. A passwordless start stays on this page, so the code can be
  // completed through the tools registered here.
  useAuthAgentTools({
    flow: 'sign-in',
    appSettings,
    authMethods,
    actions: {
      password: async ({ identity, password }) =>
        signInAnswer(await handlePassword(credentialsFromIdentity(identity, password), AGENT_TOOL_OPTIONS), readError()),
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
        void completeAuthentication();
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
    title: invitationChrome?.title ?? 'Sign In to your account',
    subtitle: invitationChrome?.subtitle ?? (appName ? `To ${appName}` : undefined),
    variant: 'sign-in',
    customCss: currentStyles?.custom_css,
    customLogo: currentStyles?.logo_url,
    customLogoAlt: `${loginAppTheme?.application_name ?? 'Application'} logo`,
    removeBranding: loginAppTheme?.remove_passflow_logo,
  };

  if (ending !== 'none') return <SignInEndingScreen ending={ending} onRetry={retry} />;

  const { step } = emailCode;

  if (step.kind !== 'none') {
    // The server does not answer a sign-in with a link today; the state is mapped anyway.
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
            secondaryAction: { label: 'Use a different account', onClick: emailCode.cancel },
            onSubmit: (code) => void verifyEmailCode(code),
          }
        : {
            kind: 'status',
            tone: 'info',
            message: step.message,
            primaryAction: { label: 'Back to sign in', onClick: emailCode.cancel },
          };

    return (
      <LoginScreen
        chrome={{
          ...chrome,
          title: step.kind === 'code' ? 'Verify your email' : 'Check your email',
          subtitle: step.kind === 'code' ? 'Enter the code to finish signing in' : 'Follow the link to finish signing in',
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
        forcePasskey: Boolean(appSettings?.force_passwordless_login && authMethods.passkey),
        allowPasskeyToggle: true,
        busy: isLoading,
        onCancel: isLoading && pendingOperation === 'passkey' ? cancelPasskey : undefined,
        primaryLabel: isLoading ? 'Signing in…' : 'Sign In',
        error: isError ? error : null,
        forgotPassword: {
          to: forgotPasswordPath ?? routes.forgot_password.path,
          getSearch: (method) =>
            queryString.stringify({
              ...queryString.parse(searchSource.read()),
              default_method: method,
            }),
        },
        footer: {
          prompt: "Don't have an account?",
          label: 'Sign Up',
          to: signUpPath ?? routes.signup.path,
          search: searchSource.read(),
        },
        onPassword: (values) => void handlePassword(values),
        onPasswordless: (values) => void handlePasswordless(values),
        onPasskey: () => void handlePasskey(),
        onProvider: (provider) => handleProvider(provider),
        onReset: reset,
        onStartAgain: () => window.location.assign(urlWithoutParentChallenge(window.location.href)),
      }}
    />
  );
};

export const SignInForm = withHydration(SignInFormScreen);

export const SignIn = withError(SignInFormScreen, ErrorComponent);
