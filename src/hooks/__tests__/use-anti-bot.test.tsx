import { PassflowEvent } from '@passflow/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAntiBot } from '@/hooks';

const core = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  setAntiBotTokenProvider: vi.fn(),
}));

vi.mock('@/hooks/use-passflow', () => ({ usePassflow: () => core }));

type Settings = Parameters<typeof useAntiBot>[0];
const settings = (config: object) => config as Settings;
const vendors = ['turnstile', 'hcaptcha', 'recaptcha'] as const;

describe('REQ-7 useAntiBot', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['unloaded (null)', null],
    ['unloaded (undefined)', undefined],
    ['implicit bot_friendly', {}],
    ['explicit bot_friendly', { bot_mode: 'bot_friendly', anti_bot: { provider: 'turnstile', site_key: 'unused' } }],
    ...vendors.map((provider) => [provider + ' with no site key', { bot_mode: 'human_only', anti_bot: { provider } }] as const),
  ])('does not install a check for %s', (_, config) => {
    const { result } = renderHook(() => useAntiBot(config as Settings));

    expect(result.current).toBeUndefined();
    expect(core.subscribe).not.toHaveBeenCalled();
    expect(core.setAntiBotTokenProvider).not.toHaveBeenCalled();
  });

  it.each([undefined, { provider: 'builtin' }])('reports built-in solve state and unsubscribes (anti_bot=%j)', (anti_bot) => {
    const config = settings({ bot_mode: 'human_only', anti_bot });
    const { result, unmount } = renderHook(() => useAntiBot(config));
    expect(result.current).toEqual({ provider: 'builtin', solving: false });
    expect(core.subscribe).toHaveBeenCalledTimes(1);
    const [subscriber] = core.subscribe.mock.calls[0];
    expect(core.subscribe).toHaveBeenCalledWith(
      subscriber,
      expect.arrayContaining([PassflowEvent.AntiBotSolving, PassflowEvent.AntiBotSolved, PassflowEvent.Error]),
    );
    expect(core.setAntiBotTokenProvider).not.toHaveBeenCalled();

    type SolveEvent = (typeof PassflowEvent)['AntiBotSolving' | 'AntiBotSolved' | 'Error'];
    const emit = (event: SolveEvent) =>
      act(() => subscriber.onAuthChange(event, { operation: 'password-reset.send', provider: 'builtin' }));
    emit(PassflowEvent.AntiBotSolving);
    expect(result.current).toEqual({ provider: 'builtin', solving: true });
    emit(PassflowEvent.AntiBotSolved);
    expect(result.current).toEqual({ provider: 'builtin', solving: false });
    emit(PassflowEvent.AntiBotSolving);
    expect(result.current).toEqual({ provider: 'builtin', solving: true });
    emit(PassflowEvent.Error);
    expect(result.current).toEqual({ provider: 'builtin', solving: false });

    expect(core.subscribe).toHaveBeenCalledTimes(1);
    unmount();
    expect(core.unsubscribe.mock.calls.map(([removedSubscriber]) => removedSubscriber)).toContain(subscriber);
  });

  it.each(vendors)('delegates each %s token request to the latest ready widget until teardown', async (provider) => {
    const { result, unmount } = renderHook(() =>
      useAntiBot(settings({ bot_mode: 'human_only', anti_bot: { provider, site_key: 'fake-key' } })),
    );
    expect(result.current).toMatchObject({ provider, siteKey: 'fake-key' });
    expect(core.subscribe).not.toHaveBeenCalled();
    expect(core.setAntiBotTokenProvider).toHaveBeenCalledTimes(1);
    expect(core.setAntiBotTokenProvider).toHaveBeenCalledWith(expect.any(Function));
    const [[requestToken]] = core.setAntiBotTokenProvider.mock.calls;
    const props = result.current;
    if (!props || !('onReady' in props) || !props.onReady) throw new Error('Expected vendor readiness callback');
    const { onReady } = props;
    const context = { action: 'passflow_auth', operation: 'password-reset.send' };
    await expect(requestToken(context)).rejects.toBeDefined();

    const firstWidget = vi.fn().mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2');
    act(() => onReady(firstWidget));
    await expect(requestToken(context)).resolves.toBe('token-1');
    await expect(requestToken(context)).resolves.toBe('token-2');
    expect(firstWidget).toHaveBeenCalledTimes(2);

    act(() => onReady(async () => 'replacement-token'));
    await expect(requestToken(context)).resolves.toBe('replacement-token');
    act(() => onReady(undefined));
    await expect(requestToken(context)).rejects.toBeDefined();

    unmount();
    expect(core.setAntiBotTokenProvider.mock.calls).toEqual([[requestToken], [undefined]]);
  });
});
