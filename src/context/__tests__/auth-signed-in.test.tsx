import { PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuth } from '../../hooks/use-auth';
import { useLogout } from '../../hooks/use-logout';
import { useSessions } from '../../hooks/use-sessions';
import { AuthProvider } from '../auth-context';
import { initialState, PassflowContext, type PassflowContextType } from '../passflow-context';

// Follows core's contract: a sign-in emits SignIn once the session is stored, and logOut()
// clears the session, then emits one SignOut. revokeSession() on the current session signs out
// the same way; on any other session it changes nothing locally.
const createSession = (signedIn: boolean) => {
  let authenticated = signedIn;
  const subscribers = new Map<PassflowSubscriber, PassflowEvent[] | undefined>();
  const emit = (event: PassflowEvent, payload?: unknown) => {
    for (const [subscriber, events] of subscribers) {
      if (!events || events.includes(event)) subscriber.onAuthChange(event, payload as never);
    }
  };
  const logOut = async () => {
    authenticated = false;
    emit(PassflowEvent.SignOut);
  };
  const passflow = {
    isAuthenticated: () => authenticated,
    subscribe: (subscriber: PassflowSubscriber, events?: PassflowEvent[]) => subscribers.set(subscriber, events),
    unsubscribe: (subscriber: PassflowSubscriber) => subscribers.delete(subscriber),
    logOut,
    listSessions: async () => [
      { id: 'this-device', app_id: 'app', created_at: '', auth_time: '', current: true },
      { id: 'other-device', app_id: 'app', created_at: '', auth_time: '', current: false },
    ],
    revokeSession: async (sessionId: string) => {
      if (sessionId === 'this-device') await logOut();
    },
  };
  return {
    passflow,
    signIn: () => {
      authenticated = true;
      emit(PassflowEvent.SignIn);
    },
    expire: () => {
      authenticated = false;
      emit(PassflowEvent.SessionExpired, { reason: 'refresh_failed' });
    },
  };
};

const SessionStatus = () => {
  const auth = useAuth();
  const { fetch } = useLogout();
  const sessions = useSessions();
  return (
    <>
      <p data-testid='checked'>{auth.isAuthenticated() ? 'signed in' : 'signed out'}</p>
      <p data-testid='flag'>{auth.isSignedIn ? 'signed in' : 'signed out'}</p>
      <button type='button' onClick={() => void auth.logout()}>
        auth logout
      </button>
      <button type='button' onClick={() => void fetch()}>
        logout hook
      </button>
      <button type='button' onClick={() => void sessions.revoke('other-device')}>
        revoke other session
      </button>
      <button type='button' onClick={() => void sessions.revoke('this-device')}>
        revoke current session
      </button>
    </>
  );
};

const renderStatus = (session: ReturnType<typeof createSession>) => {
  const context = {
    state: initialState,
    dispatch: () => undefined,
    passflow: session.passflow,
  } as unknown as PassflowContextType;
  render(
    <PassflowContext.Provider value={context}>
      <AuthProvider>
        <SessionStatus />
      </AuthProvider>
    </PassflowContext.Provider>,
  );
};

const expectShown = (text: 'signed in' | 'signed out') => {
  expect(screen.getByTestId('checked').textContent).toBe(text);
  expect(screen.getByTestId('flag').textContent).toBe(text);
};

describe('a consumer rendering on the signed-in state', () => {
  it('shows the state the session starts in', () => {
    renderStatus(createSession(true));
    expectShown('signed in');
  });

  it('flips to signed out after useAuth().logout()', async () => {
    renderStatus(createSession(true));
    await act(async () => fireEvent.click(screen.getByText('auth logout')));
    expectShown('signed out');
  });

  it('flips to signed out after useLogout().fetch()', async () => {
    renderStatus(createSession(true));
    await act(async () => fireEvent.click(screen.getByText('logout hook')));
    expectShown('signed out');
  });

  it('stays signed in after useSessions().revoke() ends another session', async () => {
    renderStatus(createSession(true));
    await act(async () => fireEvent.click(screen.getByText('revoke other session')));
    expectShown('signed in');
  });

  it('flips to signed out after useSessions().revoke() ends the current session', async () => {
    renderStatus(createSession(true));
    await act(async () => fireEvent.click(screen.getByText('revoke current session')));
    expectShown('signed out');
  });

  it('flips back to signed in after a sign-in, and out again on each sign-out path', async () => {
    const session = createSession(false);
    renderStatus(session);
    expectShown('signed out');

    act(() => session.signIn());
    expectShown('signed in');

    await act(async () => fireEvent.click(screen.getByText('auth logout')));
    expectShown('signed out');

    act(() => session.signIn());
    expectShown('signed in');

    await act(async () => fireEvent.click(screen.getByText('logout hook')));
    expectShown('signed out');
  });

  it('flips to signed out when the session expires', () => {
    const session = createSession(true);
    renderStatus(session);
    act(() => session.expire());
    expectShown('signed out');
  });
});
