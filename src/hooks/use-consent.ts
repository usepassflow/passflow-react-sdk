import { useCallback, useEffect, useMemo, useState } from 'react';
import { submitFormPost } from '@/utils/form-post';
import { isSafeTarget } from '@/utils/safe-target';

/**
 * The OIDC consent decision, as a hook.
 *
 * The URL is the bearer. `consent_challenge_id` identifies the consent step the
 * server staged for the user who just signed in, and that id is handed only to
 * this browser, in the redirect that ends sign-in. Possessing it is what
 * authorizes reading the staged request — there is no Authorization header on
 * the GET. The server hands back a `csrf_token` with the request metadata, and
 * every state-changing POST must carry it back in `X-Passflow-CSRF`. That token
 * is the only thing separating a real decision from one a third-party page
 * forged on the user's behalf, so it is never optional and never cached across
 * challenges.
 *
 * The decision endpoints answer with a discriminated response rather than a
 * redirect status, because the OIDC `response_mode` decides HOW the user gets
 * back to the client: `query` is an ordinary navigation, `form_post` must be a
 * POST with the parameters in a form body (they cannot go in a URL). The server
 * knows which; the client just executes what it is told.
 */

export type ConsentScopeMetadata = {
  scope: string;
  label: string;
  description: string;
  /** Always granted, with no switch. A server that does not send it means a switch. */
  required?: boolean;
};

/** A scope the application asks for on one resource. */
export type ConsentResourceScope = {
  scope: string;
  label: string;
  description?: string;
  required?: boolean;
  /** Where the switch starts. Only `false` starts it off. */
  default_on?: boolean;
};

/** An API the application asks to reach. */
export type ConsentResource = {
  uri: string;
  name?: string;
  scopes?: ConsentResourceScope[] | null;
};

/** What the server found out about the application. `message` is localized and ready to show. */
export type ConsentWarning = {
  code: string;
  severity: 'critical' | 'high' | 'notice' | 'info';
  message: string;
};

/** What GET /oidc/requests/{consent_challenge_id} hands the page to render itself. */
export type ConsentInfo = {
  client_id: string;
  app_name: string;
  app_logo_url: string;
  requested_scopes: string[];
  scope_metadata: ConsentScopeMetadata[];
  redirect_uri: string;
  state: string;
  response_mode: '' | 'query' | 'form_post';
  first_party: boolean;
  csrf_token: string;
  issuer?: string;
  client_kind?: 'registered' | 'dynamic' | 'metadata_document';
  /** The host of the URL that identifies the client. Only a `metadata_document` client has one. */
  client_host?: string;
  /** The host of `redirect_uri`, or its scheme when the scheme is a custom one. */
  redirect_host?: string;
  verified?: boolean;
  resources?: ConsentResource[] | null;
  /** Most severe first. */
  warnings?: ConsentWarning[] | null;
};

type DecisionResponse =
  | { kind: 'redirect'; url: string }
  | { kind: 'form_post'; action: string; fields: Record<string, string> };

type ApiErrorBody = {
  error?: string;
  error_description?: string;
};

export type ConsentStatus =
  /** Fetching the staged request. */
  | 'loading'
  /** Metadata in hand; awaiting the user's decision. */
  | 'ready'
  /** A decision is in flight. */
  | 'working'
  /** Decision accepted; the browser is on its way back to the client. */
  | 'redirecting'
  /** The link itself is unusable — missing, expired, or rejected id. Terminal. */
  | 'invalid';

export type ConsentError = {
  message: string;
  description?: string;
};

export type UseConsentProps = {
  status: ConsentStatus;
  info: ConsentInfo | null;
  /** The scopes still switched on. A subset of `info.requested_scopes`. */
  grantedScopes: string[];
  error: ConsentError | null;
  /** Metadata for a scope, falling back to the bare scope string. */
  scopeMetadata: (scope: string) => ConsentScopeMetadata;
  /** Switch one requested scope on or off before deciding. */
  toggleScope: (scope: string) => void;
  /** Grant the currently-selected subset. */
  allow: () => Promise<void>;
  /** Refuse the request outright (OAuth2 `access_denied`). */
  deny: () => Promise<void>;
};

/** A resource scope that is optional and that the server says starts switched off. */
const resourceScopes = (info: Pick<ConsentInfo, 'resources'>): Partial<ConsentResourceScope>[] =>
  (Array.isArray(info.resources) ? info.resources : []).flatMap((resource) =>
    Array.isArray(resource?.scopes) ? resource.scopes.map((item) => item ?? {}) : [],
  );

/** The resource scopes that some card marks required. Such a scope is required in every card it appears in. */
export const requiredResourceScopes = (info: Pick<ConsentInfo, 'resources'>): Set<string> =>
  new Set(
    resourceScopes(info)
      .filter((item) => item.required === true && typeof item.scope === 'string')
      .map((item) => item.scope as string),
  );

const startsOff = (info: ConsentInfo, scope: string): boolean =>
  !requiredResourceScopes(info).has(scope) &&
  resourceScopes(info).some((item) => item.scope === scope && item.default_on === false);

const readConsentChallengeId = (): string => new URLSearchParams(window.location.search).get('consent_challenge_id') ?? '';

const requestPath = (consentChallengeId: string): string => `/oidc/requests/${encodeURIComponent(consentChallengeId)}`;

export const useConsent = (): UseConsentProps => {
  const consentChallengeId = useMemo(readConsentChallengeId, []);

  const [status, setStatus] = useState<ConsentStatus>('loading');
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ConsentError | null>(null);

  useEffect(() => {
    if (!consentChallengeId) {
      setStatus('invalid');
      setError({
        message: 'Invalid consent link',
        description: 'This consent link is missing required information. Please return to the application and try again.',
      });
      return;
    }

    let cancelled = false;

    const fetchInfo = async (): Promise<void> => {
      try {
        const res = await fetch(requestPath(consentChallengeId), {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;

        if (!res.ok) {
          const body = ((await res.json().catch(() => ({}))) ?? {}) as ApiErrorBody;
          setStatus('invalid');
          setError({
            message: res.status >= 500 ? 'Something went wrong' : 'Consent request unavailable',
            description:
              body.error_description ||
              'We could not load this consent request. Please return to the application and try again.',
          });
          return;
        }

        const data = (await res.json()) as ConsentInfo;
        if (cancelled) return;

        setInfo(data);
        // Everything asked for starts granted, except a resource scope the
        // server starts off; the user switches OFF what they do not want.
        // Starting from none would train people to hit Allow on an empty grant
        // and wonder why the app is broken.
        setGranted(new Set(data.requested_scopes.filter((scope) => !startsOff(data, scope))));
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('invalid');
        setError({
          message: 'Connection error',
          description: err instanceof Error ? err.message : 'Could not reach the server. Please check your connection.',
        });
      }
    };

    void fetchInfo();

    return () => {
      cancelled = true;
    };
  }, [consentChallengeId]);

  const toggleScope = useCallback((scope: string): void => {
    setGranted((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
    // Changing the selection invalidates whatever the last failed submit said.
    setError(null);
  }, []);

  const decide = useCallback(
    async (decision: 'allow' | 'deny'): Promise<void> => {
      if (!info) return;

      setStatus('working');
      setError(null);

      const base = requestPath(consentChallengeId);
      const endpoint = decision === 'allow' ? `${base}/consent` : `${base}/reject`;
      const body =
        decision === 'allow'
          ? { granted_scopes: info.requested_scopes.filter((scope) => granted.has(scope)) }
          : { error: 'access_denied', error_description: 'User denied consent' };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Passflow-CSRF': info.csrf_token,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errBody = ((await res.json().catch(() => ({}))) ?? {}) as ApiErrorBody;
          setStatus('ready');
          setError({
            message: errBody.error_description || 'Could not submit your decision. Please try again.',
          });
          return;
        }

        const data = (await res.json()) as DecisionResponse;

        if (data.kind === 'redirect' && isSafeTarget(data.url)) {
          setStatus('redirecting');
          window.location.href = data.url;
          return;
        }

        if (data.kind === 'form_post' && isSafeTarget(data.action)) {
          setStatus('redirecting');
          submitFormPost(data.action, data.fields);
          return;
        }

        setStatus('ready');
        setError({ message: 'Unexpected response from server.' });
      } catch (err) {
        setStatus('ready');
        setError({
          message: err instanceof Error ? err.message : 'Could not reach the server. Please try again.',
        });
      }
    },
    [granted, info, consentChallengeId],
  );

  const allow = useCallback(() => decide('allow'), [decide]);
  const deny = useCallback(() => decide('deny'), [decide]);

  const metadataByScope = useMemo(() => new Map((info?.scope_metadata ?? []).map((meta) => [meta.scope, meta])), [info]);

  const scopeMetadata = useCallback(
    (scope: string): ConsentScopeMetadata => metadataByScope.get(scope) ?? { scope, label: scope, description: '' },
    [metadataByScope],
  );

  const grantedScopes = useMemo(() => (info?.requested_scopes ?? []).filter((scope) => granted.has(scope)), [granted, info]);

  return { status, info, grantedScopes, error, scopeMetadata, toggleScope, allow, deny };
};
