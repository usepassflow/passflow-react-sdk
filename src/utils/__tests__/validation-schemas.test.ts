import type { PassflowPasswordPolicySettings } from '@passflow/core';
import { describe, expect, it } from 'vitest';
import { passwordValidation } from '../validation-schemas';

const policy = (overrides: Partial<PassflowPasswordPolicySettings> = {}): PassflowPasswordPolicySettings => ({
  restrict_min_password_length: true,
  min_password_length: 8,
  reject_compromised: false,
  enforce_password_strength: 'none',
  require_lowercase: false,
  require_uppercase: false,
  require_number: false,
  require_symbol: false,
  ...overrides,
});

const accepts = (settings: PassflowPasswordPolicySettings, password: string) =>
  passwordValidation(settings).isValidSync(password);

describe('passwordValidation', () => {
  describe('minimum length', () => {
    it('accepts a password shorter than min_password_length when the minimum is not restricted', () => {
      expect(accepts(policy({ restrict_min_password_length: false, min_password_length: 12 }), 'abc')).toBe(true);
    });
  });

  describe('letter case', () => {
    const upperOnly = policy({ require_uppercase: true, min_password_length: 1 });
    const lowerOnly = policy({ require_lowercase: true, min_password_length: 1 });

    it("accepts 'Ä' as an uppercase letter", () => {
      expect(accepts(upperOnly, 'äbcdefgÄ')).toBe(true);
    });

    it("accepts 'ä' as a lowercase letter", () => {
      expect(accepts(lowerOnly, 'ÄBCDEFGä')).toBe(true);
    });

    it('still refuses a password with no letter of the required case', () => {
      expect(accepts(upperOnly, 'äbcdefg1')).toBe(false);
      expect(accepts(lowerOnly, 'ÄBCDEFG1')).toBe(false);
    });
  });

  describe('require_symbol', () => {
    const symbolOnly = policy({ require_symbol: true, min_password_length: 1 });

    for (const symbol of ['!', "'", '|', '/', '=']) {
      it(`accepts a password whose only symbol is ${symbol}`, () => {
        expect(accepts(symbolOnly, `abcdefgh${symbol}`)).toBe(true);
      });
    }

    for (const symbol of ['~', '\\']) {
      it(`rejects a password whose only symbol is ${symbol}`, () => {
        expect(accepts(symbolOnly, `abcdefgh${symbol}`)).toBe(false);
      });
    }
  });
});
