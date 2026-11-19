import {
  type LogOutOptions,
  type ParsedTokens,
  PassflowEvent,
  type PassflowSubscriber,
  type SessionExpiredReason,
  type Tokens,
} from '@passflow/core';
import { createContext, type FC, type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { useHydrated } from '../hooks/use-hydrated';
import { usePassflow } from '../hooks/use-passflow';

export type SessionExpiredHandler = (reason: SessionExpiredReason) => void;

export type AuthContextValue = {
  isAuthenticated: () => boolean;
  /** Whether a user is signed in. Updates on sign-in, sign-up, sign-out and session expiry, so a component can render on it. */
  isSignedIn: boolean;
  /**
   * Signs the user out. After a hosted sign-in core then leaves the page for the hosted login's sign-out, which ends
   * at `postLogoutRedirectUri`, so code after `await logout()` may not run.
   */
  logout: (options?: LogOutOptions) => Promise<void>;
  isLoading: boolean;
  isSessionExpired: boolean;
  getTokens: (doRefresh: boolean) => Promise<{ tokens: Tokens | undefined; parsedTokens: ParsedTokens | undefined }>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export type AuthProviderProps = PropsWithChildren<{
  /**
   * Called when the session has really ended: last auth strike, no successor token pair
   * in time, or another user's tokens in storage. A transient refresh failure keeps the
   * session and does not call this. Use this to redirect to your login page.
   */
  onSessionExpired?: SessionExpiredHandler;
}>;

export const AuthProvider: FC<AuthProviderProps> = ({ children, onSessionExpired }) => {
  const passflow = usePassflow();
  const hydrated = useHydrated();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => passflow.isAuthenticated());

  useEffect(() => {
    // The session may have changed between the first render and this subscription.
    setIsSignedIn(passflow.isAuthenticated());
    const subscriber: PassflowSubscriber = {
      onAuthChange: (eventType, payload) => {
        setIsSignedIn(passflow.isAuthenticated());
        if (eventType === PassflowEvent.SessionExpired) {
          const reason = (payload as { reason?: SessionExpiredReason })?.reason ?? 'refresh_failed';
          setIsSessionExpired(true);
          onSessionExpired?.(reason);
        } else if (eventType === PassflowEvent.SignIn || eventType === PassflowEvent.Register) {
          // Reset session expired state on successful auth
          setIsSessionExpired(false);
        }
      },
    };

    passflow.subscribe(subscriber, [
      PassflowEvent.SessionExpired,
      PassflowEvent.SignIn,
      PassflowEvent.Register,
      PassflowEvent.SignOut,
    ]);

    return () => {
      passflow.unsubscribe(subscriber);
    };
  }, [passflow, onSessionExpired]);

  const isAuthenticated = useCallback(() => passflow.isAuthenticated(), [passflow]);

  const getTokens = useCallback(
    async (doRefresh: boolean) => {
      setIsLoading(true);

      try {
        const tokens = await passflow.getTokens(doRefresh);
        const parsedTokens = tokens ? passflow.getParsedTokens() : undefined;

        return {
          tokens,
          parsedTokens,
        };
      } catch (e) {
        return {
          tokens: undefined,
          parsedTokens: undefined,
        };
      } finally {
        setIsLoading(false);
      }
    },
    [passflow],
  );

  const logout = useCallback(
    async (options?: LogOutOptions) => {
      try {
        await passflow.logOut(options);
      } finally {
        setIsSignedIn(passflow.isAuthenticated());
      }
    },
    [passflow],
  );

  const value = {
    isAuthenticated,
    isSignedIn: hydrated && isSignedIn,
    logout,
    isLoading,
    isSessionExpired,
    getTokens,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
