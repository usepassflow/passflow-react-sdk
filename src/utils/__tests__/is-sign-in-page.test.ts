import { afterEach, describe, expect, it } from 'vitest';
import { inAppPath, isSameOriginPath, isSignInPage } from '../is-sign-in-page';

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
  it('gives the path, query and fragment of a full address on this origin', () => {
    expect(inAppPath(`${window.location.origin}/`)).toBe('/');
    expect(inAppPath(`${window.location.origin}/account?tab=home#top`)).toBe('/account?tab=home#top');
  });

  it('keeps a path on this origin as it is', () => {
    expect(inAppPath('/account?tab=home')).toBe('/account?tab=home');
  });

  it('gives nothing for another origin or a non-web address', () => {
    expect(inAppPath('https://app.example.test/account')).toBeNull();
    expect(inAppPath('javascript:alert(1)')).toBeNull();
  });
});

describe('a target on another scheme that names this origin', () => {
  it.each([
    ['a blob address', () => `blob:${window.location.origin}/3f2a`],
    ['a blob address with a tab inside the scheme', () => `bl\tob:${window.location.origin}/3f2a`],
  ])('%s is not a path on this origin', (_name, target) => {
    expect(isSameOriginPath(target())).toBe(false);
    expect(inAppPath(target())).toBeNull();
  });
});
