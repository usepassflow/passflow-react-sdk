import { describe, expect, it } from 'vitest';
import { toDialogFactors, UPGRADE_FACTOR_CODE_CONTRACTS } from '../state-mapping';

const codeLength = (type: 'totp' | 'email_otp' | 'sms_otp' | 'recovery_codes') => {
  const [factor] = toDialogFactors([{ type, input: 'code' }]);
  return factor?.input === 'code' ? factor.code.maxLength : undefined;
};

describe('step-up code contracts', () => {
  it('lets an authenticator code be eight digits', () => {
    expect(codeLength('totp')).toBe(8);
    expect(UPGRADE_FACTOR_CODE_CONTRACTS.totp.maxLength).toBe(8);
  });

  it('keeps emailed and texted codes at six digits', () => {
    expect(codeLength('email_otp')).toBe(6);
    expect(codeLength('sms_otp')).toBe(6);
  });

  it('keeps every one-time code numeric', () => {
    for (const type of ['totp', 'email_otp', 'sms_otp'] as const) {
      expect(UPGRADE_FACTOR_CODE_CONTRACTS[type]).toMatchObject({
        inputMode: 'numeric',
        autoComplete: 'one-time-code',
      });
    }
  });

  it('caps a recovery code at the server maximum of sixteen', () => {
    expect(codeLength('recovery_codes')).toBe(16);
  });
});
