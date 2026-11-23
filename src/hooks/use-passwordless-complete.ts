import type {
  PassflowAuthOptions,
  PassflowPasswordlessSignInCompletePayload,
  PassflowValidationResponse,
} from '@passflow/core';
import { useCallback, useRef, useState } from 'react';
import { passwordlessCompleteErrorMessage } from '@/utils';
import { usePassflow } from './use-passflow';

export type UsePasswordlessCompleteProps = () => {
  /** `options` is passed to core as the request's last argument. */
  fetch: (
    payload: PassflowPasswordlessSignInCompletePayload,
    options?: PassflowAuthOptions,
  ) => Promise<PassflowValidationResponse | null>;
  isLoading: boolean;
  isError: boolean;
  error: string;
  /** The same text as `error` (`''` when none), readable right after `await fetch()`. */
  readError: () => string;
  reset: () => void;
};

export const usePasswordlessComplete: UsePasswordlessCompleteProps = () => {
  const passflow = usePassflow();
  const [errorMessage, setErrorMessageState] = useState('');
  const errorRef = useRef('');
  const setErrorMessage = useCallback((value: string) => {
    errorRef.current = value;
    setErrorMessageState(value);
  }, []);
  const readError = useCallback(() => errorRef.current, []);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(
    async (
      payload: PassflowPasswordlessSignInCompletePayload,
      options?: PassflowAuthOptions,
    ): Promise<PassflowValidationResponse | null> => {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage('');

      try {
        return await passflow.passwordlessSignInComplete(payload, options);
      } catch (error) {
        console.error('[passflow] passwordless verification failed', error);
        setIsError(true);
        setErrorMessage(passwordlessCompleteErrorMessage(error));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [passflow, setErrorMessage],
  );

  const reset = () => {
    setIsError(false);
    setErrorMessage('');
    setIsLoading(false);
  };

  return {
    fetch,
    isLoading,
    isError,
    error: errorMessage,
    readError,
    reset,
  } as const;
};
