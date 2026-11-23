import { act, cleanup, render } from '@testing-library/react';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentFlow } from '@/components/flow/consent';
import { DeviceVerifyFlow } from '@/components/flow/device-verify';
import { VerifyChallengeApproval } from '@/components/form/verify-challenge/verify-challenge-approval';

const registerTool = vi.fn();
let previous: PropertyDescriptor | undefined;
const flow = vi.hoisted(() => ({
  navigate: vi.fn(),
  submit: vi.fn(),
  approve: vi.fn(),
  allow: vi.fn(),
  deny: vi.fn(),
  toggle: vi.fn(),
}));

const passflow = {
  isAuthenticated: () => true,
  isTwoFactorVerificationRequired: () => false,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

vi.mock('@/hooks/use-passflow', () => ({ usePassflow: () => passflow }));

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useAppSettings: () => ({
    appSettings: { bot_mode: 'bot_friendly', auth_strategies: [], defaults: { redirect: '/dashboard' } },
    scopes: ['openid'],
    passwordPolicy: null,
    currentStyles: null,
  }),
  usePassflow: () => passflow,
  useNavigation: () => ({ navigate: flow.navigate }),
  useDeviceVerify: () => ({
    state: { kind: 'code-entry', onSubmit: flow.submit },
    submitCode: flow.submit,
    approve: flow.approve,
  }),
  useConsent: () => ({
    state: {
      kind: 'consent',
      appName: 'Sample app',
      scopes: [],
      onAllow: flow.allow,
      onDeny: flow.deny,
      onToggleScope: flow.toggle,
    },
    allow: flow.allow,
    deny: flow.deny,
    toggleScope: flow.toggle,
  }),
}));

describe('REQ-14 approval and consent WebMCP scope', () => {
  beforeEach(() => {
    registerTool.mockClear();
    previous = Object.getOwnPropertyDescriptor(document, 'modelContext');
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  });

  afterEach(() => {
    cleanup();
    if (previous) Object.defineProperty(document, 'modelContext', previous);
    else Reflect.deleteProperty(document, 'modelContext');
  });

  it('never registers from the device verify flow', async () => {
    await renderFlow(<DeviceVerifyFlow {...({} as ComponentProps<typeof DeviceVerifyFlow>)} />);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('never registers from the passwordless approval flow', async () => {
    await renderFlow(<VerifyChallengeApproval challengeId='approval-fixture' otp='123456' />);
    expect(registerTool).not.toHaveBeenCalled();
  });

  it('never registers from the consent flow', async () => {
    await renderFlow(<ConsentFlow {...({} as ComponentProps<typeof ConsentFlow>)} />);
    expect(registerTool).not.toHaveBeenCalled();
  });
});

async function renderFlow(element: ReactElement) {
  await act(async () => {
    render(element);
  });
}
