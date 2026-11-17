import { authErrorFor, authErrorFrom, serverMessageFor } from '../auth-error';

describe('authErrorFor', () => {
  it('scopes bad password sign-in to credentials', () => {
    expect(authErrorFor('sign-in', 'password')).toEqual({
      message: "We couldn't sign you in. Check your details and try again.",
      scope: 'credentials',
    });
  });

  it('keeps passwordless and registration failures at form scope', () => {
    expect(authErrorFor('sign-in', 'passwordless').scope).toBe('form');
    expect(authErrorFor('sign-up', 'password').scope).toBe('form');
    expect(authErrorFor('sign-up', 'passkey').message).not.toMatch(/status code|request failed|exception/i);
  });
});

describe('paused app', () => {
  const pausedMessage = 'Sign-ins to this app are paused. Please contact the app’s owner.';
  const paused = { id: 'error.api.plan.upgrade_required', message: pausedMessage, status: 403 };

  it("shows the server's message for a paused app", () => {
    expect(serverMessageFor(paused)).toBe(pausedMessage);
  });

  it('shows it on a failed sign-in', () => {
    expect(authErrorFrom(paused, 'sign-in', 'password')).toEqual({ message: pausedMessage, scope: 'form' });
  });
});
