import type { PassflowEvent, PassflowSubscriber } from '@passflow/core';
import { act, type ReactNode, useLayoutEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginButton } from '@/components/login-button';
import { AuthProvider } from '@/context/auth-context';
import { initialState, PassflowContext, type PassflowContextType } from '@/context/passflow-context';
import { usePassflowStore } from '@/hooks/use-passflow-store';
import { useAuth } from '@/hooks/use-auth';
import { useTwoFactorSetup } from '@/hooks/use-two-factor-setup';
import { useUser } from '@/hooks/use-user';

// Testing Library sets this on import; this test drives hydrateRoot with React's own act.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const accessToken = 'access-token';

// The server has no stored session; the browser reads the one it cached on an earlier visit.
const createPassflow = (signedIn: boolean) => {
  const subscribers = new Set<PassflowSubscriber>();
  return {
    isAuthenticated: () => signedIn,
    getCachedTokens: () => (signedIn ? cachedTokens : undefined),
    getParsedTokens: () =>
      signedIn ? { access_token: { sub: 'user-1', email: 'ada@example.com' }, id_token: undefined } : undefined,
    subscribe: (subscriber: PassflowSubscriber, _events?: PassflowEvent[]) => subscribers.add(subscriber),
    unsubscribe: (subscriber: PassflowSubscriber) => subscribers.delete(subscriber),
    authRedirect: async () => undefined,
    getTwoFactorStatus: async () => ({ enabled: true }),
    logOut: async () => undefined,
  };
};
const cachedTokens = { access_token: accessToken };

const TwoFactorStep = () => <p>{useTwoFactorSetup().step}</p>;

const TokenStatus = () => {
  const tokens = usePassflowStore();
  return <p data-testid='tokens'>{tokens?.access_token ? 'has tokens' : 'no tokens'}</p>;
};

type Passflow = ReturnType<typeof createPassflow>;

const withSession = (passflow: Passflow, children: ReactNode) => {
  const context = { state: initialState, dispatch: () => undefined, passflow } as unknown as PassflowContextType;
  return (
    <PassflowContext.Provider value={context}>
      <AuthProvider>{children}</AuthProvider>
    </PassflowContext.Provider>
  );
};

// Renders on a signed-out server, then hydrates in a browser that has the session cached.
const serverRenderThenHydrate = async (page: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  container.innerHTML = renderToString(withSession(createPassflow(false), page));
  const serverText = container.textContent;

  const recoverable: unknown[] = [];
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => {
    hydrateRoot(container, withSession(createPassflow(true), page), {
      onRecoverableError: (error) => recoverable.push(error),
    });
  });
  return { container, serverText, recoverable, consoleErrors: consoleError.mock.calls };
};

// A server renders signed out; the browser that hydrates its HTML has the session cached.
export function ssrHydrationCases(engine: 'default' | '18.3.1') {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe(`a server-rendered page hydrated with a cached session, React ${engine}`, () => {
    it('a LoginButton hydrates signed out, then shows the signed-in user', async () => {
      const { container, serverText, recoverable, consoleErrors } = await serverRenderThenHydrate(<LoginButton />);

      expect(serverText).toContain('Sign in');
      expect(recoverable).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(container.textContent).toContain('ada@example.com');
      expect(container.textContent).not.toContain('Sign in');
    });

    it('usePassflowStore hydrates with no tokens, then shows the cached tokens', async () => {
      const { container, serverText, recoverable, consoleErrors } = await serverRenderThenHydrate(<TokenStatus />);

      expect(serverText).toBe('no tokens');
      expect(recoverable).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(container.textContent).toBe('has tokens');
    });

    it('useTwoFactorSetup hydrates idle, then reads the enrolment', async () => {
      const { container, serverText, recoverable, consoleErrors } = await serverRenderThenHydrate(<TwoFactorStep />);

      expect(serverText).toBe('idle');
      expect(recoverable).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(container.textContent).toBe('enrolled');
    });
  });

  describe(`a page rendered only in the browser, React ${engine}`, () => {
    it('commits the signed-in user in its first render', async () => {
      const commits: string[] = [];
      const FirstCommit = () => {
        const { isSignedIn } = useAuth();
        const { email } = useUser();
        const tokens = usePassflowStore();
        const seen = `${isSignedIn} ${email} ${Boolean(tokens)}`;
        useLayoutEffect(() => {
          commits.push(seen);
        });
        return null;
      };
      const container = document.createElement('div');
      document.body.appendChild(container);

      await act(async () => {
        createRoot(container).render(withSession(createPassflow(true), <FirstCommit />));
      });

      expect(commits[0]).toBe('true ada@example.com true');
    });
  });
}
