import type { PassflowUserSession } from '@passflow/core';
import { useCallback, useState } from 'react';
import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';
import { usePassflow } from './use-passflow';

export type UseSessionsProps = () => {
  /** The signed-in user's sessions, one per sign-in on any device or app. `current` marks this one. */
  data: PassflowUserSession[];
  refetch: () => Promise<PassflowUserSession[] | null>;
  /**
   * Ends one session. On success the session leaves `data` without a refetch.
   * Ending the current session signs out like `logout()`; after a hosted sign-in the page then
   * leaves for the hosted end-session page, so code after `await revoke()` may not run.
   *
   * @returns true when the server ended it
   */
  revoke: (sessionId: string) => Promise<boolean>;
  /**
   * Ends every session except the current one. On success only the current session stays in `data`.
   *
   * @returns how many sessions the server ended, or null when the request failed
   */
  signOutOthers: () => Promise<number | null>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
};

/**
 * Hook to list the signed-in user's sessions and end them
 */
export const useSessions: UseSessionsProps = () => {
  const passflow = usePassflow();
  const [data, setData] = useState<PassflowUserSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const start = useCallback(() => {
    setIsLoading(true);
    setIsError(false);
    setErrorMessage('');
  }, []);

  const fail = useCallback((e: unknown) => {
    setIsError(true);
    setErrorMessage((e as Error).message);
  }, []);

  const fetch = useCallback(async (): Promise<PassflowUserSession[] | null> => {
    start();
    try {
      const sessions = await passflow.listSessions();
      setData(sessions);
      return sessions;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [passflow, start, fail]);

  const revoke = useCallback(
    async (sessionId: string): Promise<boolean> => {
      start();
      try {
        await passflow.revokeSession(sessionId);
        setData((sessions) => sessions.filter((session) => session.id !== sessionId));
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [passflow, start, fail],
  );

  const signOutOthers = useCallback(async (): Promise<number | null> => {
    start();
    try {
      const { revoked } = await passflow.signOutOtherSessions();
      setData((sessions) => sessions.filter((session) => session.current));
      return revoked;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [passflow, start, fail]);

  useIsomorphicLayoutEffect(() => {
    void fetch();
  }, [fetch]);

  return {
    data,
    refetch: fetch,
    revoke,
    signOutOthers,
    isLoading,
    isError,
    errorMessage,
  };
};
