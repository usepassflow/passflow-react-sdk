import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const passflow = {
  getTotpDigits: vi.fn(),
  verifyTwoFactor: vi.fn(),
  useTwoFactorRecoveryCode: vi.fn(),
  isTwoFactorVerificationRequired: vi.fn(() => true),
};

vi.mock('@/hooks/use-passflow', () => ({
  usePassflow: () => passflow,
}));

import { TwoFactorVerifyForm } from '..';

const boxes = (container: HTMLElement) => container.querySelectorAll('.passflow-field-otp-slots .passflow-field-otp');

describe('TwoFactorVerifyForm code length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passflow.getTotpDigits.mockReturnValue(8);
    passflow.verifyTwoFactor.mockResolvedValue({ success: true });
  });

  it("shows as many code boxes as core's TOTP digit count", () => {
    const { container } = render(<TwoFactorVerifyForm onSuccess={vi.fn()} />);

    expect(boxes(container)).toHaveLength(8);
    expect(screen.getByLabelText('Verification code')).toHaveAttribute('maxlength', '8');
  });

  it('submits by itself once all eight digits are typed', async () => {
    const onSuccess = vi.fn();
    render(<TwoFactorVerifyForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '12345678' } });

    await waitFor(() => expect(passflow.verifyTwoFactor).toHaveBeenCalledTimes(1));
    expect(passflow.verifyTwoFactor).toHaveBeenCalledWith('12345678', undefined);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('lets an explicit numInputs win over the digit count from core', () => {
    const { container } = render(<TwoFactorVerifyForm onSuccess={vi.fn()} numInputs={6} />);

    expect(boxes(container)).toHaveLength(6);
    expect(screen.getByLabelText('Verification code')).toHaveAttribute('maxlength', '6');
  });
});
