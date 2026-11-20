// @vitest-environment node
import { PassflowFlow, PassflowProvider } from '@passflow/react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

// A framework that prerenders pages refuses a render that reads a random or the
// clock: the value would differ on every request. A server render of the flow
// must read neither.

afterEach(() => {
  vi.restoreAllMocks();
});

it('a server render of the provider and the sign-in screen reads no random value and no clock', () => {
  const sources = {
    'crypto.randomUUID': vi.spyOn(crypto, 'randomUUID'),
    'crypto.getRandomValues': vi.spyOn(crypto, 'getRandomValues'),
    'Math.random': vi.spyOn(Math, 'random'),
    'Date.now': vi.spyOn(Date, 'now'),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    renderToString(
      <PassflowProvider url='https://auth.example.test' appId='app_test'>
        <PassflowFlow location={{ pathname: '/signin', search: '' }} navigate={() => undefined} />
      </PassflowProvider>,
    );
  } catch {
    // Whether the render completes is the business of the server render tests; this one counts reads.
  }

  const called = Object.entries(sources)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name, spy]) => `${name} x${spy.mock.calls.length}`);
  expect(called).toEqual([]);
});
