import type { FetchLike, Passflow, ResponseInterceptorHost, WithAuthOptions } from '@passflow/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachAuth, registerUpgradeAuthInstance, releaseUpgradeAuthInstance, withAuth } from '../upgrade-auth';

const options: WithAuthOptions = { origins: ['https://api.example.com'] };

const fakeInstance = () => {
  const wrapped: FetchLike = vi.fn();
  const detach = vi.fn();
  const instance = {
    withAuth: vi.fn(() => wrapped),
    attachAuth: vi.fn(() => detach),
  } as unknown as Passflow;
  return { instance, wrapped, detach };
};

let registered: Passflow | null = null;

const register = (instance: Passflow) => {
  registered = instance;
  registerUpgradeAuthInstance(instance);
};

afterEach(() => {
  if (registered) releaseUpgradeAuthInstance(registered);
  registered = null;
});

describe('withAuth', () => {
  it('passes the options to the provider instance', () => {
    const { instance, wrapped } = fakeInstance();
    register(instance);
    const next: FetchLike = vi.fn();

    expect(withAuth(next, options)).toBe(wrapped);
    expect(instance.withAuth).toHaveBeenCalledWith(next, options);
  });

  it('still works with no options', () => {
    const { instance, wrapped } = fakeInstance();
    register(instance);

    expect(withAuth()).toBe(wrapped);
    expect(instance.withAuth).toHaveBeenCalledWith(undefined, undefined);
  });
});

describe('attachAuth', () => {
  it('passes the options to the provider instance', () => {
    const { instance, detach } = fakeInstance();
    register(instance);
    const axios = { interceptors: { response: { use: vi.fn() } } } as unknown as ResponseInterceptorHost;

    expect(attachAuth(axios, options)).toBe(detach);
    expect(instance.attachAuth).toHaveBeenCalledWith(axios, options);
  });
});
