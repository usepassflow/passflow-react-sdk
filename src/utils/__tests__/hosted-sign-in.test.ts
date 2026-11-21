import type { Passflow } from '@passflow/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHostedSignIn, takeReturnPath } from '../hosted-sign-in';

const returnKey = 'passflow_return_to';

const fakePassflow = () => {
  const authRedirect = vi.fn(async () => undefined);
  return { passflow: { authRedirect } as unknown as Passflow, authRedirect };
};

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/account/settings?tab=2#x');
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('startHostedSignIn', () => {
  it('with no redirect URL, asks to come back to the app root and remembers the page', async () => {
    const { passflow, authRedirect } = fakePassflow();

    await startHostedSignIn(passflow);

    expect(authRedirect).toHaveBeenCalledWith({ redirectUrl: `${window.location.origin}/` });
    expect(sessionStorage.getItem(returnKey)).toBe('/account/settings?tab=2#x');
  });

  it('keeps the other options it is given', async () => {
    const { passflow, authRedirect } = fakePassflow();

    await startHostedSignIn(passflow, { url: 'https://auth.example.com', scopes: ['openid'] });

    expect(authRedirect).toHaveBeenCalledWith({
      url: 'https://auth.example.com',
      scopes: ['openid'],
      redirectUrl: `${window.location.origin}/`,
    });
  });

  it('passes an explicit redirect URL through unchanged and remembers nothing', async () => {
    const { passflow, authRedirect } = fakePassflow();
    const options = { redirectUrl: 'https://app.example.com/callback', scopes: ['email'] };

    await startHostedSignIn(passflow, options);

    expect(authRedirect).toHaveBeenCalledWith(options);
    expect(sessionStorage.getItem(returnKey)).toBeNull();
  });

  it('with an explicit redirect URL, forgets a page an abandoned sign-in stored', async () => {
    const { passflow, authRedirect } = fakePassflow();
    sessionStorage.setItem(returnKey, '/stale/page');

    await startHostedSignIn(passflow, { redirectUrl: 'https://app.example.com/callback' });

    expect(authRedirect).toHaveBeenCalledWith({ redirectUrl: 'https://app.example.com/callback' });
    expect(sessionStorage.getItem(returnKey)).toBeNull();
  });

  it('still signs in when sessionStorage refuses the write', async () => {
    const { passflow, authRedirect } = fakePassflow();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    await startHostedSignIn(passflow);

    expect(authRedirect).toHaveBeenCalledWith({ redirectUrl: `${window.location.origin}/` });
  });

  it('passes on a rejection of the redirect', async () => {
    const { passflow, authRedirect } = fakePassflow();
    authRedirect.mockRejectedValueOnce(new Error('settings unavailable'));

    await expect(startHostedSignIn(passflow)).rejects.toThrow('settings unavailable');
  });
});

describe('takeReturnPath', () => {
  it('gives nothing when no page was remembered', () => {
    expect(takeReturnPath()).toBeUndefined();
  });

  it('gives the remembered page once, then nothing', () => {
    sessionStorage.setItem(returnKey, '/account/settings?tab=2#x');

    expect(takeReturnPath()).toBe('/account/settings?tab=2#x');
    expect(sessionStorage.getItem(returnKey)).toBeNull();
    expect(takeReturnPath()).toBeUndefined();
  });

  it.each(['https://evil.example/x', '//evil.example/x', '/\\evil.example/x', 'javascript:alert(1)', 'account', ''])(
    'gives the app root for %j, which is not a path on this origin',
    (stored) => {
      sessionStorage.setItem(returnKey, stored);

      expect(takeReturnPath()).toBe('/');
      expect(sessionStorage.getItem(returnKey)).toBeNull();
    },
  );

  it('gives nothing when sessionStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(takeReturnPath()).toBeUndefined();
  });
});
