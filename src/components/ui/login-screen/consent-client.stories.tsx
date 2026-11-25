import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { LoginScreen } from './login-screen';
import type { LoginConsentScope, LoginConsentState, LoginScreenProps } from './types';

/**
 * Who asks on the consent screen, where the user is sent, what the server warns
 * about, and what the user can switch off. Required scopes are plain lines;
 * every other scope is a switch, and all switches share one column on the
 * right, in the list and inside resource cards alike. The switches work: each
 * story holds its own selection.
 */
const meta = {
  title: 'Components/LoginScreen/Consent Client',
  component: LoginScreen,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
  },
  render: function Render(args) {
    const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
    if (args.state.kind !== 'consent') return <LoginScreen {...args} />;

    const flip = (item: LoginConsentScope): LoginConsentScope =>
      toggled.has(item.scope) ? { ...item, granted: !item.granted } : item;
    const state = args.state;
    return (
      <LoginScreen
        chrome={args.chrome}
        state={{
          ...state,
          scopes: state.scopes.map(flip),
          resources: state.resources?.map((resource) => ({ ...resource, scopes: resource.scopes?.map(flip) })),
          onToggleScope: (scope) => {
            state.onToggleScope(scope);
            setToggled((previous) => {
              const next = new Set(previous);
              if (next.has(scope)) next.delete(scope);
              else next.add(scope);
              return next;
            });
          },
        }}
      />
    );
  },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const story = (client: Partial<LoginConsentState>, appName = 'Acme Notes'): LoginScreenProps => ({
  chrome: {
    title: `Allow ${appName} to access your account?`,
    subtitle: 'Choose what this application may use, then allow or deny.',
  },
  state: {
    kind: 'consent',
    appName,
    scopes: [{ scope: 'profile', label: 'View your profile', description: 'Your name and profile picture.', granted: true }],
    testId: 'consent-screen',
    allowTestId: 'consent-allow',
    denyTestId: 'consent-deny',
    appNameTestId: 'consent-app-name',
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

/** What a current server lists below the resources for an MCP request. */
const mcpScopes: LoginConsentScope[] = [
  { scope: 'openid', label: 'Confirm who you are', description: "Lets the app know it's you", required: true, granted: true },
  {
    scope: 'offline_access',
    label: 'Stay connected',
    description: "Keep access when you're not using it, until you remove it",
    required: true,
    granted: true,
  },
  { scope: 'email', label: 'See your email address', granted: true },
];

/** One resource with a required, an on and an off scope of its own. */
const notesResource: NonNullable<LoginConsentState['resources']>[number] = {
  uri: 'https://notes.example/mcp',
  name: 'Sample notes',
  scopes: [
    { scope: 'notes:read', label: 'Read your notes', required: true, granted: true },
    { scope: 'notes:write', label: 'Write and change your notes', granted: true },
    { scope: 'notes:share', label: 'Share your notes with other people', granted: false },
  ],
};

/** An MCP client on the user's own computer: the redirect goes to localhost. */
export const McpVerifiedLocalClient: Story = {
  args: story(
    {
      clientHost: 'claude.ai',
      redirectHost: 'localhost',
      redirectLoopback: true,
      verified: true,
      resources: [notesResource],
      scopes: mcpScopes,
    },
    'Claude Code',
  ),
};

/** An MCP client that runs on the web: the redirect goes back to its own site. */
export const McpVerifiedWebClient: Story = {
  args: story(
    {
      clientHost: 'chatgpt.com',
      redirectHost: 'chatgpt.com',
      verified: true,
      resources: [notesResource],
      scopes: mcpScopes,
    },
    'ChatGPT',
  ),
};

/** An unverified MCP client under every warning: its host is drawn as prominently as the title. */
export const McpUnverifiedWithWarnings: Story = {
  args: story({
    clientHost: 'notes.acme-login.example',
    redirectHost: 'localhost',
    redirectLoopback: true,
    prominentHost: 'client',
    warnings,
    resources: [notesResource],
    scopes: mcpScopes,
  }),
};

/**
 * A server that predates required scopes and resource scopes: every requested
 * scope is a switch in the list, with the server's older wording, and the
 * resource card shows only the resource.
 */
export const OldServer: Story = {
  args: story(
    {
      clientHost: 'claude.ai',
      redirectHost: 'localhost',
      redirectLoopback: true,
      verified: true,
      resources: [{ uri: 'https://notes.example/mcp', name: 'Sample notes' }],
      scopes: [
        { scope: 'openid', label: 'Sign in', description: 'Confirm your identity', granted: true },
        { scope: 'email', label: 'Email', description: 'View your email address', granted: true },
        { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)', granted: true },
        { scope: 'mcp', label: 'mcp', granted: true },
      ],
    },
    'Claude Code',
  ),
};

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
    resources: [{ uri: 'https://mcp.acme.example/a-resource-address-without-any-break-that-is-longer-than-the-screen' }],
    warnings: [...warnings.slice(3), { code: 'long_text', severity: 'notice', message: `Unbroken:${'x'.repeat(80)}` }],
  }),
};
