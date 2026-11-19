// Dev only (not in the package): an app's own page at /account, with no PassflowFlow. Signed out it offers the hosted
// sign-in; signed in it drops in the SDK's two-factor setup, for the Playwright checks in a real browser.
import { TwoFactorSetupForm } from '@/components/form';
import { useAuth, usePassflow } from '@/hooks';
import { PassflowProviderWrapper } from './app';

const AccountPage = () => {
  const { isSignedIn } = useAuth();
  const passflow = usePassflow();

  if (!isSignedIn) {
    return (
      <button type='button' onClick={() => void passflow.authRedirect()}>
        Sign in
      </button>
    );
  }
  return <TwoFactorSetupForm />;
};

export const AccountApp = () => (
  <PassflowProviderWrapper>
    <AccountPage />
  </PassflowProviderWrapper>
);
