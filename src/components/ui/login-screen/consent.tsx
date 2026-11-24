import type { FC } from 'react';
import { Button } from '../button';
import { Icon } from '../icon';
import { Switch } from '../switch';
import { LoginAlert, LoginProgress, LoginScreenNotice } from './shared';
import type { LoginConsentState } from './types';

/**
 * The OIDC consent screen: which scopes an application is asking for, and the
 * two decisions a user can make about them.
 *
 * Every scope starts granted and can be switched off individually — the Allow
 * button submits the subset that is still on, so "Allow" never grants more than
 * what is visible on screen. Deny is a peer of Allow, not a hidden link: a
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

      {resources?.length ? (
        <div className='passflow-consent-resources'>
          <p id='passflow-consent-resources-label' className='passflow-login-screen-text'>
            Resources it will access
          </p>
          <ul className='passflow-consent-scopes' aria-labelledby='passflow-consent-resources-label'>
            {resources.map(({ uri, name }) => (
              <li key={uri} className='passflow-consent-scope'>
                {name ? <p className='passflow-login-screen-text'>{name}</p> : null}
                <p className='passflow-consent-scope-description passflow-consent-resource-uri'>{uri}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings?.map(({ code, severity, message }) => (
        <LoginAlert
          key={`${code} ${message}`}
          tone={severity === 'critical' || severity === 'high' ? 'error' : 'info'}
          message={message}
          testId={`consent-warning-${code}`}
        />
      ))}

      <LoginAlert message={error} />

      {scopes.length ? (
        <ul className='passflow-consent-scopes'>
          {scopes.map((item) => (
            <li key={item.scope} className='passflow-consent-scope' data-testid={`consent-scope-${item.scope}`}>
              <Switch label={item.label} checked={item.granted} disabled={busy} onChange={() => onToggleScope(item.scope)} />
              {item.description ? <p className='passflow-consent-scope-description'>{item.description}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
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
