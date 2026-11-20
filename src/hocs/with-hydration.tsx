/* eslint-disable react/jsx-props-no-spreading */
import type { ComponentType, FC } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Renders `Component` only once the page has hydrated. The URL and the session exist only in the browser, so a screen
 * that reads either during render renders nothing on the server and in the hydration render, and its content from
 * the next render. A render that is not a hydration shows the screen at once.
 */
export const withHydration = <P extends object>(Component: ComponentType<P>): FC<P> => {
  const Hydrated: FC<P> = (props) => {
    const hydrated = useHydrated();
    if (!hydrated) return null;
    return <Component {...props} />;
  };
  Hydrated.displayName = Component.displayName ?? Component.name;
  return Hydrated;
};
