import { Passflow } from '@passflow/core';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAuth } from '@/hooks/use-auth';
import { useUser } from '@/hooks/use-user';
import { PassflowProvider } from '../passflow-provider';
import { jwt } from './support/federated-harness';

const url = 'https://auth.example.com';
const appA = 'app-a';
const appB = 'app-b';

const Session = () => {
  const { isSignedIn } = useAuth();
  const user = useUser();
  return (
    <>
      <p data-testid='signed-in'>{isSignedIn ? 'yes' : 'no'}</p>
      <p data-testid='user'>{JSON.stringify(user)}</p>
    </>
  );
};

const tree = (appId: string) => (
  <PassflowProvider url={url} appId={appId} parseQueryParams={false}>
    <Session />
  </PassflowProvider>
);

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('PassflowProvider when the appId prop changes', () => {
  it("drops app A's session for app B: signed out, and no user", async () => {
    new Passflow({ url, appId: appA, parseQueryParams: false }).setTokens({
      access_token: jwt({ type: 'access', aud: [appA], sub: 'user-a', email: 'a@example.com' }),
      refresh_token: jwt({ type: 'refresh', aud: [appA] }),
    });

    const view = render(tree(appA));
    expect(screen.getByTestId('signed-in').textContent).toBe('yes');
    expect(JSON.parse(screen.getByTestId('user').textContent ?? '{}')).toMatchObject({ id: 'user-a' });

    view.rerender(tree(appB));

    await waitFor(() => expect(screen.getByTestId('signed-in').textContent).toBe('no'));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('user').textContent ?? '')).toEqual({}));
  });
});
