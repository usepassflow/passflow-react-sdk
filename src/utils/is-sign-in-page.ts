import { routes } from '@/context';
import { isValidUrl } from './validate-url';

const withoutTrailingSlash = (path: string) => path.replace(/\/+$/, '') || '/';

/** Whether a target is a path on this page's origin, as opposed to a full address or anything that could leave it. */
export const isSameOriginPath = (target: string): boolean => {
  if (isValidUrl(target)) return false;
  try {
    const url = new URL(target, window.location.href);
    // An address on another scheme can still name this origin, as a blob address does.
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === window.location.origin;
  } catch {
    return false;
  }
};

/**
 * The path, query and fragment a target names on this page's origin, or `null` when it leads elsewhere. A full
 * address on this origin counts: it is the same app, so getting there needs no new page load.
 */
export const inAppPath = (target: string): string | null => {
  if (isSameOriginPath(target)) return target;
  if (!isValidUrl(target)) return null;
  const url = new URL(target);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
};

/** Whether a sign-in's target is the sign-in page of this app, whatever its query or fragment. */
export const isSignInPage = (target: string, signInPath: string = routes.signin.path): boolean => {
  try {
    const url = new URL(target, window.location.href);
    return url.origin === window.location.origin && withoutTrailingSlash(url.pathname) === withoutTrailingSlash(signInPath);
  } catch {
    return false;
  }
};
