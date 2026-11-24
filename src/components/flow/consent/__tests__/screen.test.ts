import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsentInfo, UseConsentProps } from '@/hooks/use-consent';
import { getConsentLoginScreenProps } from '../screen';

const info: ConsentInfo = {
  client_id: 'acme-notes-client',
  app_name: 'Acme Notes',
  app_logo_url: 'https://acme.test/logo.png',
  requested_scopes: ['openid', 'profile', 'offline_access'],
  scope_metadata: [{ scope: 'profile', label: 'View your profile', description: 'Your name and picture.' }],
  redirect_uri: 'https://acme.test/callback',
  state: 'state-1',
  response_mode: 'query',
  first_party: false,
  csrf_token: 'csrf-token',
};

const consent = (overrides: Partial<UseConsentProps> = {}): UseConsentProps => ({
  status: 'ready',
  info,
  grantedScopes: [...info.requested_scopes],
  error: null,
  scopeMetadata: (scope) =>
    info.scope_metadata.find((meta) => meta.scope === scope) ?? { scope, label: scope, description: '' },
  toggleScope: vi.fn(),
  allow: vi.fn().mockResolvedValue(undefined),
  deny: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const consentState = (value: UseConsentProps) => {
  const screen = getConsentLoginScreenProps(value);
  if (screen?.state.kind !== 'consent') throw new Error('expected a consent state');
  return { screen, state: screen.state };
};

describe('getConsentLoginScreenProps', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('renders nothing while the request is loading', () => {
    expect(getConsentLoginScreenProps(consent({ status: 'loading', info: null }))).toBeNull();
  });

  it('renders nothing when ready without request metadata', () => {
    expect(getConsentLoginScreenProps(consent({ info: null }))).toBeNull();
  });

  it('maps an unusable link to a general error that returns to login', () => {
    const screen = getConsentLoginScreenProps(
      consent({
        status: 'invalid',
        info: null,
        error: { message: 'Consent request unavailable', description: 'Return to the application and try again.' },
      }),
    );

    expect(screen?.chrome.title).toBe('Consent request unavailable');
    expect(screen?.state).toMatchObject({
      kind: 'general-error',
      message: 'Consent request unavailable',
      detail: 'Return to the application and try again.',
      actionLabel: 'Back to login',
    });
    if (screen?.state.kind !== 'general-error') throw new Error('expected general-error');

    screen.state.onAction();
    expect(window.location.href).toBe('/web');
  });

  it('falls back to generic copy when an invalid link carries no error', () => {
    const screen = getConsentLoginScreenProps(consent({ status: 'invalid', info: null }));

    expect(screen?.chrome.title).toBe('Consent request unavailable');
  });

  it('maps a recorded decision to a success status naming the app', () => {
    const screen = getConsentLoginScreenProps(consent({ status: 'redirecting' }));

    expect(screen?.chrome.subtitle).toBe('Returning you to Acme Notes.');
    expect(screen?.state).toMatchObject({ kind: 'status', tone: 'success', testId: 'consent-redirecting' });
  });

  it('names a generic application when the app has no name yet', () => {
    const screen = getConsentLoginScreenProps(consent({ status: 'redirecting', info: null }));

    expect(screen?.chrome.subtitle).toBe('Returning you to the application.');
  });

  it('puts the app name and logo in the chrome so the screen reads as THIS app asking', () => {
    const { screen } = consentState(consent());

    expect(screen.chrome).toMatchObject({
      title: 'Allow Acme Notes to access your account?',
      customLogo: 'https://acme.test/logo.png',
      customLogoAlt: 'Acme Notes logo',
    });
  });

  it('falls back to the client id when the app has no name, and omits an empty logo', () => {
    const { screen, state } = consentState(consent({ info: { ...info, app_name: '', app_logo_url: '' } }));

    expect(screen.chrome.title).toBe('Allow acme-notes-client to access your account?');
    expect(screen.chrome.customLogo).toBeUndefined();
    expect(state.appName).toBe('acme-notes-client');
  });

  it('maps each requested scope with its label, description and granted flag', () => {
    const { state } = consentState(consent({ grantedScopes: ['openid', 'offline_access'] }));

    expect(state.scopes).toEqual([
      { scope: 'openid', label: 'openid', description: undefined, granted: true },
      { scope: 'profile', label: 'View your profile', description: 'Your name and picture.', granted: false },
      { scope: 'offline_access', label: 'offline_access', description: undefined, granted: true },
    ]);
  });

  it('is busy only while a decision is in flight', () => {
    expect(consentState(consent({ status: 'ready' })).state.busy).toBe(false);
    expect(consentState(consent({ status: 'working' })).state.busy).toBe(true);
  });

  it('surfaces a failed decision as the screen error', () => {
    const { state } = consentState(consent({ error: { message: 'Could not submit your decision.' } }));

    expect(state.error).toBe('Could not submit your decision.');
  });

  it('routes the screen callbacks to the hook', () => {
    const value = consent();
    const { state } = consentState(value);

    state.onToggleScope('profile');
    state.onAllow();
    state.onDeny();

    expect(value.toggleScope).toHaveBeenCalledWith('profile');
    expect(value.allow).toHaveBeenCalledTimes(1);
    expect(value.deny).toHaveBeenCalledTimes(1);
  });
});

describe('client identity in getConsentLoginScreenProps', () => {
  const stateFor = (fields: Partial<ConsentInfo>) => consentState(consent({ info: { ...info, ...fields } })).state;
  const urlClient: Partial<ConsentInfo> = {
    client_kind: 'metadata_document',
    client_host: 'notes.acme.example',
    redirect_host: 'notes.acme.example',
  };

  it.each<[string, Partial<ConsentInfo>, Record<string, unknown>]>([
    [
      'a verified URL client',
      { ...urlClient, verified: true },
      { clientHost: 'notes.acme.example', redirectHost: 'notes.acme.example', verified: true, prominentHost: undefined },
    ],
    [
      'an unverified URL client',
      { ...urlClient, verified: false },
      { clientHost: 'notes.acme.example', verified: undefined, prominentHost: 'client' },
    ],
    ['a URL client without a verified field', urlClient, { verified: undefined, prominentHost: 'client' }],
    [
      'an unverified dynamic client',
      { client_kind: 'dynamic', redirect_host: 'acme.test', verified: false },
      { clientHost: undefined, redirectHost: 'acme.test', verified: undefined, prominentHost: 'redirect' },
    ],
    [
      'an unverified URL client without a client host',
      { client_kind: 'metadata_document', redirect_host: 'acme.test', verified: false },
      { clientHost: undefined, redirectHost: 'acme.test', prominentHost: 'redirect' },
    ],
    [
      'a verified dynamic client',
      { client_kind: 'dynamic', redirect_host: 'acme.test', verified: true },
      { redirectHost: 'acme.test', prominentHost: undefined },
    ],
    [
      'a registered client',
      { client_kind: 'registered', redirect_host: 'acme.test', verified: false },
      { clientHost: undefined, redirectHost: 'acme.test', prominentHost: undefined },
    ],
  ])('maps %s', (_name, fields, expected) => {
    const state = stateFor(fields);

    for (const [key, value] of Object.entries(expected)) expect(state[key as keyof typeof state], key).toBe(value);
  });

  it.each([
    ['localhost', true],
    ['localhost:8080', true],
    ['app.localhost', true],
    ['127.0.0.1', true],
    ['127.0.0.1:3000', true],
    ['127.255.10.1', true],
    ['::1', true],
    ['[::1]', true],
    ['[::1]:3000', true],
    ['127.0.0.1.evil.com', false],
    ['localhost.evil.com', false],
    ['notlocalhost', false],
    ['evil127.0.0.1', false],
    ['127.evil.com', false],
    ['128.0.0.1', false],
    ['::2', false],
    ['com.example.app', false],
    ['acme.test', false],
  ])('reads the redirect host %s as loopback: %s', (redirect_host, loopback) => {
    const state = stateFor({ ...urlClient, verified: true, redirect_host });

    expect(Boolean(state.redirectLoopback)).toBe(loopback);
    expect(state.redirectHost).toBe(redirect_host);
  });

  it('leaves every new prop undefined for a server that sends none of the fields', () => {
    const state = stateFor({});
    const keys = [
      'clientHost',
      'redirectHost',
      'prominentHost',
      'verified',
      'redirectLoopback',
      'resources',
      'warnings',
    ] as const;

    for (const key of keys) expect(state[key], key).toBeUndefined();
  });

  it.each<[string, null | []]>([
    ['null', null],
    ['empty', []],
  ])('maps %s lists to undefined', (_name, list) => {
    const state = stateFor({ ...urlClient, resources: list, warnings: list });

    expect(state.resources).toBeUndefined();
    expect(state.warnings).toBeUndefined();
  });

  it('passes resources and warnings through in server order', () => {
    const resources: ConsentInfo['resources'] = [
      { uri: 'https://mcp.example.com/mcp', name: 'Example MCP' },
      { uri: 'https://api.example.com' },
    ];
    const warnings: ConsentInfo['warnings'] = [
      { code: 'phishing_domain', severity: 'critical', message: 'Critical.' },
      { code: 'brand_lookalike', severity: 'high', message: 'High.' },
      { code: 'localhost_redirect', severity: 'notice', message: 'Notice.' },
      { code: 'unverified_client', severity: 'info', message: '<b>Info.</b>' },
    ];
    const state = stateFor({ ...urlClient, resources, warnings });

    expect(state.resources).toEqual(resources);
    expect(state.warnings).toEqual(warnings);
  });

  it.each([['false'], ['true'], [1], [{}], [null], [false]])('does not read verified: %j as verified', (verified) => {
    const state = stateFor({ ...urlClient, verified: verified as boolean });

    expect(state.verified).toBeUndefined();
    expect(state.prominentHost).toBe('client');
  });

  it.each([['text'], [1], [true], [{}], [{ length: 1 }], [[null, 1, {}]]])('reads the list %j as none', (list) => {
    const state = stateFor({ ...urlClient, resources: list as never, warnings: list as never });

    expect(state.resources).toBeUndefined();
    expect(state.warnings).toBeUndefined();
  });

  it('skips unusable items and keeps every warning that has text', () => {
    const junk = [null, undefined, 1, 'text', [], {}, { uri: {}, message: {} }, { uri: '', message: '' }];
    const state = stateFor({
      ...urlClient,
      resources: [...junk, { uri: 'https://api.example.com', name: {} }] as never,
      warnings: [
        ...junk,
        { code: 'new_code', severity: 'severe', message: 'New.' },
        { code: {}, message: 'No code.' },
        { code: 'phishing_domain', severity: 'CRITICAL', message: 'Shouted.' },
      ] as never,
    });

    expect(state.resources).toEqual([{ uri: 'https://api.example.com' }]);
    expect(state.warnings).toEqual([
      { code: 'new_code', severity: 'severe', message: 'New.' },
      { code: 'unknown', severity: 'info', message: 'No code.' },
      { code: 'phishing_domain', severity: 'critical', message: 'Shouted.' },
    ]);
  });
});

describe('a server response for a pasted URL client', () => {
  // Typed as ConsentInfo with no cast, so a renamed or retyped field fails the type check.
  const response: ConsentInfo & { request_id: string } = {
    request_id: '3MXTaXuNmk5tJzTcd9ccKtqRCNQ',
    client_id: 'https://claude-login.example.com/oauth/client.json',
    app_name: 'Claude Connector 2',
    app_logo_url: '',
    requested_scopes: ['mcp', 'offline_access'],
    scope_metadata: [
      { scope: 'mcp', label: 'mcp', description: '' },
      { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)' },
    ],
    redirect_uri: 'http://localhost:53111/callback',
    state: 's1',
    response_mode: '',
    first_party: false,
    csrf_token: 'x',
    issuer: 'http://localhost:8799',
    client_kind: 'metadata_document',
    client_host: 'claude-login.example.com',
    redirect_host: 'localhost',
    verified: false,
    resources: [{ uri: 'http://localhost:8090/mcp', name: 'Sample' }],
    warnings: [
      {
        code: 'brand_lookalike',
        severity: 'high',
        message: 'This client looks like Claude, but claude-login.example.com does not belong to it.',
      },
      {
        code: 'localhost_redirect',
        severity: 'notice',
        message: 'Access goes to an app on this computer. Allow it only if you started this sign-in yourself.',
      },
      {
        code: 'unverified_client',
        severity: 'info',
        message: 'This client is not verified. Check that you know its address before you allow it.',
      },
    ],
  };
  const stateOf = (body: ConsentInfo) =>
    consentState(
      consent({
        info: body,
        grantedScopes: [...body.requested_scopes],
        scopeMetadata: (scope) =>
          body.scope_metadata.find((meta) => meta.scope === scope) ?? { scope, label: scope, description: '' },
      }),
    ).state;

  it('maps every field the screen shows', () => {
    const state = stateOf(JSON.parse(JSON.stringify(response)) as ConsentInfo);

    expect(state).toMatchObject({
      appName: 'Claude Connector 2',
      clientHost: 'claude-login.example.com',
      redirectHost: 'localhost',
      redirectLoopback: true,
      prominentHost: 'client',
      resources: response.resources,
      warnings: response.warnings,
    });
    expect(state.verified).toBeUndefined();
    expect(state.scopes.map(({ scope, label, granted }) => [scope, label, granted])).toEqual([
      ['mcp', 'mcp', true],
      ['offline_access', 'Offline access', true],
    ]);
  });

  it('shows a first-party app as before', () => {
    const state = stateOf({
      ...response,
      first_party: true,
      client_kind: 'registered',
      client_host: undefined,
      redirect_host: undefined,
      verified: false,
      resources: [],
      warnings: [],
    });

    for (const key of ['clientHost', 'redirectHost', 'prominentHost', 'verified', 'resources', 'warnings'] as const) {
      expect(state[key], key).toBeUndefined();
    }
  });
});
