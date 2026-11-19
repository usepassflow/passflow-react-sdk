import { afterEach, describe, expect, it } from 'vitest';
import { inAppPath, isSignInPage } from '../is-sign-in-page';

describe('isSignInPage', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('matches the sign-in page, whatever its spelling', () => {
    window.history.replaceState(null, '', '/web/signup');
    for (const target of [
      `${window.location.origin}/web/signin`,
      `${window.location.origin}/web/signin/`,
      `${window.location.origin}/web/signin?appid=x#y`,
      '/web/signin',
    ]) {
      expect(isSignInPage(target, '/web/signin')).toBe(true);
    }
  });

  it('does not match another page or another host', () => {
    expect(isSignInPage(`${window.location.origin}/web/signup`, '/web/signin')).toBe(false);
    expect(isSignInPage('https://app.example.test/web/signin', '/web/signin')).toBe(false);
    expect(isSignInPage('/signin', '/web/signin')).toBe(false);
  });
});

describe('inAppPath', () => {
  it('gives the path and query of a full address on this origin', () => {
    expect(inAppPath(`${window.location.origin}/`)).toBe('/');
    expect(inAppPath(`${window.location.origin}/account?tab=home#top`)).toBe('/account?tab=home');
  });

  it('keeps a path on this origin as it is', () => {
    expect(inAppPath('/account?tab=home')).toBe('/account?tab=home');
  });

  it('gives nothing for another origin or a non-web address', () => {
    expect(inAppPath('https://app.example.test/account')).toBeNull();
    expect(inAppPath('javascript:alert(1)')).toBeNull();
  });
});
