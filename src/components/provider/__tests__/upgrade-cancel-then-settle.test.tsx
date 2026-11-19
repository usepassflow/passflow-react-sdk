import { Passflow, parseUpgradeChallenge, type UpgradeChallenge } from '@passflow/core';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpgradeProvider } from '@/components/provider/upgrade-provider';
import type { UpgradeDialogProps } from '@/components/ui/upgrade-dialog';
import { initialState, PassflowContext } from '@/context';
import { type UseUpgradeResult, useUpgrade } from '@/hooks/use-upgrade';
import { appId, installLandingEnvironment, type Network } from './support/federated-harness';

const challengeOf = (factors: string[], signInRequired = false): UpgradeChallenge =>
  parseUpgradeChallenge(403, () => null, {
    error: 'upgrade_required',
    acr_values: '2',
    available_factors: factors,
    sign_in_required: signInRequired,
  })!;

type Observed = { upgrade?: UseUpgradeResult; dialog?: UpgradeDialogProps };

let network: Network | undefined;
const instances: Passflow[] = [];

afterEach(() => {
  network?.restore();
  network = undefined;
  for (const instance of instances.splice(0)) instance.dispose();
});

function Probe({ observed }: { observed: Observed }) {
  observed.upgrade = useUpgrade();
  return null;
}

const renderProvider = (onSignInRequired: () => void) => {
  network = installLandingEnvironment({ pathname: '/web/signin', search: `?appid=${appId}` });
  const passflow = new Passflow({ url: 'https://auth.example.com', appId, parseQueryParams: false });
  instances.push(passflow);
  const observed: Observed = {};
  render(
    <PassflowContext.Provider value={{ state: initialState, dispatch: () => undefined, passflow }}>
      <UpgradeProvider
        facade={passflow.hostedUpgrade}
        onSignInRequired={onSignInRequired}
        renderDialog={(props) => {
          observed.dialog = props;
          return null;
        }}
      >
        <Probe observed={observed} />
      </UpgradeProvider>
    </PassflowContext.Provider>,
  );
  return { passflow, observed };
};

/** Opens a step-up prompt and closes it the way the user does, with the dialog's cancel. */
const cancelOnePrompt = async (passflow: Passflow, observed: Observed) => {
  let settled = false;
  act(() => {
    passflow.hostedUpgrade
      .elevate(challengeOf(['totp']), { kind: 'imperative' })
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });
  });
  await waitFor(() => expect(observed.upgrade?.status).toBe('challenged'));
  act(() => observed.upgrade?.cancel());
  await waitFor(() => expect(settled).toBe(true));
  expect(observed.dialog?.open).toBe(false);
};

describe('UpgradeProvider after a cancelled step-up', () => {
  it('still sends a later sign-in-required step-up to onSignInRequired', async () => {
    const onSignInRequired = vi.fn();
    const { passflow, observed } = renderProvider(onSignInRequired);
    await cancelOnePrompt(passflow, observed);

    let rejected: unknown;
    await act(async () => {
      await passflow.hostedUpgrade.elevate(challengeOf([], true), { kind: 'imperative' }).catch((error) => {
        rejected = error;
      });
    });

    expect(rejected).toBeInstanceOf(Error);
    expect(onSignInRequired).toHaveBeenCalledTimes(1);
  });

  it('still shows a later unsatisfiable step-up', async () => {
    const { passflow, observed } = renderProvider(vi.fn());
    await cancelOnePrompt(passflow, observed);

    await act(async () => {
      await passflow.hostedUpgrade.elevate(challengeOf(['no-such-factor']), { kind: 'imperative' }).catch(() => undefined);
    });

    expect(observed.upgrade?.errorKind).toBe('unsatisfiable');
    expect(observed.dialog?.open).toBe(true);
    expect(observed.dialog?.state.kind).toBe('unsatisfiable');
  });
});
