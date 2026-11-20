import { Passflow as PassflowClient, type PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { PassflowFlow, PassflowProvider, TwoFactorVerifyForm } from '@passflow/react';
import { act, type ReactNode, useLayoutEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginButton } from '@/components/login-button';
import { AuthProvider } from '@/context/auth-context';
import { initialState, PassflowContext, type PassflowContextType } from '@/context/passflow-context';
import { useAuth } from '@/hooks/use-auth';
import { usePassflowStore } from '@/hooks/use-passflow-store';
import { useTwoFactorSetup } from '@/hooks/use-two-factor-setup';
import { useUser } from '@/hooks/use-user';
import { providerConfig, stubBrowserApis } from './passflow-fixtures';

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

  describe(`a server-rendered TwoFactorVerifyForm, React ${engine}`, () => {
    it('hydrates without a mismatch when the browser knows an 8-digit code', async () => {
      // The server's instance knows no pending sign-in; the browser's knows its authenticator code has 8 digits.
      const withDigits = (digits: number) => {
        const passflow = { ...createPassflow(false), getTotpDigits: () => digits };
        return withSession(passflow as unknown as Passflow, <TwoFactorVerifyForm />);
      };
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(withDigits(6));

      const recoverable: unknown[] = [];
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        hydrateRoot(container, withDigits(8), { onRecoverableError: (error) => recoverable.push(error) });
      });

      expect(recoverable).toEqual([]);
      expect(consoleError.mock.calls).toEqual([]);
      expect(container.textContent).toContain('Enter the 8-digit code');
    });
  });

  describe(`a server-rendered flow screen hydrated with a sign-in waiting on its second factor, React ${engine}`, () => {
    // Where @passflow/core keeps a sign-in that still owes its second factor, for this tab.
    const pendingSecondFactorKey = 'passflow_2fa_challenge';

    beforeEach(() => {
      stubBrowserApis();
      sessionStorage.clear();
      window.history.replaceState(null, '', '/two-factor-verify');
    });

    afterEach(() => {
      sessionStorage.clear();
      window.history.replaceState(null, '', '/');
      vi.unstubAllGlobals();
    });

    it('/two-factor-verify hydrates without a mismatch', async () => {
      const page = () => (
        <PassflowProvider {...providerConfig}>
          <PassflowFlow location={{ pathname: '/two-factor-verify', search: '' }} navigate={() => undefined} />
        </PassflowProvider>
      );
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(page());

      const now = Date.now();
      sessionStorage.setItem(
        pendingSecondFactorKey,
        JSON.stringify({
          email: 'ada@example.com',
          challengeId: 'challenge-1',
          tfaToken: 'pending-second-factor',
          timestamp: now,
          expiresAt: now + 60_000,
        }),
      );
      // The server decides what the screen asks for; here it asks for the authenticator code.
      vi.spyOn(PassflowClient.prototype, 'getTwoFactorEnrollment').mockResolvedValue({
        enrollment: 'verify',
        totp_digits: 6,
        device_trust_available: true,
      } as Awaited<ReturnType<PassflowClient['getTwoFactorEnrollment']>>);
      const recoverable: unknown[] = [];
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        hydrateRoot(container, page(), { onRecoverableError: (error) => recoverable.push(error) });
      });
      await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

      expect(recoverable).toEqual([]);
      expect(consoleError.mock.calls).toEqual([]);
      expect(container.textContent).toContain('Two-Factor Authentication');
      expect(container.querySelector('input[autocomplete="one-time-code"]')).not.toBeNull();
    });
  });

  describe(`a flow under a prefix, on a landing that owes its second factor, React ${engine}`, () => {
    // Built rather than written out: a JWT-shaped literal reads as a leaked secret to the secret scanner.
    const segment = (value: string) => btoa(value).replace(/=+$/, '');
    const tfaToken = [segment('{"alg":"HS256"}'), segment('{"sub":"user"}'), segment('signature')].join('.');
    const page = () => (
      <PassflowProvider {...providerConfig}>
        <PassflowFlow pathPrefix='/auth' />
      </PassflowProvider>
    );

    beforeEach(() => {
      stubBrowserApis();
      sessionStorage.clear();
      window.history.replaceState(null, '', '/auth/signin');
    });

    afterEach(() => {
      sessionStorage.clear();
      window.history.replaceState(null, '', '/');
      vi.unstubAllGlobals();
    });

    const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    it("a hydrated page goes to the flow's own 2FA route", async () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(page());

      // The fragment reaches the browser only; the server never sees it.
      window.history.replaceState(null, '', `/auth/signin#tfa_token=${tfaToken}`);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        hydrateRoot(container, page());
      });
      await settle();

      expect(window.location.pathname).toBe('/auth/two-factor-verify');
      expect(consoleError.mock.calls).toEqual([]);
    });

    it("a hydrated page with the app's location goes to the flow's own 2FA route", async () => {
      const navigate = vi.fn();
      const controlled = () => (
        <PassflowProvider {...providerConfig}>
          <PassflowFlow pathPrefix='/auth' location={{ pathname: '/auth/signin', search: '' }} navigate={navigate} />
        </PassflowProvider>
      );
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(controlled());

      window.history.replaceState(null, '', `/auth/signin#tfa_token=${tfaToken}`);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        hydrateRoot(container, controlled());
      });
      await settle();

      expect(navigate).toHaveBeenCalledWith({ pathname: '/auth/two-factor-verify', search: '' }, { replace: true });
      expect(consoleError.mock.calls).toEqual([]);
    });

    it("a page rendered only in the browser goes to the flow's own 2FA route", async () => {
      window.history.replaceState(null, '', `/auth/signin#tfa_token=${tfaToken}`);
      const container = document.createElement('div');
      document.body.appendChild(container);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        createRoot(container).render(page());
      });
      await settle();

      expect(window.location.pathname).toBe('/auth/two-factor-verify');
      expect(consoleError.mock.calls).toEqual([]);
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
