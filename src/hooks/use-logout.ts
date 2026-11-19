import type { LogOutOptions } from '@passflow/core';
import { useCallback, useState } from 'react';
import { usePassflow } from './use-passflow';

export type UseLogoutProps = () => {
  /** After a hosted sign-in core leaves the page once signed out, so code after `await fetch()` may not run. */
  fetch: (options?: LogOutOptions) => Promise<boolean>;
  isLoading: boolean;
  isError: boolean;
  error: string;
};

export const useLogout: UseLogoutProps = () => {
  const passflow = usePassflow();
  const [errorMessage, setErrorMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetch = useCallback(
    async (options?: LogOutOptions): Promise<boolean> => {
      try {
        setIsLoading(true);
        await passflow.logOut(options);
        setIsLoading(false);
        return true;
      } catch (e) {
        setIsError(true);
        const error = e as Error;
        setErrorMessage(error.message);
        return false;
      }
    },
    [passflow],
  );

  return { fetch, isLoading, isError, error: errorMessage } as const;
};
