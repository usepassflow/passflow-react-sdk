import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { LoginScreen } from './login-screen';
import type { LoginConsentState } from './types';

/** Who asks on the consent screen, where the user is sent, and what the server warns about. */
const meta = {
  title: 'Components/LoginScreen/Consent Client',
  component: LoginScreen,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const story = (client: Partial<LoginConsentState>): Story['args'] => ({
  chrome: {
    title: 'Allow Acme Notes to access your account?',
    subtitle: 'Choose what this application may use, then allow or deny.',
  },
  state: {
    kind: 'consent',
    appName: 'Acme Notes',
    scopes: [{ scope: 'profile', label: 'View your profile', description: 'Your name and profile picture.', granted: true }],
    onToggleScope: fn(),
    onAllow: fn(),
    onDeny: fn(),
    ...client,
  },
});

const warnings: LoginConsentState['warnings'] = [
  {
    code: 'phishing_domain',
    severity: 'critical',
    message: 'notes.acme-login.example is reported as a phishing site. Deny this request unless you are sure.',
  },
  {
    code: 'brand_lookalike',
    severity: 'high',
    message: 'This application uses the name of a well-known brand but its host does not belong to that brand.',
  },
  {
    code: 'localhost_redirect',
    severity: 'notice',
    message: 'This application runs on your computer. Continue only if you started it.',
  },
  {
    code: 'unverified_client',
    severity: 'info',
    message: 'This application is not verified. Check its host before you allow access.',
  },
];

const verifiedClient: Partial<LoginConsentState> = {
  clientHost: 'notes.acme.example',
  redirectHost: 'notes.acme.example',
  verified: true,
  resources: [
    { uri: 'https://mcp.acme.example/mcp', name: 'Acme MCP' },
    { uri: 'https://api.acme.example/a-resource-without-a-name/that-has-a-long-address' },
  ],
};

export const Verified: Story = {
  args: story(verifiedClient),
};

export const VerifiedLoopback: Story = {
  args: story({ ...verifiedClient, redirectHost: 'localhost', redirectLoopback: true, warnings: warnings.slice(2, 3) }),
};

/** The name is the client's own claim, so its host is drawn as prominently. */
export const Unverified: Story = {
  args: story({
    clientHost: 'notes.acme-login.example',
    redirectHost: 'localhost',
    redirectLoopback: true,
    prominentHost: 'client',
    warnings,
  }),
};

/** A client with no host of its own: the redirect host identifies it. */
export const UnverifiedDynamic: Story = {
  args: story({
    redirectHost: 'a-very-long-subdomain-that-has-to-wrap.notes.acme-login.example',
    prominentHost: 'redirect',
    warnings: warnings.slice(3),
  }),
};
