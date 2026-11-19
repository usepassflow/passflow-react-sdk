import type { PassflowPasswordlessResponse } from '@passflow/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authErrorFor } from '@/utils';
import { useSignUp } from '../use-signup';

// Mock the usePassflow hook
vi.mock('../use-passflow', () => ({
  usePassflow: vi.fn(),
}));

import { usePassflow } from '../use-passflow';

describe('useSignUp', () => {
  const mockPassflow = {
    signUp: vi.fn(),
    passkeyRegister: vi.fn(),
    passwordlessSignIn: vi.fn(),
    isTwoFactorVerificationRequired: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(false);
    (usePassflow as any).mockReturnValue(mockPassflow);
  });

  describe('password sign up', () => {
    it('should successfully sign up with password', async () => {
      mockPassflow.signUp.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSignUp());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);

      const payload = {
        email: 'test@example.com',
        password: 'password123',
      } as any;

      let signUpResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        signUpResult = await result.current.fetch(payload, 'password');
      });

      expect(signUpResult).toBe('signed-in');
      expect(mockPassflow.signUp).toHaveBeenCalledWith(payload);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle password sign up error', async () => {
      const errorMessage = 'Email already exists';
      mockPassflow.signUp.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
        password: 'password123',
      } as any;

      let signUpResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        signUpResult = await result.current.fetch(payload, 'password');
      });

      expect(signUpResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-up', 'password'));
      expect(result.current.isLoading).toBe(false);
    });

    it('should set loading state during password sign up', async () => {
      let resolveSignUp: (value?: any) => void;
      const signUpPromise = new Promise((resolve) => {
        resolveSignUp = resolve;
      });
      mockPassflow.signUp.mockReturnValue(signUpPromise);

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
        password: 'password123',
      } as any;

      let fetchPromise: Promise<boolean | string | PassflowPasswordlessResponse>;

      act(() => {
        fetchPromise = result.current.fetch(payload, 'password');
      });

      // Should be loading
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      // Resolve the sign up
      act(() => {
        resolveSignUp?.();
      });

      await act(async () => {
        await fetchPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('passkey registration', () => {
    it('should successfully register with passkey', async () => {
      mockPassflow.passkeyRegister.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      } as any;

      let registerResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        registerResult = await result.current.fetch(payload, 'passkey');
      });

      expect(registerResult).toBe('signed-in');
      expect(mockPassflow.passkeyRegister).toHaveBeenCalledWith(payload);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('should handle passkey registration error', async () => {
      const errorMessage = 'Passkey registration failed';
      mockPassflow.passkeyRegister.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      } as any;

      let registerResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        registerResult = await result.current.fetch(payload, 'passkey');
      });

      expect(registerResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-up', 'passkey'));
    });
  });

  describe('passwordless sign up', () => {
    it('should successfully sign up with passwordless', async () => {
      const mockResponse = {
        message: 'Code sent',
      } as any;
      mockPassflow.passwordlessSignIn.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
      } as any;

      let signUpResult: boolean | string | PassflowPasswordlessResponse = false;

      await act(async () => {
        signUpResult = await result.current.fetch(payload, 'passwordless');
      });

      expect(signUpResult).toEqual(mockResponse);
      expect(mockPassflow.passwordlessSignIn).toHaveBeenCalledWith(payload);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
    });

    it('should handle passwordless sign up error', async () => {
      const errorMessage = 'Failed to send code';
      mockPassflow.passwordlessSignIn.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignUp());

      const payload = {
        email: 'test@example.com',
      } as any;

      let signUpResult: boolean | string | PassflowPasswordlessResponse = true;

      await act(async () => {
        signUpResult = await result.current.fetch(payload, 'passwordless');
      });

      expect(signUpResult).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-up', 'passwordless'));
    });
  });

  describe('reset function', () => {
    it('should reset error state', async () => {
      const errorMessage = 'Test error';
      mockPassflow.signUp.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useSignUp());

      // Trigger an error
      await act(async () => {
        await result.current.fetch({ email: 'test@example.com', password: 'test' } as any, 'password');
      });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toEqual(authErrorFor('sign-up', 'password'));

      // Reset the state
      act(() => {
        result.current.reset();
      });

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sign-up outcome', () => {
    const passwordPayload = { email: 'test@example.com', password: 'password123' } as any;
    const passkeyPayload = { email: 'test@example.com' } as any;

    for (const [type, payload, call] of [
      ['password', passwordPayload, 'signUp'],
      ['passkey', passkeyPayload, 'passkeyRegister'],
    ] as const) {
      it(`resolves 'two-factor-required' when a ${type} sign-up still owes a second factor`, async () => {
        mockPassflow[call].mockResolvedValue(undefined);
        mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(true);
        const { result } = renderHook(() => useSignUp());

        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.fetch(payload, type);
        });

        expect(outcome).toBe('two-factor-required');
        expect(result.current.isError).toBe(false);
      });

      it(`resolves 'signed-in' when a ${type} sign-up owes nothing more`, async () => {
        mockPassflow[call].mockResolvedValue(undefined);
        mockPassflow.isTwoFactorVerificationRequired.mockReturnValue(false);
        const { result } = renderHook(() => useSignUp());

        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.fetch(payload, type);
        });

        expect(outcome).toBe('signed-in');
      });
    }
  });
});
