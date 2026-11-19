// Dev only (not in the package): an app page at /in-app that shows PassflowFlow to a signed-out user and the
// LoginButton to a signed-in one, with a provider on the default router. The sign-in returns to this page's own
// address, written in full, for the Playwright check that a sign-in here updates the page without loading it again.
import { PassflowFlow } from '@/components/flow';
import { LoginButton } from '@/components/login-button';
import { PassflowProvider } from '@/components/provider';
import { useAuth } from '@/hooks';

const url = process.env.PASSFLOW_URL ?? 'http://localhost:5432';
const appId = process.env.PASSFLOW_APP_ID ?? 'test_app_id';

const InAppPage = () => {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <LoginButton /> : <PassflowFlow successAuthRedirect={`${window.location.origin}/in-app`} />;
};

export const InAppSignInApp = () => (
  <PassflowProvider url={url} appId={appId}>
    <InAppPage />
  </PassflowProvider>
);
