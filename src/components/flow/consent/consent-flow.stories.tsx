import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ConsentInfo } from '@/hooks/use-consent';
import { ConsentFlow } from './index';

/**
 * The consent flow against `GET /oidc/requests/{consent_challenge_id}`.
 *
 * `Default` talks to whatever answers that address: add
 * `&consent_challenge_id=…` to the iframe URL; without it the flow shows its
 * invalid-link screen. The other stories answer the request themselves with a
 * fixed server payload. Allow and Deny there are not sent anywhere: the screen
 * shows an error that names the scopes Allow would have granted.
 */
const meta = {
  title: 'Flows/ConsentFlow',
  component: ConsentFlow,
  parameters: {
    controls: { disable: true },
  },
} satisfies Meta<typeof ConsentFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const challenge = 'story';

const requestPath = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.pathname : new URL(input.url).pathname;
};

/** Answers the consent request with `payload` while the story is shown. */
const serve =
  (payload: ConsentInfo): Story['beforeEach'] =>
  () => {
    const realFetch = window.fetch;
    const url = new URL(window.location.href);
    url.searchParams.set('consent_challenge_id', challenge);
    window.history.replaceState(window.history.state, '', url);

    window.fetch = async (input, init) => {
      const path = requestPath(input);
      if (path === `/oidc/requests/${challenge}`) return Response.json(payload);
      if (path.startsWith(`/oidc/requests/${challenge}/`)) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { granted_scopes?: string[] };
        const description = body.granted_scopes
          ? `Storybook sends no decision. Allow would grant: ${body.granted_scopes.join(', ') || 'nothing'}.`
          : 'Storybook sends no decision.';
        return Response.json({ error_description: description }, { status: 400 });
      }
      return realFetch(input, init);
    };

    return () => {
      window.fetch = realFetch;
      const restored = new URL(window.location.href);
      restored.searchParams.delete('consent_challenge_id');
      window.history.replaceState(window.history.state, '', restored);
    };
  };

const base: ConsentInfo = {
  client_id: 'https://claude.ai/oauth/claude-code-client-metadata',
  app_name: 'Claude Code',
  app_logo_url: '',
  requested_scopes: [],
  scope_metadata: [],
  redirect_uri: 'http://localhost:33418/callback',
  state: 'state-1',
  response_mode: 'query',
  first_party: false,
  csrf_token: 'csrf-story',
  client_kind: 'metadata_document',
  client_host: 'claude.ai',
  redirect_host: 'localhost',
  verified: true,
};

/** What a current server sends for an MCP request: `mcp` itself is requested but listed nowhere. */
const mcpRequest: Pick<ConsentInfo, 'requested_scopes' | 'scope_metadata' | 'resources'> = {
  requested_scopes: ['mcp', 'notes:read', 'notes:write', 'notes:share', 'openid', 'email', 'offline_access'],
  scope_metadata: [
    { scope: 'openid', label: 'Confirm who you are', description: "Lets the app know it's you", required: true },
    {
      scope: 'offline_access',
      label: 'Stay connected',
      description: "Keep access when you're not using it, until you remove it",
      required: true,
    },
    { scope: 'email', label: 'See your email address', description: '', required: false },
  ],
  resources: [
    {
      uri: 'https://notes.example/mcp',
      name: 'Sample notes',
      scopes: [
        { scope: 'notes:read', label: 'Read your notes', required: true, default_on: true },
        { scope: 'notes:write', label: 'Write and change your notes', required: false, default_on: true },
        { scope: 'notes:share', label: 'Share your notes with other people', required: false, default_on: false },
      ],
    },
  ],
};

/** An MCP client on the user's own computer: the redirect goes to localhost. */
export const McpVerifiedLocalClient: Story = {
  beforeEach: serve({ ...base, ...mcpRequest }),
};

/** An MCP client that runs on the web: the redirect goes back to its own site. */
export const McpVerifiedWebClient: Story = {
  beforeEach: serve({
    ...base,
    ...mcpRequest,
    client_id: 'https://chatgpt.com/oauth/client-metadata.json',
    app_name: 'ChatGPT',
    redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    client_host: 'chatgpt.com',
    redirect_host: 'chatgpt.com',
  }),
};

/** An unverified MCP client under every kind of warning. */
export const McpUnverifiedWithWarnings: Story = {
  beforeEach: serve({
    ...base,
    ...mcpRequest,
    client_id: 'https://notes.acme-login.example/client.json',
    app_name: 'Acme Notes',
    client_host: 'notes.acme-login.example',
    verified: false,
    warnings: [
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
    ],
  }),
};

/**
 * A server that predates required scopes and resource scopes: it lists every
 * requested scope, `mcp` included, with its older wording, and its resources
 * carry no scopes.
 */
export const OldServer: Story = {
  beforeEach: serve({
    ...base,
    requested_scopes: ['openid', 'email', 'offline_access', 'mcp'],
    scope_metadata: [
      { scope: 'openid', label: 'Sign in', description: 'Confirm your identity' },
      { scope: 'email', label: 'Email', description: 'View your email address' },
      { scope: 'offline_access', label: 'Offline access', description: 'Stay signed in (refresh tokens)' },
      { scope: 'mcp', label: 'mcp', description: '' },
    ],
    resources: [{ uri: 'https://notes.example/mcp', name: 'Sample notes' }],
  }),
};
