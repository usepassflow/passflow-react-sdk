import type { LoginConsentResource, LoginConsentScope, LoginScreenProps } from '@/components/ui';
import type {
  ConsentInfo,
  ConsentResource,
  ConsentResourceScope,
  ConsentScopeMetadata,
  ConsentWarning,
  UseConsentProps,
} from '@/hooks/use-consent';
import { isText, readResource, usable } from '../access-lists';

// Anchored on the whole host: `127.0.0.1.evil.com` and `localhost.evil.com` are remote.
const LOOPBACK_HOST = /^(?:(?:(?:[a-z0-9-]+\.)*localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?|::1)$/i;

/** The host that identifies an unverified client. Without a host of its own, its redirect's identifies it. */
const prominentHost = (info: ConsentInfo): 'client' | 'redirect' | undefined => {
  if (info.verified === true) return undefined;
  if (info.client_host) return 'client';
  return info.client_kind === 'dynamic' || info.client_kind === 'metadata_document' ? 'redirect' : undefined;
};

/** A message alone is enough: a warning with no code or an unknown severity still shows. */
const readWarning = ({ code, severity, message }: Partial<ConsentWarning>): ConsentWarning | undefined =>
  isText(message)
    ? {
        code: isText(code) ? code : 'unknown',
        severity: (isText(severity) ? severity.toLowerCase() : 'info') as ConsentWarning['severity'],
        message,
      }
    : undefined;

/** A scope as the server labels it; a scope with no label shows its own name. */
const readScope =
  (granted: string[]) =>
  ({
    scope,
    label,
    description,
    required,
  }: Partial<ConsentScopeMetadata | ConsentResourceScope>): LoginConsentScope | undefined =>
    isText(scope)
      ? {
          scope,
          label: isText(label) ? label : scope,
          description: isText(description) ? description : undefined,
          required: required === true || undefined,
          granted: granted.includes(scope),
        }
      : undefined;

const readConsentResource =
  (granted: string[]) =>
  (item: Partial<ConsentResource>): LoginConsentResource | undefined => {
    const resource = readResource(item);
    return resource ? { ...resource, scopes: usable(item.scopes, readScope(granted)) } : undefined;
  };

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
      resources: usable(info.resources, readConsentResource(consent.grantedScopes)),
      warnings: usable(info.warnings, readWarning),
      // The server lists these in display order and leaves out what it shows
      // inside a resource card or not at all; a scope it leaves out stays granted.
      scopes: usable(info.scope_metadata, readScope(consent.grantedScopes)) ?? [],
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
