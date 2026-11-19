import { type ParsedTokens, type Passflow, PassflowEvent, type PassflowSubscriber } from '@passflow/core';
import { useEffect, useState } from 'react';
import { useHydrated } from './use-hydrated';
import { usePassflow } from './use-passflow';

/** The signed-in user, from the tokens. Every field is absent when no one is signed in. */
export type PassflowUser = {
  /** The user id, the tokens' `sub`. */
  id?: string;
  email?: string;
  phone?: string;
};

const USER_EVENTS = [
  PassflowEvent.SignIn,
  PassflowEvent.Register,
  PassflowEvent.Refresh,
  PassflowEvent.SignOut,
  PassflowEvent.SessionExpired,
];

const claim = (tokens: ParsedTokens, read: (token: NonNullable<ParsedTokens['id_token']>) => string | undefined) => {
  const fromId = tokens.id_token ? read(tokens.id_token) : undefined;
  return fromId || (tokens.access_token ? read(tokens.access_token) : undefined) || undefined;
};

// The hosted code flow puts `email` in the access token and the embedded flow in the id token, so the id token is read
// first and the access token fills what it lacks.
const readUser = (passflow: Passflow): PassflowUser => {
  const tokens = passflow.isAuthenticated() ? passflow.getParsedTokens() : undefined;
  if (!tokens) return {};
  return {
    id: claim(tokens, (token) => token.sub),
    email: claim(tokens, (token) => token.email),
    phone: claim(tokens, (token) => token.phonenumber),
  };
};

const signedOut: PassflowUser = {};

const sameUser = (a: PassflowUser, b: PassflowUser) => a.id === b.id && a.email === b.email && a.phone === b.phone;

/** The signed-in user's id, email and phone. Re-renders on sign-in, sign-up, refresh, sign-out and session expiry. */
export const useUser = (): PassflowUser => {
  const passflow = usePassflow();
  const hydrated = useHydrated();
  const [user, setUser] = useState<PassflowUser>(() => readUser(passflow));

  useEffect(() => {
    const update = () => {
      const next = readUser(passflow);
      setUser((current) => (sameUser(current, next) ? current : next));
    };
    // The session may have changed between the first render and this subscription.
    update();
    const subscriber: PassflowSubscriber = { onAuthChange: update };
    passflow.subscribe(subscriber, USER_EVENTS);
    return () => passflow.unsubscribe(subscriber, USER_EVENTS);
  }, [passflow]);

  return hydrated ? user : signedOut;
};
