import type { FC, PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';
import { Icon } from '../icon';
import type { LoginAccessScope, LoginConsentResource, LoginScreenNotice as LoginScreenNoticeProps } from './types';
import './login-screen.css';

/** `error` is the default; `info` is a neutral note that is not announced as an alert. */
export const LoginAlert: FC<{ message?: string | null; id?: string; tone?: 'error' | 'info'; testId?: string }> = ({
  message,
  id,
  tone = 'error',
  testId,
}) => {
  if (!message) return null;

  if (tone === 'info') {
    return (
      <div id={id} className='passflow-login-screen-note' role='status' data-testid={testId}>
        {message}
      </div>
    );
  }

  return (
    <div id={id} className='passflow-form-error' role='alert' data-testid={testId}>
      <Icon size='small' id='warning' type='general' className='icon-warning' decorative />
      <span className='passflow-form-error-text'>{message}</span>
    </div>
  );
};

/** For a code input locked while a request is in flight: gives focus back when the request ends. */
export const useFocusAfterBusy = (busy: boolean) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const wasBusy = useRef(busy);

  useEffect(() => {
    if (wasBusy.current && !busy) inputRef.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  return inputRef;
};

export const LoginDivider: FC<{ label: string }> = ({ label }) => (
  <div className='passflow-form-divider' aria-hidden='true'>
    <div className='passflow-form-divider__line-left' />
    <span className='passflow-form-divider__text'>{label}</span>
    <div className='passflow-form-divider__line-right' />
  </div>
);

export const LoginActionStack: FC<PropsWithChildren> = ({ children }) => (
  <div className='passflow-login-screen-actions'>{children}</div>
);

export const LoginProgress: FC<{ message: string }> = ({ message }) => (
  <div className='passflow-login-screen-status' role='status' aria-live='polite'>
    <div className='passflow-login-screen-spinner passflow-login-screen-spinner--small' aria-hidden='true' />
    <p className='passflow-login-screen-text passflow-login-screen-centered-text'>{message}</p>
  </div>
);

/** The resources an approval gives access to: each name with its address. */
export const LoginResources: FC<{ resources: LoginConsentResource[] }> = ({ resources }) => (
  <div className='passflow-consent-resources' data-testid='access-resources'>
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
);

/** The scopes an approval grants, for reading: nothing here can be switched off. */
export const LoginAccessScopes: FC<{ scopes: LoginAccessScope[] }> = ({ scopes }) => (
  <div className='passflow-consent-resources' data-testid='access-scopes'>
    <p id='passflow-access-scopes-label' className='passflow-login-screen-text'>
      Access it will get
    </p>
    <ul className='passflow-consent-scopes' aria-labelledby='passflow-access-scopes-label'>
      {scopes.map(({ scope, label, description }) => (
        <li key={scope} className='passflow-consent-scope' data-testid={`access-scope-${scope}`}>
          <p className='passflow-login-screen-text'>{label}</p>
          {description ? <p className='passflow-consent-scope-description'>{description}</p> : null}
        </li>
      ))}
    </ul>
  </div>
);

export const LoginScreenNotice: FC<LoginScreenNoticeProps> = ({
  code,
  appName,
  message,
  codeTestId,
  appNameTestId,
  resources,
  scopes,
}) => (
  <div className='passflow-login-screen-notice' role='note'>
    {code ? (
      <div className='passflow-login-screen-code' data-testid={codeTestId}>
        {code}
      </div>
    ) : null}
    <p className='passflow-login-screen-text passflow-login-screen-centered-text'>
      <span className='passflow-login-screen-app-name' data-testid={appNameTestId}>
        {appName}
      </span>{' '}
      {message}
    </p>
    {resources?.length ? <LoginResources resources={resources} /> : null}
    {scopes?.length ? <LoginAccessScopes scopes={scopes} /> : null}
  </div>
);
