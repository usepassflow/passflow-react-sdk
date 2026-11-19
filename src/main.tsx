import ReactDOM from 'react-dom/client';
import { App } from './app';
import { AccountApp } from './dev-account';
import { HostedLogin } from './dev-hosted-login';
import { InAppSignInApp } from './dev-in-app-sign-in';
import { StepUpApp } from './dev-step-up';
import { TanStackHostApp } from './dev-tanstack-host';
import { TwoFactorChallengeApp } from './dev-two-factor-challenge';
import './styles/index.css';
import React from 'react';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');
// /tanstack/* is a TanStack Router app around the flow, /hosted/* the hosted login app's mount, /account an app's own
// page with no flow, /step-up an app page whose API asks for a step-up, /two-factor-challenge an app page with the
// SDK's TwoFactorChallenge, /in-app a page that swaps PassflowFlow for the LoginButton on sign-in; everything else is
// the plain demo.
const { pathname } = window.location;
const Host = pathname.startsWith('/tanstack')
  ? TanStackHostApp
  : pathname.startsWith('/hosted')
    ? HostedLogin
    : pathname.startsWith('/account')
      ? AccountApp
      : pathname.startsWith('/step-up')
        ? StepUpApp
        : pathname.startsWith('/two-factor-challenge')
          ? TwoFactorChallengeApp
          : pathname.startsWith('/in-app')
            ? InAppSignInApp
            : App;
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Host />
  </React.StrictMode>,
);
