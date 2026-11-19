import { type ParsedTokens, PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { MouseEvent, ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/auth-context';
import { initialState, PassflowContext, type PassflowContextType } from '@/context/passflow-context';
import { LoginButton } from '..';

const token = (claims: { sub: string; email?: string }) => ({
  aud: [],
  exp: 0,
  iat: 0,
  iss: '',
  jti: '',
  type: '',
  ...claims,
});

const signedInTokens: ParsedTokens = {
  access_token: token({ sub: 'user-1', email: 'jane@example.com' }),
};

// Follows core's contract: the session changes, then the event fires. A hosted logOut()
// may never settle (the page leaves), so the test can hold it open.
const createSession = (signedIn: boolean) => {
  let parsed: ParsedTokens | undefined = signedIn ? signedInTokens : undefined;
  let releaseLogOut: (() => void) | undefined;
  const subscribers = new Map<PassflowSubscriber, PassflowEvent[] | undefined>();
  const emit = (event: PassflowEvent) => {
    for (const [subscriber, events] of subscribers) {
      if (!events || events.includes(event)) subscriber.onAuthChange(event, undefined as never);
    }
  };
  const passflow = {
    isAuthenticated: () => parsed !== undefined,
    getParsedTokens: () => parsed,
    subscribe: (subscriber: PassflowSubscriber, events?: PassflowEvent[]) => subscribers.set(subscriber, events),
    unsubscribe: (subscriber: PassflowSubscriber) => subscribers.delete(subscriber),
    authRedirect: vi.fn(async () => undefined),
    logOut: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseLogOut = () => {
            parsed = undefined;
            emit(PassflowEvent.SignOut);
            resolve();
          };
        }),
    ),
  };
  return {
    passflow,
    signIn: () => {
      parsed = signedInTokens;
      emit(PassflowEvent.SignIn);
    },
    finishLogOut: () => releaseLogOut?.(),
  };
};

type Session = ReturnType<typeof createSession>;

const renderWith = (session: Session, ui: ReactElement) => {
  const context = {
    state: initialState,
    dispatch: () => undefined,
    passflow: session.passflow,
  } as unknown as PassflowContextType;
  return render(
    <PassflowContext.Provider value={context}>
      <AuthProvider>{ui}</AuthProvider>
    </PassflowContext.Provider>,
  );
};

const click = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name })));
};

describe('LoginButton', () => {
  it('signed out, a click starts the hosted sign-in with the given options', async () => {
    const session = createSession(false);
    renderWith(session, <LoginButton authRedirectOptions={{ redirectUrl: 'https://app.example.com/callback' }} />);

    await click('Sign in');

    expect(session.passflow.authRedirect).toHaveBeenCalledWith({ redirectUrl: 'https://app.example.com/callback' });
    expect(session.passflow.logOut).not.toHaveBeenCalled();
  });

  it('takes its own sign-in label', () => {
    renderWith(createSession(false), <LoginButton signInLabel='Log in' />);
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('signed in, shows the email and a click signs out with the redirect option', async () => {
    const session = createSession(true);
    renderWith(session, <LoginButton postLogoutRedirectUri='https://app.example.com/bye' />);

    await click('jane@example.com');

    expect(session.passflow.logOut).toHaveBeenCalledWith({ postLogoutRedirectUri: 'https://app.example.com/bye' });
    expect(session.passflow.authRedirect).not.toHaveBeenCalled();
  });

  it('signed in, the label comes from signedInLabel', () => {
    renderWith(createSession(true), <LoginButton signedInLabel={(user) => `Sign out ${user.email}`} />);
    expect(screen.getByRole('button', { name: 'Sign out jane@example.com' })).toBeInTheDocument();
  });

  it('is disabled and busy while the sign-out is in flight', async () => {
    const session = createSession(true);
    renderWith(session, <LoginButton />);

    await click('jane@example.com');
    const button = screen.getByRole('button', { name: 'jane@example.com' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => session.finishLogOut());
    const after = screen.getByRole('button', { name: 'Sign in' });
    expect(after).toBeEnabled();
    expect(after).not.toHaveAttribute('aria-busy');
  });

  it('switches its label after a sign-in and after a sign-out', async () => {
    const session = createSession(false);
    renderWith(session, <LoginButton />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    act(() => session.signIn());
    expect(screen.getByRole('button', { name: 'jane@example.com' })).toBeInTheDocument();

    await click('jane@example.com');
    await act(async () => session.finishLogOut());
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('makes a wrapped child the button, keeping its props and content, and runs its onClick first', async () => {
    const session = createSession(false);
    const calls: string[] = [];
    session.passflow.authRedirect.mockImplementation(async () => {
      calls.push('authRedirect');
    });
    renderWith(
      session,
      <LoginButton>
        <button type='button' className='app-button' data-variant='ghost' onClick={() => calls.push('child')}>
          Continue
        </button>
      </LoginButton>,
    );

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveClass('app-button');
    expect(button).toHaveAttribute('data-variant', 'ghost');

    await click('Continue');
    expect(calls).toEqual(['child', 'authRedirect']);
  });

  it("skips the sign-in when the child's onClick calls preventDefault", async () => {
    const session = createSession(false);
    renderWith(
      session,
      <LoginButton>
        <button type='button' onClick={(event: MouseEvent) => event.preventDefault()}>
          Continue
        </button>
      </LoginButton>,
    );

    await click('Continue');
    expect(session.passflow.authRedirect).not.toHaveBeenCalled();
  });

  it("skips the sign-out when the child's onClick calls preventDefault", async () => {
    const session = createSession(true);
    renderWith(
      session,
      <LoginButton>
        <button type='button' onClick={(event: MouseEvent) => event.preventDefault()}>
          Account
        </button>
      </LoginButton>,
    );

    await click('Account');
    expect(session.passflow.logOut).not.toHaveBeenCalled();
  });

  it('gives a function child the state and label, and handles the click of what it returns', async () => {
    const session = createSession(false);
    renderWith(
      session,
      <LoginButton>
        {({ isSignedIn, label, user }) => (
          <button type='button' data-signed-in={String(isSignedIn)} data-user={user.id ?? 'none'}>
            {label}
          </button>
        )}
      </LoginButton>,
    );

    const signedOut = screen.getByRole('button', { name: 'Sign in' });
    expect(signedOut).toHaveAttribute('data-signed-in', 'false');
    expect(signedOut).toHaveAttribute('data-user', 'none');
    await click('Sign in');
    expect(session.passflow.authRedirect).toHaveBeenCalledTimes(1);

    act(() => session.signIn());
    const signedIn = screen.getByRole('button', { name: 'jane@example.com' });
    expect(signedIn).toHaveAttribute('data-signed-in', 'true');
    expect(signedIn).toHaveAttribute('data-user', 'user-1');
    await click('jane@example.com');
    expect(session.passflow.logOut).toHaveBeenCalledTimes(1);
  });
});
