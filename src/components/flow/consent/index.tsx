import type { FC } from 'react';
import { LoginScreen } from '@/components/ui';
import { withHydration } from '@/hocs/with-hydration';
import { useConsent } from '@/hooks/use-consent';
import { getConsentLoginScreenProps } from './screen';

/**
 * OIDC consent controller, mounted by the host app on `/web/consent`.
 *
 * Standalone by design: it needs no PassflowProvider. The staged request is
 * addressed by `consent_challenge_id` on the URL and read with a same-origin
 * cookie, so there is no SDK client, no app settings lookup, and no token to
 * hold — which is also why mounting it inside the provider would be actively
 * wrong, since the provider's session-exchange probe would fire against a
 * challenge that is waiting for a human decision.
 */
const ConsentFlowScreen: FC = () => {
  const consent = useConsent();
  const screen = getConsentLoginScreenProps(consent);

  return screen ? <LoginScreen {...screen} /> : null;
};

export const ConsentFlow = withHydration(ConsentFlowScreen);
