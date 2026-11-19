// Dev only (not in the package): an app's own page at /two-factor-challenge that drops in the SDK's TwoFactorChallenge
// after a password sign-in, for the Playwright checks in a real browser.
import { useState } from 'react';
import { TwoFactorChallenge } from '@/components/form';
import { PassflowProviderWrapper } from './app';

const ChallengePage = () => {
  const [verified, setVerified] = useState(false);
  if (verified) return <p>Signed in</p>;
  return <TwoFactorChallenge firstFactorMethod='password' onSuccess={() => setVerified(true)} />;
};

export const TwoFactorChallengeApp = () => (
  <PassflowProviderWrapper>
    <ChallengePage />
  </PassflowProviderWrapper>
);
