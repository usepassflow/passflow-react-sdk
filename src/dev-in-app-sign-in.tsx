// Dev only (not in the package): an app page at /in-app that shows PassflowFlow to a signed-out user and the
// LoginButton to a signed-in one, with a provider on the default router. The sign-in returns to a full address on this
// origin, for the Playwright checks of where a sign-in ends. `?router=hash|memory` picks the flow's history,
// `?router=controlled-hash` has the page own a hash history and pass the flow its location and navigate, as an app
// router in hash mode does, and `?to=` names the address; with no `to` it is this page.
import { useSyncExternalStore } from 'react';
import { PassflowFlow } from '@/components/flow';
import { createHashHistory } from '@/components/flow/passflow/flow-router';
import { LoginButton } from '@/components/login-button';
import { PassflowProvider } from '@/components/provider';
import { useAuth } from '@/hooks';

const url = process.env.PASSFLOW_URL ?? 'http://localhost:5432';
const appId = process.env.PASSFLOW_APP_ID ?? 'test_app_id';

const params = new URLSearchParams(window.location.search);
const router = params.get('router');
const routerType = router === 'hash' || router === 'memory' ? router : 'browser';
const target = params.get('to') ?? `${window.location.origin}/in-app`;

const appHistory = createHashHistory();

const ControlledHashFlow = () => {
  const location = useSyncExternalStore(appHistory.subscribe, appHistory.read);
  return <PassflowFlow location={location} navigate={appHistory.navigate} successAuthRedirect={target} />;
};

const InAppPage = () => {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return <LoginButton />;
  if (router === 'controlled-hash') return <ControlledHashFlow />;
  return <PassflowFlow routerType={routerType} successAuthRedirect={target} />;
};

export const InAppSignInApp = () => (
  <PassflowProvider url={url} appId={appId}>
    <InAppPage />
  </PassflowProvider>
);
