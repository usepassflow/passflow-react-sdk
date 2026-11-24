import type { LoginScreenProps } from '@/components/ui';
import type { ConsentInfo, ConsentResource, ConsentWarning, UseConsentProps } from '@/hooks/use-consent';

// Anchored on the whole host: `127.0.0.1.evil.com` and `localhost.evil.com` are remote.
const LOOPBACK_HOST = /^(?:(?:(?:[a-z0-9-]+\.)*localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?|::1)$/i;

/** The host that identifies an unverified client. Without a host of its own, its redirect's identifies it. */
const prominentHost = (info: ConsentInfo): 'client' | 'redirect' | undefined => {
  if (info.verified === true) return undefined;
  if (info.client_host) return 'client';
  return info.client_kind === 'dynamic' || info.client_kind === 'metadata_document' ? 'redirect' : undefined;
};

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** The items the screen can show, or undefined when there are none. The response body is not checked before this. */
const usable = <T>(list: unknown, read: (item: Partial<T>) => T | undefined): T[] | undefined => {
  if (!Array.isArray(list)) return undefined;
  const items = list.flatMap((item) => read(item ?? {}) ?? []);
  return items.length ? items : undefined;
};

const readResource = ({ uri, name }: Partial<ConsentResource>): ConsentResource | undefined =>
  isText(uri) ? { uri, name: isText(name) ? name : undefined } : undefined;

/** A message alone is enough: a warning with no code or an unknown severity still shows. */
const readWarning = ({ code, severity, message }: Partial<ConsentWarning>): ConsentWarning | undefined =>
  isText(message)
    ? {
        code: isText(code) ? code : 'unknown',
        severity: (isText(severity) ? severity.toLowerCase() : 'info') as ConsentWarning['severity'],
        message,
      }
    : undefined;

/**
 * Maps consent state onto the shared LoginScreen. Pure — every visual decision
 * lives in LoginScreen, every protocol decision lives in useConsent, and this
 * file is only the translation between them.
 */
export const getConsentLoginScreenProps = (consent: UseConsentProps): LoginScreenProps | null => {
  if (consent.status === 'loading') return null;

  if (consent.status === 'invalid') {
    return {
      chrome: {
        title: consent.error?.message ?? 'Consent request unavailable',
      },
      state: {
        kind: 'general-error',
        message: consent.error?.message,
        detail: consent.error?.description,
        actionLabel: 'Back to login',
        testId: 'consent-invalid',
        onAction: () => {
          window.location.href = '/web';
        },
      },
    };
  }

  if (consent.status === 'redirecting') {
    return {
      chrome: {
        title: 'Taking you back',
        subtitle: `Returning you to ${consent.info?.app_name || 'the application'}.`,
      },
      state: {
        kind: 'status',
        tone: 'success',
        message: 'Decision recorded',
        detail: 'You can close this page if it does not continue on its own.',
        testId: 'consent-redirecting',
      },
    };
  }

  const info = consent.info;
  if (!info) return null;

  const appName = info.app_name || info.client_id;
  const busy = consent.status === 'working';

  return {
    chrome: {
      title: `Allow ${appName} to access your account?`,
      subtitle: 'Choose what this application may use, then allow or deny.',
      // The app's own logo replaces the Passflow mark, which is what makes this
      // read as "THIS app is asking" rather than a generic Passflow screen.
      customLogo: info.app_logo_url || undefined,
      customLogoAlt: `${appName} logo`,
    },
    state: {
      kind: 'consent',
      appName,
      clientHost: info.client_host || undefined,
      redirectHost: info.redirect_host || undefined,
      prominentHost: prominentHost(info),
      verified: info.verified === true || undefined,
      redirectLoopback: info.redirect_host ? LOOPBACK_HOST.test(info.redirect_host) : undefined,
      resources: usable(info.resources, readResource),
      warnings: usable(info.warnings, readWarning),
      scopes: info.requested_scopes.map((scope) => {
        const meta = consent.scopeMetadata(scope);
        return {
          scope,
          label: meta.label || scope,
          description: meta.description || undefined,
          granted: consent.grantedScopes.includes(scope),
        };
      }),
      busy,
      error: consent.error?.message,
      allowLabel: 'Allow',
      denyLabel: 'Deny',
      busyLabel: 'Submitting…',
      testId: 'consent-screen',
      allowTestId: 'consent-allow',
      denyTestId: 'consent-deny',
      appNameTestId: 'consent-app-name',
      onToggleScope: consent.toggleScope,
      onAllow: () => void consent.allow(),
      onDeny: () => void consent.deny(),
    },
  };
};
