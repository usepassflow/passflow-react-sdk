import { describe, expect, it, vi } from 'vitest';
import type { UseDeviceVerifyProps } from '@/hooks/use-device-verify';
import { deviceErrorOfType } from '@/utils';
import { getDeviceLoginScreenProps } from '../screen';

const device = (overrides: Partial<UseDeviceVerifyProps> = {}): UseDeviceVerifyProps => ({
  status: 'ready',
  info: {
    mode: 'consent',
    user_code: 'WDJB-MJHT',
    app_name: 'Passflow CLI',
    csrf_token: 'csrf-token',
    methods: { password: true, passkey: true },
  },
  error: null,
  email: null,
  isAuthenticated: false,
  isSecondFactorPending: false,
  secondFactorMethods: [],
  submitCode: vi.fn(),
  signInWithPassword: vi.fn().mockResolvedValue(undefined),
  signInWithPasskey: vi.fn().mockResolvedValue(undefined),
  approve: vi.fn().mockResolvedValue(undefined),
  confirmWithPassword: vi.fn().mockResolvedValue(undefined),
  confirmWithPasskey: vi.fn().mockResolvedValue(undefined),
  submitSecondFactor: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  ...overrides,
});

describe('getDeviceLoginScreenProps', () => {
  it('maps consent to the canonical credential state and preserves one-tap approval', () => {
    const value = device();
    const screen = getDeviceLoginScreenProps(value);

    expect(screen?.state.kind).toBe('credentials');
    if (screen?.state.kind !== 'credentials') throw new Error('expected credentials state');

    expect(screen.state.notice).toMatchObject({ code: 'WDJB-MJHT', appName: 'Passflow CLI' });
    screen.state.onPassword?.({
      method: 'email_or_username',
      emailOrUsername: 'jack@example.com',
      phone: '',
      password: 'secret',
    });
    expect(value.confirmWithPassword).toHaveBeenCalledWith('jack@example.com', 'secret');
  });

  it('replaces full-login credentials with approval after authentication', () => {
    const before = getDeviceLoginScreenProps(
      device({
        info: {
          mode: 'full_login',
          user_code: 'WDJB-MJHT',
          app_name: 'Passflow CLI',
          csrf_token: 'csrf-token',
          methods: { password: true, passkey: true },
        },
      }),
    );
    expect(before?.state.kind).toBe('credentials');

    const value = device({
      status: 'signed_in',
      isAuthenticated: true,
      email: 'jack@example.com',
      info: {
        mode: 'full_login',
        user_code: 'WDJB-MJHT',
        app_name: 'Passflow CLI',
        csrf_token: 'csrf-token',
        methods: { password: true, passkey: true },
      },
    });
    const after = getDeviceLoginScreenProps(value);

    expect(after?.state).toMatchObject({
      kind: 'device-approval',
      appName: 'Passflow CLI',
      code: 'WDJB-MJHT',
      identity: 'jack@example.com',
      busy: false,
    });
    if (after?.state.kind !== 'device-approval') throw new Error('expected device approval state');
    after.state.onApprove();
    expect(value.approve).toHaveBeenCalledOnce();
  });

  it('keeps authenticated approval visible while approval is working', () => {
    const screen = getDeviceLoginScreenProps(
      device({
        status: 'working',
        isAuthenticated: true,
        email: 'jack@example.com',
        info: {
          mode: 'full_login',
          user_code: 'WDJB-MJHT',
          app_name: 'Passflow CLI',
          csrf_token: 'csrf-token',
          methods: { password: true, passkey: true },
        },
      }),
    );

    expect(screen?.state).toMatchObject({ kind: 'device-approval', busy: true, identity: 'jack@example.com' });
  });

  it('maps a recoverable passkey error to retry instead of another automatic wait', () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const error = deviceErrorOfType('passkey_failed');
    const screen = getDeviceLoginScreenProps(
      device({
        status: 'ready',
        error,
        confirmWithPasskey: retry,
        info: {
          mode: 'passkey',
          app_name: 'Passflow CLI',
          csrf_token: 'csrf-token',
          methods: { password: false, passkey: true },
        },
      }),
    );

    expect(screen?.state.kind).toBe('passkey-progress');
    if (screen?.state.kind !== 'passkey-progress') throw new Error('expected passkey state');
    expect(screen.state.working).toBe(false);
    expect(screen.state.recoverable).toBe(true);
    screen.state.onRetry?.();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('maps refused mode to a terminal state with no retry', () => {
    const screen = getDeviceLoginScreenProps(
      device({
        status: 'refused',
        error: deviceErrorOfType('mode_disabled'),
      }),
    );

    expect(screen?.state).toMatchObject({ kind: 'status', tone: 'disabled' });
    if (screen?.state.kind !== 'status') throw new Error('expected status state');
    expect(screen.state.recoverable).toBeUndefined();
    expect(screen.state.onRetry).toBeUndefined();
  });

  it('asks for the second factor before any approval, in every mode', () => {
    for (const mode of ['consent', 'full_login', 'passkey'] as const) {
      const value = device({
        status: 'second_factor',
        isSecondFactorPending: true,
        secondFactorMethods: ['totp', 'recovery_codes'],
        email: 'jack@example.com',
        info: {
          mode,
          user_code: 'WDJB-MJHT',
          app_name: 'Passflow CLI',
          csrf_token: 'csrf-token',
          methods: { password: true, passkey: true },
        },
      });
      const screen = getDeviceLoginScreenProps(value);

      expect(screen?.state).toMatchObject({
        kind: 'second-factor',
        methods: ['totp', 'recovery_codes'],
        identity: 'jack@example.com',
        busy: false,
      });
      if (screen?.state.kind !== 'second-factor') throw new Error('expected second-factor state');
      screen.state.onSubmit('totp', '123456');
      expect(value.submitSecondFactor).toHaveBeenCalledWith('totp', '123456');
    }
  });

  it('keeps the second-factor screen while the code is checked', () => {
    const screen = getDeviceLoginScreenProps(
      device({ status: 'working', isSecondFactorPending: true, secondFactorMethods: ['totp'] }),
    );

    expect(screen?.state).toMatchObject({ kind: 'second-factor', busy: true });
  });

  it('returns no presentation while loading', () => {
    expect(getDeviceLoginScreenProps(device({ status: 'loading', info: null }))).toBeNull();
  });
});

describe('what approving a device grants', () => {
  // A GET /oidc/device/info body from a server that lists the access.
  const info = {
    mode: 'consent' as const,
    user_code: 'WDJB-MJHT',
    app_name: 'Passflow CLI',
    csrf_token: 'csrf-token',
    methods: { password: true, passkey: true },
    resources: [{ uri: 'http://localhost:8090/mcp', name: 'Sample' }],
    scopes: ['openid', 'mcp', 'offline_access'],
    scope_metadata: [
      { scope: 'openid', label: 'Sign in', description: 'Confirm your identity' },
      { scope: 'mcp', label: 'mcp', description: '' },
      { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)' },
    ],
  };
  const access = {
    resources: [{ uri: 'http://localhost:8090/mcp', name: 'Sample' }],
    scopes: [
      { scope: 'openid', label: 'Sign in', description: 'Confirm your identity' },
      { scope: 'mcp', label: 'mcp', description: undefined },
      { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)' },
    ],
  };
  const noticeOf = (value: UseDeviceVerifyProps) => {
    const screen = getDeviceLoginScreenProps(value);
    if (screen?.state.kind !== 'credentials') throw new Error('expected credentials state');
    return screen.state.notice;
  };

  it('lists each resource and every scope, with the consent labels, before a one-tap approval', () => {
    expect(noticeOf(device({ info: JSON.parse(JSON.stringify(info)) }))).toMatchObject(access);
  });

  it('lists them on both full-login screens, before signing in and on the approval', () => {
    const fullLogin = { ...info, mode: 'full_login' as const };
    expect(noticeOf(device({ info: fullLogin }))).toMatchObject(access);

    const approval = getDeviceLoginScreenProps(device({ info: fullLogin, isAuthenticated: true }));
    if (approval?.state.kind !== 'device-approval') throw new Error('expected approval state');
    expect(approval.state).toMatchObject(access);
  });

  it('names a scope by itself when the server sends no label for it', () => {
    const notice = noticeOf(device({ info: { ...info, scope_metadata: undefined } }));
    expect(notice?.scopes).toEqual(info.scopes.map((scope) => ({ scope, label: scope, description: undefined })));
  });

  it('shows an older server, and unusable lists, as before', () => {
    const { resources: _r, scopes: _s, scope_metadata: _m, ...older } = info;
    const junk = { ...info, resources: 'none', scopes: [null, 7, ''], scope_metadata: 'x' } as unknown as typeof info;

    for (const body of [older, junk]) {
      const notice = noticeOf(device({ info: body }));
      expect(notice?.resources).toBeUndefined();
      expect(notice?.scopes).toBeUndefined();
    }
  });
});
