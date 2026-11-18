import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const passflow = {
  getTotpDigits: vi.fn(),
  twoFactor: {
    requestChallenge: vi.fn(),
    verifyV2: vi.fn(),
    switchToAlternative: vi.fn(),
  },
};

vi.mock('@/hooks/use-passflow', () => ({
  usePassflow: () => passflow,
}));

import { TwoFactorChallenge } from '..';

const boxes = (container: HTMLElement) => container.querySelectorAll('.passflow-field-otp-slots .passflow-field-otp');
const codeField = () => screen.getByRole('textbox', { name: 'Enter the verification code' });
const typeCode = (value: string) => fireEvent.change(codeField(), { target: { value } });
// Longer than the form's auto-submit delay.
const pastAutoSubmitDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, 300)));

const renderTotpChallenge = async () => {
  const view = render(<TwoFactorChallenge firstFactorMethod='password' onSuccess={vi.fn()} />);
  await screen.findByRole('textbox', { name: 'Enter the verification code' });
  return view;
};

describe('TwoFactorChallenge TOTP code length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passflow.getTotpDigits.mockReturnValue(8);
    passflow.twoFactor.requestChallenge.mockResolvedValue({
      challenge_id: 'totp-challenge',
      method: 'totp',
      alternative_methods: [],
    });
    passflow.twoFactor.verifyV2.mockResolvedValue({ access_token: 'access', refresh_token: 'refresh' });
  });

  it("shows as many code boxes as core's TOTP digit count", async () => {
    const { container } = await renderTotpChallenge();

    expect(boxes(container)).toHaveLength(8);
    expect(codeField()).toHaveAttribute('maxlength', '8');
  });

  it('keeps Verify disabled at six digits and enables it at eight', async () => {
    await renderTotpChallenge();
    const verify = screen.getByRole('button', { name: 'Verify' });

    typeCode('123456');
    expect(verify).toBeDisabled();

    typeCode('12345678');
    expect(verify).toBeEnabled();
  });

  it('submits by itself at eight digits, not at six', async () => {
    await renderTotpChallenge();

    typeCode('123456');
    await pastAutoSubmitDelay();
    expect(passflow.twoFactor.verifyV2).not.toHaveBeenCalled();

    typeCode('12345678');
    await waitFor(() => expect(passflow.twoFactor.verifyV2).toHaveBeenCalledTimes(1));
    expect(passflow.twoFactor.verifyV2).toHaveBeenCalledWith(
      expect.objectContaining({ challenge_id: 'totp-challenge', method: 'totp', response: '12345678' }),
    );
  });
});
