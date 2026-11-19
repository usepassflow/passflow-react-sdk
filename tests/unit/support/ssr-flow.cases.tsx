import { PassflowFlow, type PassflowFlowNavigate, PassflowProvider } from '@passflow/react';
import { act, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerConfig, stubBrowserApis } from './passflow-fixtures';

// A server renders the sign-in page; the browser hydrates its HTML. With the app's
// router the location is known on both sides; without it the server has no URL.
export function ssrFlowCases(engine: 'default' | '18.3.1') {
  describe(`a server-rendered PassflowFlow, React ${engine}`, () => {
    beforeEach(() => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      stubBrowserApis();
      window.history.replaceState(null, '', '/auth/signin');
    });

    afterEach(() => {
      document.body.innerHTML = '';
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    const serverRenderThenHydrate = async (page: () => ReactNode) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = renderToString(<PassflowProvider {...providerConfig}>{page()}</PassflowProvider>);

      const recoverable: unknown[] = [];
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await act(async () => {
        hydrateRoot(container, <PassflowProvider {...providerConfig}>{page()}</PassflowProvider>, {
          onRecoverableError: (error) => recoverable.push(error),
        });
      });
      return { container, recoverable, consoleErrors: consoleError.mock.calls };
    };

    const signInShown = async (container: HTMLElement) => {
      const shown = () =>
        Array.from(container.querySelectorAll('h1, h2')).some((heading) => /sign in/i.test(heading.textContent ?? ''));
      for (let tries = 0; tries < 50 && !shown(); tries++) {
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      }
      return shown();
    };

    it('with the app passing location and navigate, hydrates and shows sign-in', async () => {
      const navigate: PassflowFlowNavigate = () => undefined;
      const { container, recoverable, consoleErrors } = await serverRenderThenHydrate(() => (
        <PassflowFlow location={{ pathname: '/auth/signin', search: '' }} navigate={navigate} />
      ));

      expect(recoverable).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(await signInShown(container)).toBe(true);
    });

    it('on its own browser history, hydrates and then shows sign-in from the address bar', async () => {
      const { container, recoverable, consoleErrors } = await serverRenderThenHydrate(() => <PassflowFlow />);

      expect(recoverable).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(await signInShown(container)).toBe(true);
    });
  });
}
