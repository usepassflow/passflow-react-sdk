import type { AuthRedirectOptions, Passflow } from '@passflow/core';

const returnPathKey = 'passflow_return_to';

/**
 * Starts the hosted sign-in. With no `redirectUrl`, the hosted login sends the
 * browser back to the origin root, `${origin}/`, and the page the user started
 * on waits in sessionStorage until `takeReturnPath()` reads it. The root works
 * because the provider takes the sign-in return on whatever page it mounts on,
 * and an app served from the origin root is loaded at `/` with or without an SPA
 * fallback. An app served under a sub-path is not at `/`: it passes its own
 * `redirectUrl`, such as `${origin}/app/`.
 *
 * A `redirectUrl` the caller gives is used as it is, and any page an earlier,
 * abandoned sign-in stored is forgotten, so that landing goes nowhere else.
 */
export const startHostedSignIn = (passflow: Passflow, options?: AuthRedirectOptions): Promise<void> => {
  if (options?.redirectUrl) {
    try {
      sessionStorage.removeItem(returnPathKey);
    } catch {}
    return passflow.authRedirect(options);
  }
  const { pathname, search, hash, origin } = window.location;
  try {
    sessionStorage.setItem(returnPathKey, pathname + search + hash);
  } catch {}
  return passflow.authRedirect({ ...options, redirectUrl: `${origin}/` });
};

/**
 * The stored value as a path on this origin, with dot segments resolved, or
 * undefined. The check runs on the resolved path: `/..//evil.example` resolves
 * to `//evil.example`, which a browser reads as another host. A `\` anywhere is
 * refused, since browsers read it as `/`.
 */
const rootRelativePath = (value: string): string | undefined => {
  if (!value.startsWith('/') || value.includes('\\')) return undefined;
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return undefined;
  }
  if (url.origin !== window.location.origin || url.pathname.startsWith('//')) return undefined;
  return url.pathname + url.search + url.hash;
};

/**
 * Reads and forgets the page stored by `startHostedSignIn()`. Undefined when
 * none is stored; `/` when the stored value is not a path on this origin.
 */
export const takeReturnPath = (): string | undefined => {
  let value: string | null;
  try {
    value = sessionStorage.getItem(returnPathKey);
    sessionStorage.removeItem(returnPathKey);
  } catch {
    return undefined;
  }
  if (value === null) return undefined;
  return rootRelativePath(value) ?? '/';
};
