import { PassflowError, type PassflowPasswordlessResponse, type PassflowSignInPayload } from '@passflow/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authErrorFor } from '@/utils';
import { useSignIn } from '../use-signin';

// Mock the usePassflow hook
vi.mock('../use-passflow', () => ({
  usePassflow: vi.fn(),
}));

import { usePassflow } from '../use-passflow';

describe('useSignIn', () => {
  const mockPassflow = {
    signIn: vi.fn(),
    passkeyAuthenticate: vi.fn(),
    passwordlessSignIn: vi.fn(),
    isTwoFactorVerificationRequired: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(false);
    (usePassflow as any).mockReturnValue(mockPassflow);
  });

  it.each([
    ['password', 'signIn'],
    ['passkey', 'passkeyAuthenticate'],
    ['passwordless', 'passwordlessSignIn'],
  ] as const)('REQ-13 passes the agent option to core for %s', async (type, method) => {
    mockPassflow[method].mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSignIn());
    const payload = { email: 'test@example.com', password: 'test-secret' };

    await act(async () => {
      await result.current.fetch(payload, type, { agentTool: true });
    });

    expect(mockPassflow[method].mock.calls[0]?.[0]).toEqual(payload);
    expect(mockPassflow[method].mock.calls[0]?.at(-1)?.agentTool).toBe(true);
  });

  it.each([
    'error.api.anti_bot.required',
    'error.api.anti_bot.failed',
    'error.api.anti_bot.unavailable',
    'error.anti_bot.provider_missing',
    'error.anti_bot.provider_failed',
    'error.anti_bot.solve_failed',
  ])('REQ-3 and REQ-13 expose safe anti-bot copy synchronously for %s', async (id) => {
    mockPassflow.signIn.mockRejectedValueOnce({ id, message: 'Raw vendor error' });
    const { result } = renderHook(() => useSignIn());
    const payload = { email: 'test@example.com', password: 'test-secret' };
    const expected = { message: 'We could not confirm you are human. Try again.', scope: 'form' };

    await act(async () => {
      const { fetch, readError } = result.current;
      expect(await fetch(payload, 'password')).toBe(false);
      expect(readError()).toEqual(expected);
    });
    expect(result.current.error).toEqual(expected);

    act(() => result.current.reset());
    expect(result.current.readError()).toBeNull();
  });

  it('REQ-13 clears readError synchronously after a successful request', async () => {
    mockPassflow.signIn.mockRejectedValueOnce(new Error('failure')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSignIn());
    const payload = { email: 'test@example.com', password: 'test-secret' };

    await act(async () => {
      const { fetch, readError } = result.current;
      expect(await fetch(payload, 'password')).toBe(false);
      expect(readError()).not.toBeNull();
    });
    await act(async () => {
      const { fetch, readError } = result.current;
      expect(await fetch(payload, 'password')).toBe('signed-in');
      expect(readError()).toBeNull();
    });
  });

  describe('password sign in', () => {
    it('should successfully sign in with password', async () => {
      mockPassflow.signIn.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSignIn());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);

      const payload: PassflowSignInPayload = {
        email: 'test@example.com',
        password: 'password123',
      };

      let signInResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        signInResult = await result.current.fetch(payload, 'password');
      });

      expect(signInResult).toBe('signed-in');
      expect(mockPassflow.signIn).toHaveBeenCalledWith(payload, undefined);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle password sign in error', async () => {
      const errorMessage = 'Invalid credentials';
      mockPassflow.signIn.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignIn());

      const payload: PassflowSignInPayload = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      let signInResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        signInResult = await result.current.fetch(payload, 'password');
      });

      expect(signInResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-in', 'password'));
      expect(result.current.isLoading).toBe(false);
    });

    it('should set loading state during password sign in', async () => {
      let resolveSignIn: (value?: any) => void;
      const signInPromise = new Promise((resolve) => {
        resolveSignIn = resolve;
      });
      mockPassflow.signIn.mockReturnValue(signInPromise);

      const { result } = renderHook(() => useSignIn());

      const payload: PassflowSignInPayload = {
        email: 'test@example.com',
        password: 'password123',
      };

      let fetchPromise: Promise<boolean | string | PassflowPasswordlessResponse>;

      act(() => {
        fetchPromise = result.current.fetch(payload, 'password');
      });

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve the sign in
      act(() => {
        resolveSignIn?.();
      });

      await act(async () => {
        await fetchPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('passkey authentication', () => {
    it('should successfully authenticate with passkey', async () => {
      mockPassflow.passkeyAuthenticate.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSignIn());

      const payload = {
        email: 'test@example.com',
      } as any;

      let authResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        authResult = await result.current.fetch(payload, 'passkey');
      });

      expect(authResult).toBe('signed-in');
      expect(mockPassflow.passkeyAuthenticate).toHaveBeenCalledWith(payload, undefined);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('should handle passkey authentication error', async () => {
      const errorMessage = 'Passkey not found';
      mockPassflow.passkeyAuthenticate.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignIn());

      const payload = {
        email: 'test@example.com',
      } as any;

      let authResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        authResult = await result.current.fetch(payload, 'passkey');
      });

      expect(authResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-in', 'passkey'));
    });
  });

  describe('passwordless sign in', () => {
    it('should successfully sign in with passwordless', async () => {
      const mockResponse = {
        message: 'Code sent',
      } as any;
      mockPassflow.passwordlessSignIn.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSignIn());

      const payload = {
        email: 'test@example.com',
      } as any;

      let signInResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        signInResult = await result.current.fetch(payload, 'passwordless');
      });

      expect(signInResult).toEqual(mockResponse);
      expect(mockPassflow.passwordlessSignIn).toHaveBeenCalledWith(payload, undefined);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('should handle passwordless sign in error', async () => {
      const errorMessage = 'Failed to send code';
      mockPassflow.passwordlessSignIn.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignIn());

      const payload = {
        email: 'test@example.com',
      } as any;

      let signInResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        signInResult = await result.current.fetch(payload, 'passwordless');
      });

      expect(signInResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-in', 'passwordless'));
    });
  });

  describe('reset function', () => {
    it('should reset error state', async () => {
      const errorMessage = 'Test error';
      mockPassflow.signIn.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignIn());

      // Trigger an error
      await act(async () => {
        await result.current.fetch({ email: 'test@example.com', password: 'test' }, 'password');
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-in', 'password'));

      // Reset the state
      act(() => {
        result.current.reset();
      });

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('cancelPasskey', () => {
    const cancelledError = { message: 'Passkey sign-in was cancelled.', scope: authErrorFor('sign-in', 'passkey').scope };

    const startStuckPasskey = () => {
      let settle: { resolve: (value?: unknown) => void; reject: (reason: unknown) => void } | undefined;
      mockPassflow.passkeyAuthenticate.mockReturnValue(
        new Promise((resolve, reject) => {
          settle = { resolve, reject };
        }),
      );
      const { result } = renderHook(() => useSignIn());
      let pending: Promise<boolean | string | PassflowPasswordlessResponse> | undefined;
      act(() => {
        pending = result.current.fetch({ email: 'test@example.com' } as any, 'passkey');
      });
      return { result, pending: pending!, settle: () => settle! };
    };

    it('clears loading, and the hook ignores a late rejection', async () => {
      const { result, pending, settle } = startStuckPasskey();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.pendingOperation).toBe('passkey');

      act(() => result.current.cancelPasskey());
      expect(result.current.readError()).toBeNull(); // REQ-13: cancellation is not a failed fetch.
      expect(result.current.isLoading).toBe(false);
      expect(result.current.pendingOperation).toBeNull();
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(cancelledError);

      let outcome: boolean | string | PassflowPasswordlessResponse = true;
      await act(async () => {
        settle().reject(new Error('NotAllowedError'));
        outcome = await pending;
      });
      expect(outcome).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(cancelledError);
    });

    it('the hook ignores a late success', async () => {
      const { result, pending, settle } = startStuckPasskey();
      act(() => result.current.cancelPasskey());

      let outcome: boolean | string | PassflowPasswordlessResponse = true;
      await act(async () => {
        settle().resolve(undefined);
        outcome = await pending;
      });
      expect(outcome).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toEqual(cancelledError);
    });
  });

  describe('sign-in outcome', () => {
    const passwordPayload: PassflowSignInPayload = { email: 'test@example.com', password: 'password123' };
    const passkeyPayload = { email: 'test@example.com' } as any;

    for (const [type, payload, call] of [
      ['password', passwordPayload, 'signIn'],
      ['passkey', passkeyPayload, 'passkeyAuthenticate'],
    ] as const) {
      it(`resolves 'two-factor-required' when a ${type} sign-in still owes a second factor`, async () => {
        mockPassflow[call].mockResolvedValue(undefined);
        mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(true);
        const { result } = renderHook(() => useSignIn());

        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.fetch(payload, type);
        });

        expect(outcome).toBe('two-factor-required');
        expect(result.current.isError).toBe(false);
      });

      it(`resolves 'signed-in' when a ${type} sign-in owes nothing more`, async () => {
        mockPassflow[call].mockResolvedValue(undefined);
        mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(false);
        const { result } = renderHook(() => useSignIn());

        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.fetch(payload, type);
        });

        expect(outcome).toBe('signed-in');
      });
    }
  });

  describe('forced password change', () => {
    const serverMessage = 'You must change your password before you can sign in. Reset your password to continue.';
    const passwordChangeRequired = () =>
      new PassflowError({
        id: 'error.api.password.change.required',
        message: serverMessage,
        status: 403,
        location: '',
        time: '',
      });
    const payload: PassflowSignInPayload = { email: 'test@example.com', password: 'password123' };

    it('calls onPasswordChangeRequired and resolves false without a form error', async () => {
      mockPassflow.signIn.mockRejectedValue(passwordChangeRequired());
      const onPasswordChangeRequired = vi.fn();
      const { result } = renderHook(() => useSignIn({ onPasswordChangeRequired }));

      let outcome: unknown = true;
      await act(async () => {
        outcome = await result.current.fetch(payload, 'password');
      });

      expect(onPasswordChangeRequired).toHaveBeenCalledTimes(1);
      expect(onPasswordChangeRequired).toHaveBeenCalledWith(expect.any(String));
      expect(outcome).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("shows the server's message, not generic copy, when no handler is given", async () => {
      mockPassflow.signIn.mockRejectedValue(passwordChangeRequired());
      const { result } = renderHook(() => useSignIn());

      let outcome: unknown = true;
      await act(async () => {
        outcome = await result.current.fetch(payload, 'password');
      });

      expect(outcome).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error?.message).toBe(serverMessage);
      expect(result.current.error).not.toEqual(authErrorFor('sign-in', 'password'));
    });
  });
});
