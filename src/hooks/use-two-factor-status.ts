import type { TwoFactorStatusResponse } from '@passflow/core';
import { useCallback, useState } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';
import { usePassflow } from './use-passflow';

export type UseTwoFactorStatusProps = () => {
  data: TwoFactorStatusResponse | null;
  refetch: () => Promise<TwoFactorStatusResponse | null>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
};

/**
 * Hook to get the current 2FA enrollment status
 */
export const useTwoFactorStatus: UseTwoFactorStatusProps = () => {
  const passflow = usePassflow();
  const [data, setData] = useState<TwoFactorStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const fetch = useCallback(async (): Promise<TwoFactorStatusResponse | null> => {
    setIsLoading(true);
    setIsError(false);
    setErrorMessage('');
    try {
      const response = await passflow.getTwoFactorStatus();
      setData(response);
      return response;
    } catch (e) {
      setIsError(true);
      const error = e as Error;
      setErrorMessage(error.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [passflow]);

  useIsomorphicLayoutEffect(() => {
    void fetch();
  }, [fetch]);

  return {
    data,
    refetch: fetch,
    isLoading,
    isError,
    errorMessage,
  };
};
