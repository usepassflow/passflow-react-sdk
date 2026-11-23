import type {
  InternalStrategyChallenge,
  PassflowAuthOptions,
  PassflowPasswordlessResponse,
  PassflowPasswordPolicySettings,
  Providers,
} from '@passflow/core';
import { phone } from 'phone';
import type { LoginCredentialsValues } from '@/components/ui/login-screen/types';
import type { SignInOutcome } from '@/hooks/use-signin';
import type { AuthUiError } from '@/types';
import type { AuthMethods } from './get-auth-methods';
import { getPasswordlessData } from './get-form-labels';
import type { ModelContextTool, ModelContextToolResult } from './model-context';
import { emailRegex, passwordValidation } from './validation-schemas';

/** The form that registers the tools: it decides between `sign_in_password` and `sign_up_password`. */
export type AuthAgentFlow = 'sign-in' | 'sign-up';

export type AgentIdentityKind = 'email' | 'username' | 'phone';

export type AgentIdentity = { kind: AgentIdentityKind; value: string };

export type AgentToolAnswer = { text: string; isError?: boolean };

/** What the form does for each tool. A tool's request carries `{ agentTool: true }`; the form adds it. */
export type AuthAgentToolActions = {
  password?: (input: { identity: AgentIdentity; password: string }) => Promise<AgentToolAnswer>;
  startPasswordless?: (input: { identity: AgentIdentity }) => Promise<AgentToolAnswer>;
  completePasswordless?: (input: { challengeId: string; code: string }) => Promise<AgentToolAnswer>;
  startSocial?: (input: { provider: Providers }) => Promise<AgentToolAnswer>;
};

export type AuthAgentStatus = { signedIn: boolean; secondFactorPending: boolean };

export type AuthMethodsDescription = {
  flow: AuthAgentFlow;
  password: AgentIdentityKind[];
  passwordless: { identity: 'email' | 'phone'; challenge: InternalStrategyChallenge }[];
  /** True means: ask the user to click the passkey button. */
  passkey: boolean;
  social: string[];
};

export const AGENT_TOOL_TEXT = {
  signedIn: 'Signed in. The page is finishing the sign-in.',
  secondFactor: 'The sign-in needs a second factor. Ask the user to finish it on the page.',
  oneMoreStep: 'The sign-in needs one more step on the page. Ask the user to look at the page.',
  codeSent: (identifier: string, challengeId: string) =>
    `A code was sent to ${identifier}. Ask the user for it, then call complete_passwordless with challenge_id "${challengeId}" and the code.`,
  linkSent: (identifier: string) => `A sign-in link was sent to ${identifier}. The user must open it to finish.`,
  social: (provider: string) => `Opening ${provider} sign-in. The user finishes it on the provider's page.`,
  passkey: 'Ask the user to click the passkey button on the page. A passkey sign-in cannot be started by an agent.',
  statusSignedIn: 'Signed in.',
  statusSignedOut: 'Not signed in.',
  statusSecondFactor: 'A second factor is pending. The user must finish it on the page.',
  failed: 'Something went wrong. Try again.',
  argumentsNotObject: 'Arguments must be an object.',
  required: (name: string) => `${name} is required.`,
  identityNotEnabled: (kind: AgentIdentityKind) => `Signing in with ${kind} is not enabled for this app.`,
  providerNotEnabled: (provider: string) => `${provider} sign-in is not enabled for this app.`,
  passwordRules: (needs: string) => `The password does not meet this app's rules. It needs ${needs}.`,
} as const;

const passwordKinds = (authMethods: AuthMethods): AgentIdentityKind[] => {
  const kinds: AgentIdentityKind[] = [];
  if (authMethods.internal.email.password) kinds.push('email');
  if (authMethods.internal.username.password) kinds.push('username');
  if (authMethods.internal.phone.password) kinds.push('phone');
  return kinds;
};

// One entry per identity, with the challenge the form starts for it (a code wins over a link, as on screen).
const passwordlessMethods = (authMethods: AuthMethods): AuthMethodsDescription['passwordless'] => {
  const methods: AuthMethodsDescription['passwordless'] = [];
  const email = getPasswordlessData(authMethods, 'email_or_username')?.challengeType;
  const phoneChallenge = getPasswordlessData(authMethods, 'phone')?.challengeType;
  if (email) methods.push({ identity: 'email', challenge: email });
  if (phoneChallenge) methods.push({ identity: 'phone', challenge: phoneChallenge });
  return methods;
};

/** The methods the app has enabled, as `list_auth_methods` reports them. */
export const describeAuthMethods = (authMethods: AuthMethods, flow: AuthAgentFlow): AuthMethodsDescription => ({
  flow,
  password: passwordKinds(authMethods),
  passwordless: passwordlessMethods(authMethods),
  passkey: authMethods.passkey,
  social: [...authMethods.fim.providers],
});

/** Marks the requests an agent tool causes. A human's requests carry no options. */
export const AGENT_TOOL_OPTIONS: PassflowAuthOptions = { agentTool: true };

/** The values the credentials screen hands over for the same identifier, so both paths build the same payload. */
export const credentialsFromIdentity = (identity: AgentIdentity, password = ''): LoginCredentialsValues =>
  identity.kind === 'phone'
    ? { method: 'phone', emailOrUsername: '', phone: identity.value, password }
    : { method: 'email_or_username', emailOrUsername: identity.value, phone: '', password };

/** An email when it looks like one, a phone number when it starts with `+` and is valid, else a username. */
export const classifyIdentifier = (value: string): AgentIdentity => {
  const trimmed = value.trim();
  if (emailRegex.test(trimmed)) return { kind: 'email', value: trimmed };
  if (trimmed.startsWith('+') && phone(trimmed).isValid) return { kind: 'phone', value: trimmed };
  return { kind: 'username', value: trimmed };
};

/** The answer to a password sign-in or sign-up, or to a completed passwordless code. */
export const signInAnswer = (
  outcome: false | SignInOutcome | PassflowPasswordlessResponse,
  error: AuthUiError | null,
): AgentToolAnswer => {
  if (outcome === 'signed-in') return { text: AGENT_TOOL_TEXT.signedIn };
  if (outcome === 'two-factor-required') return { text: AGENT_TOOL_TEXT.secondFactor };
  if (error) return { text: error.message, isError: true };
  // No error and no session: the form moved to its email-code step, or a newer attempt replaced this one.
  return { text: AGENT_TOOL_TEXT.oneMoreStep };
};

/** The answer to a passwordless start. The match code is never put in it. */
export const passwordlessStartAnswer = (
  identifier: string,
  start: { challengeType?: InternalStrategyChallenge; response: false | SignInOutcome | PassflowPasswordlessResponse },
  error: AuthUiError | null,
): AgentToolAnswer => {
  const { challengeType, response } = start;
  if (typeof response === 'object' && response.challenge_id) {
    if (challengeType === 'otp') return { text: AGENT_TOOL_TEXT.codeSent(identifier, response.challenge_id) };
    if (challengeType === 'magic_link') return { text: AGENT_TOOL_TEXT.linkSent(identifier) };
  }
  return { text: error?.message ?? AGENT_TOOL_TEXT.failed, isError: true };
};

export const authStatusAnswer = (status: AuthAgentStatus): AgentToolAnswer => {
  if (status.secondFactorPending) return { text: AGENT_TOOL_TEXT.statusSecondFactor };
  return { text: status.signedIn ? AGENT_TOOL_TEXT.statusSignedIn : AGENT_TOOL_TEXT.statusSignedOut };
};

const passwordRuleNeeds = (code: string, policy: PassflowPasswordPolicySettings | null): string => {
  switch (code) {
    case 'length':
      return `at least ${policy?.min_password_length ?? 0} characters`;
    case 'uppercase':
      return 'an uppercase letter';
    case 'lowercase':
      return 'a lowercase letter';
    case 'number':
      return 'a number';
    case 'symbol':
      return 'a symbol';
    default:
      return code;
  }
};

/** The same password check the sign-up screen runs. `null` when the password passes. */
export const passwordPolicyAnswer = (
  policy: PassflowPasswordPolicySettings | null,
  password: string,
): AgentToolAnswer | null => {
  try {
    passwordValidation(policy).validateSync(password);
    return null;
  } catch (error) {
    const codes = (error as { errors?: string[] }).errors ?? [];
    const needs = codes.map((code) => passwordRuleNeeds(code, policy)).join(', ');
    return { text: AGENT_TOOL_TEXT.passwordRules(needs || 'a different password'), isError: true };
  }
};

type ToolDefinition<Name extends string> = {
  name: string;
  description: string;
  readOnly: boolean;
  /** Required string arguments, checked before `run`. */
  args?: Record<Name, { description: string; enum?: string[] }>;
  run: (args: Record<Name, string>) => Promise<AgentToolAnswer> | AgentToolAnswer;
};

const toResult = ({ text, isError }: AgentToolAnswer): ModelContextToolResult => ({
  content: [{ type: 'text', text }],
  ...(isError && { isError: true }),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// The browser does not check `inputSchema`, so each tool checks its own arguments and never rejects.
const readArgs = <Name extends string>(
  names: Name[],
  args: unknown,
): { values: Record<Name, string> } | { refusal: AgentToolAnswer } => {
  const values = {} as Record<Name, string>;
  if (names.length === 0) return { values };
  if (!isPlainObject(args)) return { refusal: { text: AGENT_TOOL_TEXT.argumentsNotObject, isError: true } };
  for (const name of names) {
    const value = args[name];
    if (typeof value !== 'string' || value.trim() === '')
      return { refusal: { text: AGENT_TOOL_TEXT.required(name), isError: true } };
    values[name] = value;
  }
  return { values };
};

const defineTool = <Name extends string = never>({
  name,
  description,
  readOnly,
  args,
  run,
}: ToolDefinition<Name>): ModelContextTool => {
  const specs = Object.entries(args ?? {}) as [Name, { description: string; enum?: string[] }][];
  const names = specs.map(([argName]) => argName);
  const properties = Object.fromEntries(
    specs.map(([argName, { description: argDescription, enum: values }]) => [
      argName,
      { type: 'string', description: argDescription, ...(values && { enum: values }) },
    ]),
  );

  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      ...(names.length > 0 && { required: names }),
      additionalProperties: false,
    },
    annotations: { readOnlyHint: readOnly },
    execute: async (input) => {
      try {
        const read = readArgs(names, input);
        if ('refusal' in read) return toResult(read.refusal);
        return toResult(await run(read.values));
      } catch {
        return toResult({ text: AGENT_TOOL_TEXT.failed, isError: true });
      }
    },
  };
};

const notAvailable: AgentToolAnswer = { text: AGENT_TOOL_TEXT.failed, isError: true };

const identifierDescription = (kinds: AgentIdentityKind[]) =>
  `The user's ${kinds.join(', ')}. A phone number starts with + (E.164).`;

/**
 * The WebMCP tools of a sign-in or sign-up form, for the methods the app has enabled only. `actions` is read at call
 * time, so a tool always runs the form's latest handlers.
 */
export const buildAuthAgentTools = ({
  flow,
  authMethods,
  getStatus,
  actions,
}: {
  flow: AuthAgentFlow;
  authMethods: AuthMethods;
  getStatus: () => AuthAgentStatus;
  actions: () => AuthAgentToolActions;
}): ModelContextTool[] => {
  const description = describeAuthMethods(authMethods, flow);
  const passwordless = description.passwordless;
  const passwordlessKinds = passwordless.map((method) => method.identity);
  const verb = flow === 'sign-in' ? 'Sign the user in' : 'Create an account for the user';

  const tools: ModelContextTool[] = [
    defineTool({
      name: 'list_auth_methods',
      description: `Lists the ${flow} methods this app has enabled, as JSON: password identifiers, passwordless methods, passkey and social providers.`,
      readOnly: true,
      run: () => ({ text: JSON.stringify(description) }),
    }),
    defineTool({
      name: 'get_auth_status',
      description: 'Tells whether the user is signed in, not signed in, or has a second factor pending.',
      readOnly: true,
      run: () => authStatusAnswer(getStatus()),
    }),
  ];

  if (description.password.length > 0) {
    const kinds = description.password;
    tools.push(
      defineTool({
        name: flow === 'sign-in' ? 'sign_in_password' : 'sign_up_password',
        description: `${verb} with an identifier and a password. Accepted identifiers: ${kinds.join(', ')}.`,
        readOnly: false,
        args: {
          identifier: { description: identifierDescription(kinds) },
          password: {
            description:
              flow === 'sign-in' ? "The user's password." : "The new account's password. It must meet the app's rules.",
          },
        },
        run: ({ identifier, password }) => {
          const identity = classifyIdentifier(identifier);
          if (!kinds.includes(identity.kind)) return { text: AGENT_TOOL_TEXT.identityNotEnabled(identity.kind), isError: true };
          const action = actions().password;
          return action ? action({ identity, password }) : notAvailable;
        },
      }),
    );
  }

  if (passwordless.length > 0) {
    tools.push(
      defineTool({
        name: 'start_passwordless',
        description: `${verb} without a password: sends a code or a sign-in link. Accepted identifiers: ${passwordlessKinds.join(', ')}.`,
        readOnly: false,
        args: { identifier: { description: identifierDescription(passwordlessKinds) } },
        run: ({ identifier }) => {
          const identity = classifyIdentifier(identifier);
          if (!(passwordlessKinds as AgentIdentityKind[]).includes(identity.kind))
            return { text: AGENT_TOOL_TEXT.identityNotEnabled(identity.kind), isError: true };
          const action = actions().startPasswordless;
          return action ? action({ identity }) : notAvailable;
        },
      }),
    );
  }

  if (passwordless.some((method) => method.challenge === 'otp')) {
    tools.push(
      defineTool({
        name: 'complete_passwordless',
        description: 'Finishes a passwordless sign-in with the code the user received, after start_passwordless.',
        readOnly: false,
        args: {
          challenge_id: { description: 'The challenge_id start_passwordless answered with.' },
          code: { description: 'The code the user received.' },
        },
        run: ({ challenge_id: challengeId, code }) => {
          const action = actions().completePasswordless;
          return action ? action({ challengeId: challengeId.trim(), code: code.trim() }) : notAvailable;
        },
      }),
    );
  }

  if (description.social.length > 0) {
    const providers = description.social;
    tools.push(
      defineTool({
        name: 'start_social',
        description: `${verb} with a social provider. The page opens the provider's sign-in, where the user finishes.`,
        readOnly: false,
        args: { provider: { description: 'The provider to use.', enum: providers } },
        run: ({ provider }) => {
          if (!providers.includes(provider)) return { text: AGENT_TOOL_TEXT.providerNotEnabled(provider), isError: true };
          const action = actions().startSocial;
          return action ? action({ provider: provider as Providers }) : notAvailable;
        },
      }),
    );
  }

  if (description.passkey) {
    tools.push(
      defineTool({
        name: 'sign_in_passkey',
        description: 'Passkey sign-in. An agent cannot start it: this tool says how the user starts it on the page.',
        readOnly: false,
        run: () => ({ text: AGENT_TOOL_TEXT.passkey }),
      }),
    );
  }

  return tools;
};
