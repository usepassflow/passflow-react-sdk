import type { PassflowSendPasswordResetEmailPayload } from '@passflow/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useForgotPassword } from '../use-forgot-password';

// Mock the usePassflow hook
vi.mock('../use-passflow', () => ({
  usePassflow: vi.fn(),
}));

import { usePassflow } from '../use-passflow';

describe('useForgotPassword', () => {
  const mockPassflow = {
    sendPasswordResetEmail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (usePassflow as any).mockReturnValue(mockPassflow);
  });

  it('should successfully send password reset email', async () => {
    mockPassflow.sendPasswordResetEmail.mockResolvedValue(undefined);

    const { result } = renderHook(() => useForgotPassword());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);

    const payload: PassflowSendPasswordResetEmailPayload = {
      email: 'test@example.com',
    };

    let resetResult = false;

    await act(async () => {
      resetResult = await result.current.fetch(payload);
    });

    expect(resetResult).toBe(true);
    expect(mockPassflow.sendPasswordResetEmail).toHaveBeenCalledWith(payload);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('REQ-3 stops loading after a password-reset request fails', async () => {
    const errorMessage = 'Email not found';
    mockPassflow.sendPasswordResetEmail.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useForgotPassword());

    const payload: PassflowSendPasswordResetEmailPayload = {
      email: 'nonexistent@example.com',
    };

    let resetResult = true;

    await act(async () => {
      resetResult = await result.current.fetch(payload);
    });

    expect(resetResult).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    'error.api.anti_bot.required',
    'error.api.anti_bot.failed',
    'error.api.anti_bot.unavailable',
    'error.anti_bot.provider_missing',
    'error.anti_bot.provider_failed',
    'error.anti_bot.solve_failed',
  ])('REQ-3 shows the safe anti-bot message on password reset for %s', async (id) => {
    mockPassflow.sendPasswordResetEmail.mockRejectedValueOnce({ id, message: 'Raw vendor error' });
    const { result } = renderHook(() => useForgotPassword());
    await act(async () => {
      expect(await result.current.fetch({ email: 'test@example.com' })).toBe(false);
    });
    expect(result.current.error).toBe('We could not confirm you are human. Try again.');
    expect(result.current.isLoading).toBe(false);
  });

  it('should set loading state during password reset email send', async () => {
    let resolveReset: (value?: any) => void;
    const resetPromise = new Promise((resolve) => {
      resolveReset = resolve;
    });
    mockPassflow.sendPasswordResetEmail.mockReturnValue(resetPromise);

    const { result } = renderHook(() => useForgotPassword());

    const payload: PassflowSendPasswordResetEmailPayload = {
      email: 'test@example.com',
    };

    let fetchPromise: Promise<boolean>;

    act(() => {
      fetchPromise = result.current.fetch(payload);
    });

    // Should be loading
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    // Resolve the reset
    act(() => {
      resolveReset?.();
    });

    await act(async () => {
      await fetchPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('should reset error state', async () => {
    const errorMessage = 'Test error';
    mockPassflow.sendPasswordResetEmail.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useForgotPassword());

    // Trigger an error
    await act(async () => {
      await result.current.fetch({ email: 'test@example.com' });
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(errorMessage);

    // Reset the state
    act(() => {
      result.current.reset();
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.isLoading).toBe(false);
  });

  it('should handle multiple reset email requests', async () => {
    mockPassflow.sendPasswordResetEmail.mockResolvedValue(undefined);

    const { result } = renderHook(() => useForgotPassword());

    const payload: PassflowSendPasswordResetEmailPayload = {
      email: 'test@example.com',
    };

    await act(async () => {
      await result.current.fetch(payload);
    });

    expect(mockPassflow.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.fetch(payload);
    });

    expect(mockPassflow.sendPasswordResetEmail).toHaveBeenCalledTimes(2);
  });
});
