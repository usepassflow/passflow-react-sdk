import { describe, expect, it } from 'vitest';
import { toDialogFactors, UPGRADE_FACTOR_CODE_CONTRACTS, upgradeRateLimitedMessage } from '../state-mapping';

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

describe('step-up rate-limit message', () => {
  it.each([
    [1, '1 second'],
    [45, '45 seconds'],
    [59, '59 seconds'],
    [60, '1 minute'],
    [61, '2 minutes'],
    [90, '2 minutes'],
    [900, '15 minutes'],
    [3599, '1 hour'],
    [3600, '1 hour'],
    [3601, '2 hours'],
    [86399, '1 day'],
    [86400, '1 day'],
    [172800, '2 days'],
    [172801, '3 days'],
  ])('names a %i-second wait as %s', (retryAfter, wait) => {
    expect(upgradeRateLimitedMessage(retryAfter, 'server text')).toBe(`Too many attempts. Try again in ${wait}.`);
  });

  it("uses the server's text when it names no wait", () => {
    expect(upgradeRateLimitedMessage(undefined, 'Slow down.')).toBe('Slow down.');
    expect(upgradeRateLimitedMessage(undefined, undefined)).toBe('Too many attempts. Try again later.');
  });
});
