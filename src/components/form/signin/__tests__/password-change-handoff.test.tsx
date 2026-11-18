import { PassflowError } from '@passflow/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const passflow = {
  signIn: vi.fn(),
  passkeyAuthenticate: vi.fn(),
  passwordlessSignIn: vi.fn(),
  isTwoFactorVerificationRequired: vi.fn(() => false),
};

vi.mock('@/hooks/use-passflow', () => ({ usePassflow: () => passflow }));
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  usePassflow: () => passflow,
  useNavigation: () => ({ navigate }),
  useProvider: () => ({ federatedWithRedirect: vi.fn() }),
  useSignInEnding: () => ({ ending: 'none', retry: vi.fn(), finishSignIn: vi.fn() }),
  useAppSettings: () => ({
    appSettings: {
      auth_strategies: [
        { type: 'internal', strategy: { identity: 'email', challenge: 'password', transport: 'none' } },
        { type: 'passkey', strategy: {} },
      ],
    },
    scopes: ['id'],
    createTenantForNewUser: false,
    passwordPolicy: null,
    currentStyles: null,
    isError: false,
    error: null,
    loginAppTheme: null,
  }),
}));

import { SignInForm } from '..';

const serverError = (id: string, status: number) =>
  new PassflowError({ id, message: 'Server text', status, location: '', time: '' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  window.history.replaceState(null, '', '/signin?appid=app-1');
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('SignInForm password change handoff', () => {
  it('carries no identifier from an earlier password attempt into a refused passkey sign-in', async () => {
    passflow.signIn.mockRejectedValue(serverError('error.api.credentials.invalid', 401));
    passflow.passkeyAuthenticate.mockRejectedValue(serverError('error.api.password.change.required', 403));
    const { container } = render(<SignInForm />);

    await userEvent.type(container.querySelector('input#email_or_username') as HTMLInputElement, 'jack@example.com');
    await userEvent.type(container.querySelector('input#password') as HTMLInputElement, 'Correct-horse-battery-9!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(passflow.signIn).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Sign In with a Passkey' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const [{ to, search }] = navigate.mock.calls[0] as [{ to: string; search: string }];
    expect(to).toBe('/forgot-password');
    const params = new URLSearchParams(search);
    expect(params.get('reason')).toBe('password_change_required');
    expect(params.get('email')).toBeNull();
    expect(params.get('username')).toBeNull();
    expect(params.get('phone')).toBeNull();
  });
});
