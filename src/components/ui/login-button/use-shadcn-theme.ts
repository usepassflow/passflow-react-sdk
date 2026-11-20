import type { RefObject } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { readShadcnTheme } from './shadcn-theme';

/** The attributes a shadcn app switches its theme with, on `<html>` or `<body>`. */
const THEME_ATTRIBUTES = ['class', 'style', 'data-theme'];

/**
 * Sets the host's shadcn colours on `ref`'s element as the custom properties
 * its stylesheet reads, and sets them again when the theme switches: a class,
 * style or `data-theme` change on `<html>` or `<body>`, or a change of
 * `prefers-color-scheme`. Does nothing while `enabled` is false.
 */
export const useShadcnTheme = (ref: RefObject<HTMLElement | null>, enabled: boolean): void => {
  // A layout effect so the host's colours are in place before the first paint.
  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    let applied: string[] = [];
    const clear = () => {
      for (const name of applied) element.style.removeProperty(name);
    };
    const apply = () => {
      clear();
      const theme = readShadcnTheme(element);
      applied = Object.keys(theme);
      for (const [name, value] of Object.entries(theme)) element.style.setProperty(name, value);
    };
    apply();

    const observer = new MutationObserver(apply);
    for (const target of [document.documentElement, document.body]) {
      observer.observe(target, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
    }
    const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    colorScheme?.addEventListener('change', apply);

    return () => {
      observer.disconnect();
      colorScheme?.removeEventListener('change', apply);
      clear();
    };
  }, [ref, enabled]);
};
