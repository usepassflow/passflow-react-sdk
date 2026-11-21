import type { PassflowUserSession } from '@passflow/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessions } from '../use-sessions';

vi.mock('../use-passflow', () => ({
  usePassflow: vi.fn(),
}));

import { usePassflow } from '../use-passflow';

const session = (id: string, current = false): PassflowUserSession => ({
  id,
  app_id: 'app-1',
  created_at: '2026-11-01T00:00:00Z',
  auth_time: '2026-11-01T00:00:00Z',
  current,
  device: { name: 'Chrome on macOS', type: 'web', ip: '127.0.0.1' },
});

describe('useSessions', () => {
  const mockPassflow = {
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    signOutOtherSessions: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePassflow).mockReturnValue(mockPassflow as unknown as ReturnType<typeof usePassflow>);
  });

  it('lists the sessions on mount, current one included', async () => {
    mockPassflow.listSessions.mockResolvedValue([session('s1', true), session('s2')]);
    const { result } = renderHook(() => useSessions());

    await waitFor(() => expect(result.current.data.map((s) => s.id)).toEqual(['s1', 's2']));
    expect(result.current.data.find((s) => s.current)?.id).toBe('s1');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('reports a failed listing', async () => {
    mockPassflow.listSessions.mockRejectedValue(new Error('unauthorized'));
    const { result } = renderHook(() => useSessions());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.errorMessage).toBe('unauthorized');
    expect(result.current.data).toEqual([]);
  });

  it('revokes a session and drops it from the list', async () => {
    mockPassflow.listSessions.mockResolvedValue([session('s1', true), session('s2')]);
    mockPassflow.revokeSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    await act(async () => {
      expect(await result.current.revoke('s2')).toBe(true);
    });

    expect(mockPassflow.revokeSession).toHaveBeenCalledWith('s2');
    expect(result.current.data.map((s) => s.id)).toEqual(['s1']);
    expect(mockPassflow.listSessions).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and reports the error when revoking fails', async () => {
    mockPassflow.listSessions.mockResolvedValue([session('s1', true), session('s2')]);
    mockPassflow.revokeSession.mockRejectedValue(new Error('session not found'));
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    await act(async () => {
      expect(await result.current.revoke('s2')).toBe(false);
    });

    expect(result.current.data.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(result.current.isError).toBe(true);
    expect(result.current.errorMessage).toBe('session not found');
    expect(result.current.isLoading).toBe(false);
  });

  it('signs out the other sessions, returns the count and keeps only the current one', async () => {
    mockPassflow.listSessions.mockResolvedValue([session('s1'), session('s2', true), session('s3')]);
    mockPassflow.signOutOtherSessions.mockResolvedValue({ revoked: 2 });
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.data).toHaveLength(3));

    await act(async () => {
      expect(await result.current.signOutOthers()).toBe(2);
    });

    expect(result.current.data.map((s) => s.id)).toEqual(['s2']);
    expect(result.current.isError).toBe(false);
  });

  it('keeps the list and reports the error when signing out the others fails', async () => {
    mockPassflow.listSessions.mockResolvedValue([session('s1', true), session('s2')]);
    mockPassflow.signOutOtherSessions.mockRejectedValue(new Error('server error'));
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    await act(async () => {
      expect(await result.current.signOutOthers()).toBeNull();
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.isError).toBe(true);
    expect(result.current.errorMessage).toBe('server error');
  });

  it('refetches on demand', async () => {
    mockPassflow.listSessions
      .mockResolvedValueOnce([session('s1', true)])
      .mockResolvedValueOnce([session('s1', true), session('s4')]);
    const { result } = renderHook(() => useSessions());
    await waitFor(() => expect(result.current.data).toHaveLength(1));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data.map((s) => s.id)).toEqual(['s1', 's4']);
  });
});
