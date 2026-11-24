import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { LoginScreen } from './login-screen';
import type { LoginAccessScope, LoginConsentResource } from './types';

/** What approving a device sign-in grants, shown before the approval. */
const meta = {
  title: 'Components/LoginScreen/Device Access',
  component: LoginScreen,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const resources: LoginConsentResource[] = [{ uri: 'http://localhost:8090/mcp', name: 'Sample' }];

const scopes: LoginAccessScope[] = [
  { scope: 'openid', label: 'Sign in', description: 'Confirm your identity' },
  { scope: 'mcp', label: 'mcp' },
  { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)' },
];

export const OneTapApproval: Story = {
  args: {
    chrome: {
      title: 'Approve sign-in to Passflow CLI',
      subtitle: 'Confirm the code, then sign in to approve this request.',
      variant: 'sign-in',
    },
    state: {
      kind: 'credentials',
      methods: {
        identities: [
          {
            id: 'email_or_username',
            label: 'Email',
            selectLabel: 'Use email',
            requiredMessage: 'Email is required',
            format: 'email',
            password: true,
          },
        ],
        passkey: true,
        providers: [],
      },
      passwordPolicy: null,
      notice: {
        code: 'WDJB-MJHT',
        appName: 'Passflow CLI',
        message: "requested this sign-in. Confirm that the code matches your terminal. If it doesn't, close this page.",
        resources,
        scopes,
      },
      primaryLabel: 'Approve',
      passkeyLabel: 'Approve with a Passkey',
      onPassword: fn(),
      onPasskey: fn(),
    },
  },
};

export const SignedInApproval: Story = {
  args: {
    chrome: {
      title: 'Approve sign-in to Passflow CLI',
      subtitle: 'Confirm that the code matches your terminal before approving.',
    },
    state: {
      kind: 'device-approval',
      appName: 'Passflow CLI',
      code: 'WDJB-MJHT',
      identity: 'jack@example.com',
      resources: [
        ...resources,
        { uri: `https://mcp.acme.example/${'x'.repeat(80)}`, name: 'A resource with an unbroken address' },
      ],
      scopes,
      onApprove: fn(),
    },
  },
};
