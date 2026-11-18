// Dev only (not in the package): an app page at /step-up whose own API (`/api`) may answer with a step-up challenge, for
// the Playwright checks of the in-app step-up dialog in a real browser. It mounts a PassflowFlow under /step-up/auth, so
// the app has its own sign-in route; `?flow=0` leaves the flow out, and the app then signs in through the hosted login.
import { isUpgradeSignInRequired } from '@passflow/core';
import { useState } from 'react';
import { PassflowFlow } from '@/components/flow';
import { PassflowProvider } from './components/provider';

const params = new URLSearchParams(window.location.search);
const withFlow = params.get('flow') !== '0';

// How the last protected call settled: `sign-in-required` when core settled its step-up that way, else its status or
// the code of the error it rejected with. Also kept on the root element, which outlives this button once the app
// navigates away.
const settled = (result: string) => {
  document.documentElement.dataset.protectedResult = result;
  return result;
};

const ProtectedCall = () => {
  const [result, setResult] = useState('');
  if (window.location.pathname !== '/step-up') return null;
  return (
    <>
      <button
        type='button'
        onClick={() => {
          setResult('loading');
          void fetch('/api/protected').then(
            (response) => setResult(settled(isUpgradeSignInRequired(response) ? 'sign-in-required' : String(response.status))),
            (error: { code?: unknown }) => setResult(settled(typeof error?.code === 'string' ? error.code : 'failed')),
          );
        }}
      >
        Load protected
      </button>
      <p data-testid='protected-result'>{result}</p>
    </>
  );
};

export const StepUpApp = () => (
  <PassflowProvider
    url={window.location.origin}
    appId='step-up-app'
    backend='/api'
    upgrade={{ interceptFetch: true }}
    parseQueryParams={false}
  >
    <ProtectedCall />
    {withFlow ? <PassflowFlow pathPrefix='/step-up/auth' /> : null}
  </PassflowProvider>
);
