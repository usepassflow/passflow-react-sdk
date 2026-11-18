import type { PassflowSubscriber } from '@passflow/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../hooks/use-auth';
import { useLogout } from '../../hooks/use-logout';
import { AuthProvider } from '../auth-context';
import { initialState, PassflowContext, type PassflowContextType } from '../passflow-context';

const afterSignOut = 'https://app.example.com/signed-out';

const createPassflow = () => {
  let authenticated = true;
  const subscribers = new Set<PassflowSubscriber>();
  return {
    isAuthenticated: () => authenticated,
    subscribe: (subscriber: PassflowSubscriber) => subscribers.add(subscriber),
    unsubscribe: (subscriber: PassflowSubscriber) => subscribers.delete(subscriber),
    logOut: vi.fn(async (_options?: unknown) => {
      authenticated = false;
    }),
  };
};

const Buttons = () => {
  const { logout } = useAuth();
  const { fetch } = useLogout();
  return (
    <>
      <p data-testid='flag'>{useAuth().isSignedIn ? 'signed in' : 'signed out'}</p>
      <button type='button' onClick={() => void logout({ postLogoutRedirectUri: afterSignOut })}>
        auth logout with target
      </button>
      <button type='button' onClick={() => void logout()}>
        auth logout
      </button>
      <button type='button' onClick={() => void fetch({ postLogoutRedirectUri: afterSignOut })}>
        hook logout with target
      </button>
      <button type='button' onClick={() => void fetch()}>
        hook logout
      </button>
    </>
  );
};

const renderButtons = (passflow: ReturnType<typeof createPassflow>) => {
  const context = { state: initialState, dispatch: () => undefined, passflow } as unknown as PassflowContextType;
  render(
    <PassflowContext.Provider value={context}>
      <AuthProvider>
        <Buttons />
      </AuthProvider>
    </PassflowContext.Provider>,
  );
};

describe('sign-out options', () => {
  it('useAuth().logout passes postLogoutRedirectUri to core and still flips isSignedIn', async () => {
    const passflow = createPassflow();
    renderButtons(passflow);
    await act(async () => fireEvent.click(screen.getByText('auth logout with target')));
    expect(passflow.logOut).toHaveBeenCalledTimes(1);
    expect(passflow.logOut).toHaveBeenCalledWith({ postLogoutRedirectUri: afterSignOut });
    expect(screen.getByTestId('flag').textContent).toBe('signed out');
  });

  it('useLogout().fetch passes postLogoutRedirectUri to core', async () => {
    const passflow = createPassflow();
    renderButtons(passflow);
    await act(async () => fireEvent.click(screen.getByText('hook logout with target')));
    expect(passflow.logOut).toHaveBeenCalledTimes(1);
    expect(passflow.logOut).toHaveBeenCalledWith({ postLogoutRedirectUri: afterSignOut });
  });

  it('a call with no options passes none', async () => {
    const passflow = createPassflow();
    renderButtons(passflow);
    await act(async () => fireEvent.click(screen.getByText('auth logout')));
    await act(async () => fireEvent.click(screen.getByText('hook logout')));
    expect(passflow.logOut).toHaveBeenNthCalledWith(1, undefined);
    expect(passflow.logOut).toHaveBeenNthCalledWith(2, undefined);
  });
});
