import type { FC } from 'react';
import { Button } from '../button';
import { Icon } from '../icon';
import { Switch } from '../switch';
import { LoginAlert, LoginProgress, LoginScreenNotice } from './shared';
import type { LoginConsentResource, LoginConsentScope, LoginConsentState } from './types';

type ScopeControl = {
  busy: boolean;
  onToggleScope: (scope: string) => void;
};

/**
 * One scope: a plain line when it is required, otherwise a switch whose track
 * sits on the row's far edge, so every track on the screen shares one column.
 */
const ConsentScopeLine: FC<ScopeControl & { item: LoginConsentScope }> = ({ item, busy, onToggleScope }) =>
  item.required ? (
    <span className='passflow-consent-scope-text'>
      <span className='passflow-consent-scope-label'>{item.label}</span>
      {item.description ? <span className='passflow-consent-scope-description'>{item.description}</span> : null}
    </span>
  ) : (
    <Switch
      layout='row'
      label={item.label}
      description={item.description}
      checked={item.granted}
      disabled={busy}
      onChange={() => onToggleScope(item.scope)}
    />
  );

/** Each resource with its name, its address, and the scopes the application asks for on it. */
const ConsentResources: FC<ScopeControl & { resources: LoginConsentResource[] }> = ({ resources, ...control }) => (
  <div className='passflow-consent-resources' data-testid='access-resources'>
    <p id='passflow-consent-resources-label' className='passflow-login-screen-text'>
      Resources it will access
    </p>
    <ul className='passflow-consent-scopes' aria-labelledby='passflow-consent-resources-label'>
      {resources.map(({ uri, name, scopes }) => (
        <li key={uri} className='passflow-consent-scope' data-testid={`consent-resource-${uri}`}>
          {name ? <p className='passflow-login-screen-text'>{name}</p> : null}
          <p className='passflow-consent-scope-description passflow-consent-resource-uri'>{uri}</p>
          {scopes?.length ? (
            <ul className='passflow-consent-resource-scopes' aria-label={name ? `${name} access` : `${uri} access`}>
              {scopes.map((item) => (
                <li key={item.scope} className='passflow-consent-resource-scope' data-testid={`consent-scope-${item.scope}`}>
                  <ConsentScopeLine item={item} {...control} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  </div>
);

/**
 * The OIDC consent screen: which scopes an application is asking for, and the
 * two decisions a user can make about them.
 *
 * A required scope is a plain line: it is always granted. Every other scope is
 * a switch, starting in the state the server gives it, and the Allow button
 * submits the required scopes plus the switches that are still on. Resources
 * carry their own scopes inside their cards; one card below them holds the rest.
 * Warnings come first, so they are read before anything they warn about. Deny is a peer of Allow, not a hidden link: a
 * consent screen where refusing is harder than accepting is a dark pattern.
 * For the same reason neither button takes initial focus: a bare Enter on a
 * freshly loaded screen must not grant every requested scope.
 *
 * Warnings inform the decision and never take it: Allow stays enabled under all
 * of them.
 */
export const LoginConsent: FC<LoginConsentState> = ({
  appName,
  clientHost,
  redirectHost,
  prominentHost,
  verified = false,
  redirectLoopback = false,
  resources,
  warnings,
  scopes,
  prompt = 'wants to access your account.',
  busy = false,
  error,
  allowLabel = 'Allow',
  denyLabel = 'Deny',
  busyLabel = 'Submitting…',
  testId,
  allowTestId,
  denyTestId,
  appNameTestId,
  onToggleScope,
  onAllow,
  onDeny,
}) => (
  <div className='passflow-form' data-testid={testId} aria-busy={busy}>
    {clientHost || verified ? (
      <div className='passflow-consent-client'>
        {clientHost ? (
          <p
            className={prominentHost === 'client' ? 'passflow-consent-prominent-host' : 'passflow-consent-host'}
            data-testid='consent-client-host'
          >
            {clientHost}
          </p>
        ) : null}
        {verified ? (
          <div className='passflow-login-screen-success'>
            <Icon size='small' id='check' type='general' className='icon-success' decorative />
            <span className='passflow-login-screen-success-text' data-testid='consent-verified'>
              {redirectLoopback ? 'Verified client, sending access to an app on this computer' : 'Verified client'}
            </span>
          </div>
        ) : null}
      </div>
    ) : null}

    <LoginScreenNotice appName={appName} message={prompt} appNameTestId={appNameTestId} />

    <div className='passflow-form-container'>
      {warnings?.length ? (
        <div className='passflow-consent-warnings'>
          {warnings.map(({ code, severity, message }) => (
            <LoginAlert
              key={`${code} ${message}`}
              tone={severity === 'critical' || severity === 'high' ? 'error' : 'info'}
              message={message}
              testId={`consent-warning-${code}`}
            />
          ))}
        </div>
      ) : null}

      {redirectHost ? (
        <p className='passflow-login-screen-text passflow-consent-redirect'>
          You'll be sent to{' '}
          <span
            className={prominentHost === 'redirect' ? 'passflow-consent-prominent-host' : 'passflow-login-screen-app-name'}
            data-testid='consent-redirect-host'
          >
            {redirectHost}
          </span>
        </p>
      ) : null}

      {resources?.length ? <ConsentResources resources={resources} busy={busy} onToggleScope={onToggleScope} /> : null}

      <LoginAlert message={error} />

      {scopes.length ? (
        <div className='passflow-consent-scopes'>
          <ul className='passflow-consent-scope passflow-consent-scope-rows'>
            {scopes.map((item) => (
              <li key={item.scope} className='passflow-consent-resource-scope' data-testid={`consent-scope-${item.scope}`}>
                <ConsentScopeLine item={item} busy={busy} onToggleScope={onToggleScope} />
              </li>
            ))}
          </ul>
        </div>
      ) : resources?.some((resource) => resource.scopes?.length) ? null : (
        <p className='passflow-login-screen-hint'>This application is not requesting access to any of your data.</p>
      )}
    </div>

    {busy ? <LoginProgress message={busyLabel} /> : null}

    <div className='passflow-consent-actions'>
      <Button size='big' variant='primary' type='button' data-testid={allowTestId} disabled={busy} onClick={onAllow}>
        {allowLabel}
      </Button>
      <Button size='big' variant='outlined' type='button' data-testid={denyTestId} disabled={busy} onClick={onDeny}>
        {denyLabel}
      </Button>
    </div>
  </div>
);
