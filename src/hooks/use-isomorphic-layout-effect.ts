import { useEffect, useLayoutEffect } from 'react';

/**
 * A layout effect in the browser and a plain effect on the server, where a layout effect does nothing and React 18
 * warns about it. Neither runs during a server render.
 */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
