import { type ParsedTokens, PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { initialState, PassflowContext, type PassflowContextType } from '@/context/passflow-context';
import { useUser } from '../use-user';

type Claims = { sub?: string; email?: string; phonenumber?: string };
const token = (claims: Claims) => ({ aud: [], exp: 0, iat: 0, iss: '', jti: '', sub: '', type: '', ...claims });

// Follows core's contract: the parsed tokens change, then the event fires.
const createSession = (initial?: ParsedTokens) => {
  let parsed = initial;
  const subscribers = new Map<PassflowSubscriber, PassflowEvent[] | undefined>();
  const emit = (event: PassflowEvent) => {
    for (const [subscriber, events] of subscribers) {
      if (!events || events.includes(event)) subscriber.onAuthChange(event, undefined as never);
    }
  };
  const passflow = {
    isAuthenticated: () => parsed?.access_token !== undefined,
    getParsedTokens: () => parsed,
    subscribe: (subscriber: PassflowSubscriber, events?: PassflowEvent[]) => subscribers.set(subscriber, events),
    unsubscribe: (subscriber: PassflowSubscriber) => subscribers.delete(subscriber),
  };
  return {
    passflow,
    change: (next: ParsedTokens | undefined, event: PassflowEvent) => {
      parsed = next;
      emit(event);
    },
  };
};

const User = () => {
  const user = useUser();
  return (
    <>
      <p data-testid='id'>{user.id ?? 'none'}</p>
      <p data-testid='email'>{user.email ?? 'none'}</p>
      <p data-testid='phone'>{user.phone ?? 'none'}</p>
    </>
  );
};

const renderUser = (session: ReturnType<typeof createSession>) => {
  const context = {
    state: initialState,
    dispatch: () => undefined,
    passflow: session.passflow,
  } as unknown as PassflowContextType;
  render(
    <PassflowContext.Provider value={context}>
      <User />
    </PassflowContext.Provider>,
  );
};

const shown = () => ({
  id: screen.getByTestId('id').textContent,
  email: screen.getByTestId('email').textContent,
  phone: screen.getByTestId('phone').textContent,
});

describe('useUser', () => {
  it('reads the email from the id token after the embedded flow', () => {
    renderUser(
      createSession({
        access_token: token({ sub: 'user-1' }),
        id_token: token({ sub: 'user-1', email: 'embedded@example.com' }),
      }),
    );
    expect(shown()).toEqual({ id: 'user-1', email: 'embedded@example.com', phone: 'none' });
  });

  it('falls back to the access token after the hosted code flow', () => {
    renderUser(
      createSession({
        access_token: token({ sub: 'user-2', email: 'hosted@example.com', phonenumber: '+15550100' }),
        id_token: token({ sub: 'user-2' }),
      }),
    );
    expect(shown()).toEqual({ id: 'user-2', email: 'hosted@example.com', phone: '+15550100' });
  });

  it('prefers the id token when both carry an email', () => {
    renderUser(
      createSession({
        access_token: token({ sub: 'user-3', email: 'access@example.com' }),
        id_token: token({ sub: 'user-3', email: 'id@example.com' }),
      }),
    );
    expect(shown().email).toBe('id@example.com');
  });

  it('is empty when no one is signed in', () => {
    renderUser(createSession(undefined));
    expect(shown()).toEqual({ id: 'none', email: 'none', phone: 'none' });
  });

  it('re-renders on sign-in, a refresh with new claims, and sign-out', () => {
    const session = createSession(undefined);
    renderUser(session);

    act(() => session.change({ access_token: token({ sub: 'u', email: 'first@example.com' }) }, PassflowEvent.SignIn));
    expect(shown().email).toBe('first@example.com');

    act(() => session.change({ access_token: token({ sub: 'u', email: 'second@example.com' }) }, PassflowEvent.Refresh));
    expect(shown().email).toBe('second@example.com');

    act(() => session.change(undefined, PassflowEvent.SignOut));
    expect(shown()).toEqual({ id: 'none', email: 'none', phone: 'none' });
  });

  it('empties when the session expires', () => {
    const session = createSession({ access_token: token({ sub: 'u', email: 'gone@example.com' }) });
    renderUser(session);
    act(() => session.change(undefined, PassflowEvent.SessionExpired));
    expect(shown().email).toBe('none');
  });
});
