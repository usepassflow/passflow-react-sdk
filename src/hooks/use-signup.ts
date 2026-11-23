import type {
  PassflowAuthOptions,
  PassflowPasskeyRegisterStartPayload,
  PassflowPasswordlessResponse,
  PassflowPasswordlessSignInPayload,
  PassflowSignUpPayload,
} from '@passflow/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthOperation, AuthUiError } from '@/types';
import { authErrorFrom } from '@/utils';
import { type UseEmailCodeStep, useEmailCodeStep } from './use-email-code-step';
import { usePassflow } from './use-passflow';
import type { SignInOutcome } from './use-signin';

export type UseSignUpProps = () => {
  /**
   * Resolves a {@link SignInOutcome} for a password or passkey sign-up, the server's answer for a passwordless one,
   * and `false` when the request failed or entered the emailed-code step. `options` is passed to core as the
   * request's last argument.
   */
  fetch: (
    payload: PassflowPasskeyRegisterStartPayload | PassflowSignUpPayload | PassflowPasswordlessSignInPayload,
    type: AuthOperation,
    options?: PassflowAuthOptions,
  ) => Promise<false | SignInOutcome | PassflowPasswordlessResponse>;
  isLoading: boolean;
  isError: boolean;
  error: AuthUiError | null;
  /** The error the latest fetch set; null after a success or a reset. Synchronous, unlike `error`. */
  readError: () => AuthUiError | null;
  reset: () => void;
  /**
   * The emailed-code step. A password request the server answers with a code (or a link) enters it, and `fetch`
   * resolves `false`: there is no session yet.
   */
  emailCode: UseEmailCodeStep;
};

export const useSignUp: UseSignUpProps = () => {
  const passflow = usePassflow();
  // The password request is kept only to repeat it for "Resend code"; never rendered, logged or stored.
  const lastPasswordPayloadRef = useRef<PassflowSignUpPayload | null>(null);
  const resendPasswordRequest = useCallback(async () => {
    const payload = lastPasswordPayloadRef.current;
    if (!payload) throw new Error('Nothing to resend');
    return passflow.signUp(payload);
  }, [passflow]);
  const emailCode = useEmailCodeStep({
    resend: resendPasswordRequest,
    onRelease: () => {
      lastPasswordPayloadRef.current = null;
    },
  });

  useEffect(
    () => () => {
      lastPasswordPayloadRef.current = null;
    },
    [],
  );
  const [isError, setIsError] = useState(false);
  const [error, setErrorState] = useState<AuthUiError | null>(null);
  // Read right after `await fetch()`, before the state above has rendered.
  const errorRef = useRef<AuthUiError | null>(null);
  const setError = useCallback((value: AuthUiError | null) => {
    errorRef.current = value;
    setErrorState(value);
  }, []);
  const readError = useCallback(() => errorRef.current, []);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(
    async (
      payload: PassflowPasskeyRegisterStartPayload | PassflowSignUpPayload | PassflowPasswordlessSignInPayload,
      type: AuthOperation,
      options?: PassflowAuthOptions,
    ): Promise<false | SignInOutcome | PassflowPasswordlessResponse> => {
      setIsLoading(true);
      setIsError(false);
      setError(null);
      const cleanup = () => setIsLoading(false);

      try {
        if (type === 'password') {
          const answer = await passflow.signUp(payload as PassflowSignUpPayload, options);
          // Held before entering: a link answer releases it at once, a code answer keeps it for resend.
          lastPasswordPayloadRef.current = payload as PassflowSignUpPayload;
          if (emailCode.enter(answer)) return false;
          lastPasswordPayloadRef.current = null;
        } else if (type === 'passkey') {
          await passflow.passkeyRegister(payload as PassflowPasskeyRegisterStartPayload, options);
        } else {
          const passwordlessResponse = await passflow.passwordlessSignIn(payload as PassflowPasswordlessSignInPayload, options);
          cleanup();
          return passwordlessResponse;
        }
        cleanup();
        return passflow.isTwoFactorVerificationRequired() ? 'two-factor-required' : 'signed-in';
      } catch (error) {
        console.error(`[passflow] ${type} sign-up failed`, error);
        setIsError(true);
        setError(authErrorFrom(error, 'sign-up', type));
        cleanup();
        return false;
      } finally {
        cleanup();
      }
    },
    [
      passflow.signUp,
      passflow.passkeyRegister,
      passflow.passwordlessSignIn,
      passflow.isTwoFactorVerificationRequired,
      emailCode.enter,
      setError,
    ],
  );

  const reset = () => {
    setIsError(false);
    setError(null);
    setIsLoading(false);
  };

  return { fetch, isLoading, isError, error, readError, reset, emailCode } as const;
};
