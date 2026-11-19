import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * False on the server and during hydration, true from the render right after hydration and in any render that is
 * not a hydration. A session lives only in the browser, so what a component renders from it waits for this: the
 * server renders signed out, and the first client render must match it.
 */
export const useHydrated = (): boolean => useSyncExternalStore(subscribe, onClient, onServer);
