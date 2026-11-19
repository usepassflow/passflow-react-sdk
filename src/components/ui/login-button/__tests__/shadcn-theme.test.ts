import { describe, expect, it } from 'vitest';
import { readShadcnTheme, toCssColor } from '../shadcn-theme';

describe('toCssColor', () => {
  it('wraps a bare HSL triplet of an older shadcn theme in hsl()', () => {
    expect(toCssColor('222.2 47.4% 11.2%')).toBe('hsl(222.2 47.4% 11.2%)');
    expect(toCssColor(' 0 0% 100% ')).toBe('hsl(0 0% 100%)');
    expect(toCssColor('210deg 40% 98%')).toBe('hsl(210deg 40% 98%)');
    expect(toCssColor('222.2 47.4% 11.2% / 0.5')).toBe('hsl(222.2 47.4% 11.2% / 0.5)');
  });

  it('uses a complete colour of a Tailwind v4 theme as it is', () => {
    expect(toCssColor('oklch(0.205 0 0)')).toBe('oklch(0.205 0 0)');
    expect(toCssColor('#18181b')).toBe('#18181b');
    expect(toCssColor('hsl(222.2 47.4% 11.2%)')).toBe('hsl(222.2 47.4% 11.2%)');
    expect(toCssColor('rebeccapurple')).toBe('rebeccapurple');
  });

  it('returns nothing for a missing variable, so the stylesheet fallback applies', () => {
    expect(toCssColor('')).toBeUndefined();
    expect(toCssColor('   ')).toBeUndefined();
  });
});

describe('readShadcnTheme', () => {
  it('maps the host variables to the login button custom properties and skips missing ones', () => {
    const host = document.createElement('div');
    host.style.setProperty('--primary', '222.2 47.4% 11.2%');
    host.style.setProperty('--ring', 'oklch(0.708 0 0)');
    const button = document.createElement('button');
    host.append(button);
    document.body.append(host);

    expect(readShadcnTheme(button)).toEqual({
      '--passflow-login-button-background': 'hsl(222.2 47.4% 11.2%)',
      '--passflow-login-button-ring': 'oklch(0.708 0 0)',
    });

    host.remove();
  });
});
