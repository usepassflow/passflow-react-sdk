import { Passflow, parseUpgradeChallenge, type UpgradeFacade } from '@passflow/core';
import { act, render, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { UpgradeProvider } from '@/components/provider/upgrade-provider';
import { initialState, PassflowContext } from '@/context';
import { useUpgrade } from '@/hooks/use-upgrade';
import { appId, authTokens, installLandingEnvironment, type Network } from './support/federated-harness';

// The hosted login's step-up: the provider is given `passflow.hostedUpgrade`, which proves factors against the hosted
// session cookie, and the session exchange elevates through that facade directly.
const challenge = parseUpgradeChallenge(403, () => null, {
  error: 'upgrade_required',
  acr_values: '2',
  available_factors: ['totp'],
  sign_in_required: false,
})!;

type Settled = { kind: 'pending' } | { kind: 'elevated' } | { kind: 'rejected'; error: Error };
type Observed = { status?: string; settled: Settled };

let network: Network | undefined;
const instances: Passflow[] = [];

afterEach(() => {
  network?.restore();
  network = undefined;
  for (const instance of instances.splice(0)) instance.dispose();
});

const makePassflow = () => {
  const passflow = new Passflow({ url: 'https://auth.example.com', appId, parseQueryParams: false });
  instances.push(passflow);
  return passflow;
};

const elevate = (facade: UpgradeFacade, observed: Observed) => {
  observed.settled = { kind: 'pending' };
  facade.elevate(challenge, { kind: 'imperative' }).then(
    () => {
      observed.settled = { kind: 'elevated' };
    },
    (error: Error) => {
      observed.settled = { kind: 'rejected', error };
    },
  );
};

function StatusProbe({ observed }: { observed: Observed }) {
  observed.status = useUpgrade().status;
  return null;
}

/**
 * Elevates in its layout effect. As a sibling after the provider it runs once the provider's commit is done and
 * before any passive effect of that commit: the moment the exchange's answer can land in when an instance rebuild
 * has just committed.
 */
function ElevateOnCommit({ facade, observed }: { facade: UpgradeFacade; observed: Observed }) {
  useLayoutEffect(() => elevate(facade, observed), [facade, observed]);
  return null;
}

function HostedTree({
  passflow,
  observed,
  elevateOnCommit = false,
}: {
  passflow: Passflow;
  observed: Observed;
  elevateOnCommit?: boolean;
}) {
  return (
    <PassflowContext.Provider value={{ state: initialState, dispatch: () => undefined, passflow }}>
      <UpgradeProvider facade={passflow.hostedUpgrade} failures='caller'>
        <StatusProbe observed={observed} />
      </UpgradeProvider>
      {elevateOnCommit && <ElevateOnCommit facade={passflow.hostedUpgrade} observed={observed} />}
    </PassflowContext.Provider>
  );
}

describe('UpgradeProvider with the hosted step-up facade', () => {
  it('lets a replacement instance step up as soon as the render that brought it is committed', async () => {
    network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}` });
    const observed: Observed = { settled: { kind: 'pending' } };
    const first = makePassflow();
    const view = render(<HostedTree passflow={first} observed={observed} />);

    const replacement = makePassflow();
    view.rerender(<HostedTree passflow={replacement} observed={observed} elevateOnCommit />);
    await act(async () => {});

    expect(observed.settled).toEqual({ kind: 'pending' });
    await waitFor(() => expect(observed.status).toBe('challenged'));
  });

  it('keeps the prompt open when the instance signs in meanwhile', async () => {
    network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}` });
    const observed: Observed = { settled: { kind: 'pending' } };
    const passflow = makePassflow();
    render(<HostedTree passflow={passflow} observed={observed} />);

    act(() => elevate(passflow.hostedUpgrade, observed));
    await waitFor(() => expect(observed.status).toBe('challenged'));

    // Tokens stored for this app (another page of the same origin, say) are the instance's session, not the hosted one.
    act(() => passflow.setTokens(authTokens()));
    await act(async () => {});

    expect(observed.status).toBe('challenged');
    expect(observed.settled).toEqual({ kind: 'pending' });
  });
});
