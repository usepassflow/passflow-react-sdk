import type {
  PassflowAuthOptions,
  PassflowPasskeyAuthenticateStartPayload,
  PassflowPasswordlessResponse,
  PassflowPasswordlessSignInPayload,
  PassflowSignInPayload,
} from '@passflow/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthOperation, AuthUiError } from '@/types';
import {
  authErrorFor,
  authErrorFrom,
  passwordChangeRequiredErrorId,
  passwordChangeRequiredMessage,
  serverErrorIdFrom,
  serverMessageFor,
} from '@/utils';
import { type UseEmailCodeStep, useEmailCodeStep } from './use-email-code-step';
import { usePassflow } from './use-passflow';

/**
 * How a password or passkey sign-in ended. `'two-factor-required'` means core holds a pending sign-in that still owes
 * a second factor: there is no session yet.
 */
export type SignInOutcome = 'signed-in' | 'two-factor-required';

export type UseSignInOptions = {
  /**
   * Called when the server refuses the sign-in until the password is changed. `fetch` then resolves `false` and sets
   * no form error; send the user to the password reset. `notice` is the server's message for the user. Without this
   * option, the same message shows as the form error.
   */
  onPasswordChangeRequired?: (notice: string) => void;
};

export type UseSignInProps = (options?: UseSignInOptions) => {
  /**
   * Resolves a {@link SignInOutcome} for a password or passkey sign-in, the server's answer for a passwordless one,
   * and `false` when the request failed, was superseded, or entered the emailed-code step. `options` is passed to
   * core as the request's last argument.
   */
  fetch: (
    payload: PassflowPasskeyAuthenticateStartPayload | PassflowSignInPayload | PassflowPasswordlessSignInPayload,
    type: AuthOperation,
    options?: PassflowAuthOptions,
  ) => Promise<false | SignInOutcome | PassflowPasswordlessResponse>;
  isLoading: boolean;
  isError: boolean;
  error: AuthUiError | null;
  /** The error the latest fetch set; null after a success, a reset or a cancel. Synchronous, unlike `error`. */
  readError: () => AuthUiError | null;
  reset: () => void;
  /** Abandons the passkey request in flight: the form returns with a cancelled error, and this hook ignores the request's late result. core may still finish a sign-in that completes later. */
  cancelPasskey: () => void;
  /** The sign-in method whose request is in flight, `null` when none is. */
  pendingOperation: AuthOperation | null;
  /**
   * The emailed-code step. A password request the server answers with a code (or a link) enters it, and `fetch`
   * resolves `false`: there is no session yet.
   */
  emailCode: UseEmailCodeStep;
};

export const useSignIn: UseSignInProps = ({ onPasswordChangeRequired } = {}) => {
  const passflow = usePassflow();
  const onPasswordChangeRequiredRef = useRef(onPasswordChangeRequired);
  onPasswordChangeRequiredRef.current = onPasswordChangeRequired;
  // The password request is kept only to repeat it for "Resend code"; never rendered, logged or stored.
  const lastPasswordPayloadRef = useRef<PassflowSignInPayload | null>(null);
  const resendPasswordRequest = useCallback(async () => {
    const payload = lastPasswordPayloadRef.current;
    if (!payload) throw new Error('Nothing to resend');
    return passflow.signIn(payload);
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
  const [error, setErrorState] = useState<AuthUiError | null>(null);
  // Read right after `await fetch()`, before the state above has rendered.
  const errorRef = useRef<AuthUiError | null>(null);
  const setError = useCallback((value: AuthUiError | null) => {
    errorRef.current = value;
    setErrorState(value);
  }, []);
  const readError = useCallback(() => errorRef.current, []);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<AuthOperation | null>(null);
  const attemptRef = useRef(0);

  const fetch = useCallback(
    async (
      payload: PassflowPasskeyAuthenticateStartPayload | PassflowSignInPayload | PassflowPasswordlessSignInPayload,
      type: AuthOperation,
      options?: PassflowAuthOptions,
    ): Promise<false | SignInOutcome | PassflowPasswordlessResponse> => {
      attemptRef.current += 1;
      const attempt = attemptRef.current;
      const isCurrent = () => attempt === attemptRef.current;
      setIsLoading(true);
      setPendingOperation(type);
      setIsError(false);
      setError(null);

      try {
        if (type === 'password') {
          const answer = await passflow.signIn(payload as PassflowSignInPayload, options);
          if (!isCurrent()) return false;
          // Held before entering: a link answer releases it at once, a code answer keeps it for resend.
          lastPasswordPayloadRef.current = payload as PassflowSignInPayload;
          if (emailCode.enter(answer)) return false;
          lastPasswordPayloadRef.current = null;
        } else if (type === 'passkey') {
          await passflow.passkeyAuthenticate(payload as PassflowPasskeyAuthenticateStartPayload, options);
        } else {
          const answer = await passflow.passwordlessSignIn(payload as PassflowPasswordlessSignInPayload, options);
          return isCurrent() ? answer : false;
        }
        if (!isCurrent()) return false;
        return passflow.isTwoFactorVerificationRequired() ? 'two-factor-required' : 'signed-in';
      } catch (error) {
        if (!isCurrent()) return false;
        const handlePasswordChange = onPasswordChangeRequiredRef.current;
        if (handlePasswordChange && serverErrorIdFrom(error) === passwordChangeRequiredErrorId) {
          handlePasswordChange(serverMessageFor(error) ?? passwordChangeRequiredMessage);
          return false;
        }
        console.error(`[passflow] ${type} sign-in failed`, error);
        setIsError(true);
        setError(authErrorFrom(error, 'sign-in', type));
        return false;
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
          setPendingOperation(null);
        }
      }
    },
    [
      passflow.passkeyAuthenticate,
      passflow.passwordlessSignIn,
      passflow.signIn,
      passflow.isTwoFactorVerificationRequired,
      emailCode.enter,
      setError,
    ],
  );

  const reset = () => {
    setIsError(false);
    setError(null);
    setIsLoading(false);
    setPendingOperation(null);
  };

  const cancelPasskey = useCallback(() => {
    attemptRef.current += 1;
    setIsLoading(false);
    setPendingOperation(null);
    setIsError(true);
    setError({ message: 'Passkey sign-in was cancelled.', scope: authErrorFor('sign-in', 'passkey').scope });
  }, [setError]);

  return { fetch, isLoading, isError, error, readError, reset, cancelPasskey, pendingOperation, emailCode } as const;
};
